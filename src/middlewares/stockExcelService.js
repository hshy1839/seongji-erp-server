// services/stockExcelService.js
const XLSX = require('xlsx');
const mongoose = require('mongoose');
const Stock = require('../models/Stock');

// ===== utils =====
const s = v => (v === undefined || v === null ? '' : String(v).trim());
const norm = v => s(v).replace(/\s+/g, '').replace(/[()]/g, '').toLowerCase();

function toNumberSafe(v, fallback = null) {
  if (v === undefined || v === null || v === '') return fallback;
  const num = Number(String(v).replace(/[, ]/g, ''));
  return Number.isFinite(num) ? num : fallback;
}

// 과거 코드 호환용 별칭
const n = toNumberSafe;

// 안전 includes
const includesStr = (haystack, needle) =>
  s(haystack).toLowerCase().includes(s(needle).toLowerCase());
// ===== header aliases =====
// ✅ 이번 요구사항: 업로드 필수 컬럼은 "품번, 구분, 자재, 자재품번, 소요량" 5개만
//    - 업서트 키: division + partNumber + materialCode
//    - materialName, bomQtyPer 저장
//    - customer/carType/deliveryTo는 입력 없어도 '' 기본값 처리
const HEADER_ALIASES = {
  // 필수
  division:     ['구분','현수','내수','수출','division','type'],
  partNumber:   ['품번','품목코드','productcode','code','partnumber','oem','oemcode'],
  materialName: ['자재','자재명','품명','item','name','materialname'],
  materialCode: ['자재품번','자재코드','소재코드','materialcode','mcode','subcode'],
  bomQtyPer:    ['소요량','소요','bom','bomqty','perunit','1ea소요','1ea'],

  // 선택 (있으면 반영)
  currentQty:   ['재고수량','현재고','currentqty','stock','qty','수량'],
  openingQty:   ['기초재고','opening','openingqty'],
  inboundQty:   ['자재입고','입고','inbound','inboundqty'],
  usedQty:      ['생산실적','실적','사용수량','소요누적','used','usedqty'],
  remark:       ['비고','메모','remark'],
  uom:          ['단위','uom','unit'],

  // 과거 호환(있어도 무시되는 키 – 기본값 처리)
  customer:     ['발주처','거래처','주문처','customer','ordercompany','company'],
  carType:      ['차종','차명','cartype','vehicle','model'],
  deliveryTo:   ['납품처','납입처','shipto','deliveryto','destination'],
};

// ===== sheet pick =====
function pickSheet(workbook) {
  const prefer = ['DATA','data','stock','BOM','sill','SILL'];
  for (const name of prefer) {
    if (workbook.Sheets[name]) return workbook.Sheets[name];
  }
  return workbook.Sheets[workbook.SheetNames[0]];
}

// ===== header row detection & index =====
function findHeaderRow(rows) {
  const must = ['division','partNumber','materialName','materialCode','bomQtyPer'];
  const maxScan = Math.min(rows.length, 25);

  for (let r = 0; r < maxScan; r++) {
    const headerRaw = rows[r] || [];
    const header = headerRaw.map(h => s(h)); // 문자열화
    const hit = must.filter((k) =>
      HEADER_ALIASES[k].some(alias =>
        header.some(h => includesStr(h, alias))
      )
    );
    if (hit.length >= 3) return r;
  }
  return 0;
}


function buildHeaderIndex(headerRow) {
  const idx = {};
  const headerRaw = (headerRow || []).map(h => s(h)); // 문자열화

  Object.entries(HEADER_ALIASES).forEach(([key, aliases]) => {
    const found = headerRaw.findIndex(h =>
      (aliases || []).some(lbl => includesStr(h, lbl))
    );
    if (found >= 0) idx[key] = found;
  });
  return idx;
}


