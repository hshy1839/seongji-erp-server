// services/stockExcelService.js
const XLSX = require('xlsx');
const mongoose = require('mongoose');
const Stock = require('../models/Stock');

// ===== utils =====
const s = v => (v === undefined || v === null ? '' : String(v).trim());
const norm = v => s(v).replace(/\s+/g, '').replace(/[()]/g, '').toLowerCase();

const n = v => {
  if (v === undefined || v === null || v === '') return null;
  const num = Number(String(v).replace(/[, ]/g, ''));
  return Number.isFinite(num) ? num : null;
};

// ===== header aliases =====
// 요구 헤더: 발주처, 차종, 납품처, 구분, 품번, 자재, 자재품번, 재고수량(=current), 소요량(bom)
const HEADER_ALIASES = {
  customer:     ['발주처','거래처','주문처','customer','ordercompany','company'],
  carType:      ['차종','차명','cartype','vehicle','model'],
  deliveryTo:   ['납품처','납입처','shipto','deliveryto','destination'],
  division:     ['구분','현수','내수','수출','division','type'],
  partNumber:   ['품번','품목코드','productcode','code','partnumber','oem','oemcode'],
  materialName: ['자재','자재명','품명','item','name','materialname'],
  materialCode: ['자재품번','자재코드','소재코드','materialcode','mcode','subcode'],
  currentQty:   ['재고수량','현재고','currentqty','stock','qty','수량'], // 업로드 파일의 '재고수량'
  bomQtyPer:    ['소요량','소요','bom','bomqty','perunit','1ea소요','1ea'],
  openingQty:   ['기초재고','opening','openingqty'],          // 선택 헤더
  inboundQty:   ['자재입고','입고','inbound','inboundqty'],   // 선택 헤더
  usedQty:      ['생산실적','실적','사용수량','소요누적','used','usedqty'], // 선택 헤더
  remark:       ['비고','메모','remark'],
  uom:          ['단위','uom','unit'],
};

// ===== sheet pick =====
function pickSheet(workbook) {
  const prefer = ['재고','stocks','stock','BOM','sill','SILL'];
  for (const name of prefer) {
    if (workbook.Sheets[name]) return workbook.Sheets[name];
  }
  return workbook.Sheets[workbook.SheetNames[0]];
}

// ===== header row detection & index =====
function findHeaderRow(rows) {
  const must = ['customer','carType','deliveryTo','division','partNumber','materialCode'];
  const maxScan = Math.min(rows.length, 25);
  for (let r = 0; r < maxScan; r++) {
    const header = (rows[r] || []).map(h => norm(h));
    const hit = must.filter(k => HEADER_ALIASES[k].some(a => header.includes(norm(a))));
    if (hit.length >= 3) return r;
  }
  return 0;
}