function debugHeaderInfo({ rows, headerRowIdx, headerRaw, headerNorm, H, aliases }) {
  const lines = [];
  lines.push('=== [Stock Excel Header Debug] =============================');
  lines.push(`- headerRowIdx: ${headerRowIdx}`);
  lines.push(`- headerRaw   : ${JSON.stringify(headerRaw)}`);
  lines.push(`- headerNorm  : ${JSON.stringify(headerNorm)}`);
  lines.push('- key → foundIndex / matchedAlias');
  Object.entries(aliases).forEach(([key, aliasList]) => {
    const foundIndex = H[key];
    if (foundIndex !== undefined) {
      const matchedAlias =
        aliasList.find(a => headerNorm.includes(norm(a))) || '(norm-match)';
      lines.push(`  · ${key.padEnd(12)}: ${String(foundIndex).padStart(2)} / "${matchedAlias}"`);
    } else {
      lines.push(`  · ${key.padEnd(12)}: (NOT FOUND)  tried=${JSON.stringify(aliasList)}`);
    }
  });
  const preview = rows.slice(headerRowIdx + 1, headerRowIdx + 4).map(r => (r || []).map(s));
  lines.push('- first data rows (preview up to 3):');
  preview.forEach((r, i) => lines.push(`  [${i}] ${JSON.stringify(r)}`));
  lines.push('===========================================================');
  return lines.join('\n');
}

/**
 * Excel 파싱 + 업서트
 * @param {Buffer} fileBuffer - 업로드된 엑셀 버퍼
 * @param {Object} options
 * @param {boolean} [options.dryRun=false] - 검증만 수행(디비 반영 안 함)
 * @param {boolean} [options.openAsOpening=true] - '재고수량'을 openingQty로 간주
 * @returns {Promise<{ok:boolean,totalRows:number,results:Array,errors:Array}>}
 */
// parseAndUpsertStocksFromExcel — 트랜잭션 제거 버전
const parseAndUpsertStocksFromExcel = async (
  fileBuffer,
  { dryRun = false, openAsOpening = true } = {}
) => {
  const wb = XLSX.read(fileBuffer, { type: 'buffer' });
  const ws = pickSheet(wb);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
  if (!rows.length) throw new Error('엑셀 시트가 비어있습니다.');

  const headerRowIdx = findHeaderRow(rows);
  const headerRaw  = (rows[headerRowIdx] || []).map(v => s(v));
  const headerNorm = headerRaw.map(norm);
  const H = buildHeaderIndex(headerRaw);
  const start = headerRowIdx + 1;

  const need = ['partNumber','division','materialName','materialCode','bomQtyPer'];
  const missing = need.filter(k => H[k] === undefined);
  if (missing.length) {
    console.error(debugHeaderInfo({ rows, headerRowIdx, headerRaw, headerNorm, H, aliases: HEADER_ALIASES }));
    const shortDump = headerRaw.map(h => `[${h}]`).join(', ');
    throw new Error(`필수 헤더 누락: ${missing.join(', ')}. 헤더행=${headerRowIdx}, 헤더=${shortDump} (서버 콘솔 참조)`);
  }

  const results = [];
  const errors  = [];
  let totalRows = rows.length - start;

  // 업서트용 배치
  const ops = [];
  const CHUNK = 500;

  for (let r = start; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every(v => v === undefined || v === null || String(v).trim() === '')) {
      totalRows--;
      continue;
    }

    try {
      const payload = {
        division:     s(row[H.division]),
        partNumber:   s(row[H.partNumber]),
        materialName: s(row[H.materialName]),
        materialCode: s(row[H.materialCode]),
        bomQtyPer:    n(row[H.bomQtyPer]) ?? 0,
        customer:     H.customer   !== undefined ? s(row[H.customer])   : '',
        carType:      H.carType    !== undefined ? s(row[H.carType])    : '',
        deliveryTo:   H.deliveryTo !== undefined ? s(row[H.deliveryTo]) : '',
        remark:       H.remark     !== undefined ? s(row[H.remark])     : '',
        uom:          H.uom        !== undefined ? s(row[H.uom])        : 'EA',
      };

      if (!payload.division || !payload.partNumber || !payload.materialCode || !payload.materialName) {
        throw new Error('필수 값 누락(구분, 품번, 자재, 자재품번)');
      }

      const currentFromExcel = H.currentQty !== undefined ? n(row[H.currentQty]) : null;
      const openingQty = H.openingQty !== undefined ? n(row[H.openingQty]) : null;
      const inboundQty = H.inboundQty !== undefined ? n(row[H.inboundQty]) : null;
      const usedQty    = H.usedQty    !== undefined ? n(row[H.usedQty])    : null;

      const setDoc = {
        materialName: payload.materialName,
        bomQtyPer:    payload.bomQtyPer,
        remark:       payload.remark,
        uom:          payload.uom || 'EA',
        customer:     payload.customer ?? '',
        carType:      payload.carType ?? '',
        deliveryTo:   payload.deliveryTo ?? '',
      };

      if (openAsOpening && currentFromExcel !== null) {
        setDoc.openingQty = currentFromExcel;
        setDoc.inboundQty = inboundQty ?? 0;
        setDoc.usedQty    = usedQty ?? 0;
      } else {
        if (openingQty !== null) setDoc.openingQty = openingQty;
        if (inboundQty !== null) setDoc.inboundQty = inboundQty;
        if (usedQty    !== null) setDoc.usedQty    = usedQty;
      }

      if (dryRun) {
        results.push({ rowIndex: r + 1, status: 'validated', key: `${payload.division}/${payload.partNumber}/${payload.materialCode}` });
        continue;
      }

      ops.push({
        updateOne: {
          filter: {
            division: payload.division,
            partNumber: payload.partNumber,
            materialCode: payload.materialCode,
          },
          update: {
            $setOnInsert: {
              division: payload.division,
              partNumber: payload.partNumber,
              materialCode: payload.materialCode,
            },
            $set: setDoc,
          },
          upsert: true,
        }
      });

      results.push({ rowIndex: r + 1, status: 'queued' });

      // 청크 단위 실행
      if (ops.length >= CHUNK) {
        try {
          const bw = await Stock.bulkWrite(ops, { ordered: false /* 개별 실패 무시하고 진행 */ });
          // 결과 요약을 원하면 bw.nUpserted/bw.nModified 등 사용 가능
        } catch (e) {
          // ordered:false에서도 스키마 검증 실패 등 상세 에러는 e.writeErrors에 담김
          (e?.writeErrors || []).forEach(we => {
            const idx = we?.index;
            const op  = ops[idx];
            errors.push({ rowIndex: '(chunk)', message: we?.errmsg || String(we) });
          });
        } finally {
          ops.length = 0; // 비우기
        }
      }
    } catch (e) {
      errors.push({ rowIndex: r + 1, message: e.message });
    }
  }

  // 남은 잔여 청크 flush
  if (!dryRun && ops.length) {
    try {
      const bw = await Stock.bulkWrite(ops, { ordered: false });
    } catch (e) {
      (e?.writeErrors || []).forEach(we => {
        errors.push({ rowIndex: '(tail)', message: we?.errmsg || String(we) });
      });
    }
  }

  return { ok: true, dryRun, totalRows, results, errors, openAsOpening };
};


// 외부에서 호출할 수 있게 export
exports.parseAndUpsertStocksFromExcel = parseAndUpsertStocksFromExcel;

// ===== Controller =====
exports.uploadStocksExcelController = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ ok:false, message:'파일이 없습니다.' });
    }
    const dryRun = String(req.query.dryRun || 'false').toLowerCase() === 'true';
    const openAsOpening = String(req.query.openAsOpening || 'true').toLowerCase() === 'true';

    // ✅ 스코프 버그 수정: exports.parseAndUpsertStocksFromExcel 로 호출
    const report = await exports.parseAndUpsertStocksFromExcel(req.file.buffer, { dryRun, openAsOpening });
    return res.json(report);
  } catch (err) {
    console.error('[uploadStocksExcelController]', err);
    res.status(500).json({ ok:false, message: err.message || '서버 오류' });
  }
};