function buildHeaderIndex(headerRow) {
  const idx = {};
  const headerNorm = headerRow.map(norm);
  Object.entries(HEADER_ALIASES).forEach(([key, aliases]) => {
    const found = headerNorm.findIndex(h => aliases.some(lbl => h.includes(norm(lbl))));
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
exports.parseAndUpsertStocksFromExcel = async (
  fileBuffer,
  { dryRun = false, openAsOpening = true } = {}
) => {
  const wb = XLSX.read(fileBuffer, { type: 'buffer' });
  const ws = pickSheet(wb);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

  if (!rows.length) throw new Error('엑셀 시트가 비어있습니다.');

  // header
  const headerRowIdx = findHeaderRow(rows);
  const headerRaw  = (rows[headerRowIdx] || []).map(v => s(v));
  const headerNorm = headerRaw.map(norm);
  const H = buildHeaderIndex(headerRaw);
  const start = headerRowIdx + 1;

  // 필수 헤더 검증 (키 구성요소)
  const need = ['customer','carType','deliveryTo','division','partNumber','materialCode'];
  const missing = need.filter(k => H[k] === undefined);
  if (missing.length) {
    console.error(
      debugHeaderInfo({ rows, headerRowIdx, headerRaw, headerNorm, H, aliases: HEADER_ALIASES })
    );
    const shortDump = headerRaw.map(h => `[${h}]`).join(', ');
    throw new Error(`필수 헤더 누락: ${missing.join(', ')}. 헤더행=${headerRowIdx}, 헤더=${shortDump} (서버 콘솔 참조)`);
  }

  const results = [];
  const errors = [];
  let totalRows = rows.length - start;

  // 세션(트랜잭션)
  const session = dryRun ? null : await mongoose.startSession();
  if (session) session.startTransaction();

  try {
    for (let r = start; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.every(v => v === undefined || v === null || String(v).trim() === '')) {
        totalRows--; // 완전 빈행은 제외
        continue;
      }

      try {
        const payload = {
          customer:     s(row[H.customer]),
          carType:      s(row[H.carType]),
          deliveryTo:   s(row[H.deliveryTo]),
          division:     s(row[H.division]),
          partNumber:   s(row[H.partNumber]),
          materialName: H.materialName !== undefined ? s(row[H.materialName]) : '',
          materialCode: s(row[H.materialCode]),
          bomQtyPer:    H.bomQtyPer    !== undefined ? (n(row[H.bomQtyPer]) ?? 0) : 0,
          remark:       H.remark       !== undefined ? s(row[H.remark]) : '',
          uom:          H.uom          !== undefined ? s(row[H.uom]) : 'EA',
        };

        if (!payload.customer || !payload.carType || !payload.deliveryTo ||
            !payload.division || !payload.partNumber || !payload.materialCode) {
          throw new Error('키 필드 누락(customer, carType, deliveryTo, division, partNumber, materialCode)');
        }

        // 수량 컬럼 처리
        const currentFromExcel = H.currentQty !== undefined ? n(row[H.currentQty]) : null;
        const openingQty = H.openingQty !== undefined ? n(row[H.openingQty]) : null;
        const inboundQty = H.inboundQty !== undefined ? n(row[H.inboundQty]) : null;
        const usedQty    = H.usedQty    !== undefined ? n(row[H.usedQty])    : null;

        // 정책: openAsOpening=true면 재고수량을 opening으로 세팅
        let setNumeric = {};
        if (openAsOpening && currentFromExcel !== null) {
          setNumeric.openingQty = currentFromExcel;
          setNumeric.inboundQty = inboundQty ?? 0;
          setNumeric.usedQty    = usedQty ?? 0;
        } else {
          // 직접 온 숫자들만 반영
          if (openingQty !== null) setNumeric.openingQty = openingQty;
          if (inboundQty !== null) setNumeric.inboundQty = inboundQty;
          if (usedQty    !== null) setNumeric.usedQty    = usedQty;
        }

        // dryRun: 키 검증만
        if (dryRun) {
          results.push({ rowIndex: r + 1, status: 'validated', key: payload.materialCode });
          continue;
        }

        // 업서트
        const doc = await Stock.findOneAndUpdate(
          {
            customer: payload.customer,
            carType: payload.carType,
            deliveryTo: payload.deliveryTo,
            division: payload.division,
            partNumber: payload.partNumber,
            materialCode: payload.materialCode,
          },
          {
            $setOnInsert: {
              customer: payload.customer,
              carType: payload.carType,
              deliveryTo: payload.deliveryTo,
              division: payload.division,
              partNumber: payload.partNumber,
              materialCode: payload.materialCode,
            },
            $set: {
              materialName: payload.materialName,
              bomQtyPer: payload.bomQtyPer,
              remark: payload.remark,
              uom: payload.uom || 'EA',
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true, session }
        );

        // opening/inbound/used는 덮어쓰기(필요 시 정책변경 가능)
        let mutated = false;
        if (setNumeric.openingQty !== undefined && setNumeric.openingQty !== null) {
          doc.openingQty = setNumeric.openingQty; mutated = true;
        }
        if (setNumeric.inboundQty !== undefined && setNumeric.inboundQty !== null) {
          doc.inboundQty = setNumeric.inboundQty; mutated = true;
        }
        if (setNumeric.usedQty !== undefined && setNumeric.usedQty !== null) {
          doc.usedQty = setNumeric.usedQty; mutated = true;
        }
        if (mutated) await doc.save({ session });

        results.push({ rowIndex: r + 1, status: 'upserted', id: doc._id });
      } catch (e) {
        errors.push({ rowIndex: r + 1, message: e.message });
      }
    }

    if (session) {
      await session.commitTransaction();
      session.endSession();
    }

    return { ok: true, dryRun, totalRows, results, errors, openAsOpening };
  } catch (e) {
    if (session) {
      await session.abortTransaction();
      session.endSession();
    }
    throw e;
  }
};
