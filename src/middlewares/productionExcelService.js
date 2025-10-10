// services/productionExcelService.js
const XLSX = require('xlsx');
const mongoose = require('mongoose');
const ProductionItem = require('../models/productionItem');

// ===== utils =====
const s = v => (v === undefined || v === null ? '' : String(v).trim());
const norm = v => s(v).replace(/\s+/g, '').replace(/[()]/g, '').toLowerCase();
const n = v => {
  if (v === undefined || v === null || v === '') return null;
  const num = Number(String(v).replace(/[, ]/g, ''));
  return Number.isFinite(num) ? num : null;
};
const toYYYYMM = (d) => {
  try {
    const dt = d ? new Date(d) : new Date();
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  } catch { return ''; }
};

// ===== header aliases =====
// 요구 헤더(권장): 거래처, 차종, 구분, END P/NAME, END P/NO, P/NO, P/NAME, MATERIAL, 단가, 소요량,
// 재고현황 하위: 월말재고, 입고수량, 입고날짜, 손실/파손/증가(합쳐진 셀도 허용), 불량, (합계는 서버계산), 과부족(서버계산), 공급업체, 월(YYYY-MM)
const HEADER_ALIASES = {
  customerName: ['거래처','발주처','customer','company','ordercompany'],
  carType:      ['차종','차명','cartype','vehicle','model'],
  division:     ['구분','division','type'],
  endPName:     ['endp/name','endpname','end품명','완성품명','완성품','제품명','end p/name','end p name'],
  endPNo:       ['endp/no','endpno','end품번','완성품번','end p/no','end p no','end code','endcode'],
  partNo:       ['p/no','품번','partno','part number','code','oem','pno'],
  partName:     ['p/name','품명','partname','item name','pname'],
  material:     ['material','재질','자재','소재','원재료','resin','수지'],
  unitPrice:    ['단가','price','unitprice','u/price','원단가'],
  requiredQty:  ['소요량','requiredqty','requirement','need','bomqty','필요수량'],
  endOfMonthStock: ['월말재고','말재고','eom','endofmonth','endingstock'],
  inboundQty:   ['입고수량','입고','inbound','inboundqty','receipt'],
  inboundDate:  ['입고날짜','입고일','date','입고일자','inbounddate','receiptdate'],
  lossDamageInc:['손실,파손,증가','손실/파손/증가','손실파손증가','증가/감소','조정','adjust','adjustment'],
  defects:      ['불량','defect','불량수','불량수량'],
  supplierName: ['공급업체','업체','supplier','vendor','납품업체'],
  monthKey:     ['월','월(yyyy-mm)','month','monthkey','yyyy-mm'],
  notes:        ['비고','메모','remark','notes'],
  // 합계/과부족은 서버에서 계산하므로 받아도 무시 가능
  // sum:      ['합계','총합','sum','total'],
  // shortage: ['과부족','차이','shortage','diff'],
};

// ===== sheet pick =====
function pickSheet(workbook) {
  const prefer = ['생산','production','prod','sheet1','Sheet1'];
  for (const name of prefer) {
    if (workbook.Sheets[name]) return workbook.Sheets[name];
  }
  return workbook.Sheets[workbook.SheetNames[0]];
}

// ===== header row detection & index =====
function findHeaderRow(rows) {
  const must = ['customerName','carType','division','endPNo','partNo'];
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
  lines.push('=== [Production Excel Header Debug] =============================');
  lines.push(`- headerRowIdx: ${headerRowIdx}`);
  lines.push(`- headerRaw   : ${JSON.stringify(headerRaw)}`);
  lines.push(`- headerNorm  : ${JSON.stringify(headerNorm)}`);
  lines.push('- key → foundIndex / matchedAlias');
  Object.entries(aliases).forEach(([key, aliasList]) => {
    const foundIndex = H[key];
    if (foundIndex !== undefined) {
      const matchedAlias =
        aliasList.find(a => headerNorm.includes(norm(a))) || '(norm-match)';
      lines.push(`  · ${key.padEnd(14)}: ${String(foundIndex).padStart(2)} / "${matchedAlias}"`);
    } else {
      lines.push(`  · ${key.padEnd(14)}: (NOT FOUND) tried=${JSON.stringify(aliasList)}`);
    }
  });
  const preview = rows.slice(headerRowIdx + 1, headerRowIdx + 4).map(r => (r || []).map(s));
  lines.push('- first data rows (preview up to 3):');
  preview.forEach((r, i) => lines.push(`  [${i}] ${JSON.stringify(r)}`));
  lines.push('===============================================================');
  return lines.join('\n');
}

/**
 * Excel 파싱 + 업서트(+입고라인)
 * @param {Buffer} fileBuffer - 업로드된 엑셀 버퍼
 * @param {Object} options
 * @param {boolean} [options.dryRun=false] - 검증만 수행(디비 반영 안 함)
 * @returns {Promise<{ok:boolean,totalRows:number,results:Array,errors:Array}>}
 */
exports.parseAndInsertProductionsFromExcel = async (
  fileBuffer,
  { dryRun = false } = {}
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

  // 필수 헤더 검증(키 구성 요소)
  const need = ['customerName','carType','division','endPNo','partNo'];
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

  // 트랜잭션 (dryRun=false일 때만)
  const session = dryRun ? null : await mongoose.startSession();
  if (session) session.startTransaction();

  try {
    for (let r = start; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.every(v => v === undefined || v === null || String(v).trim() === '')) {
        totalRows--; // 완전 빈행 제외
        continue;
      }

      try {
        // 1) 기본/키 필드
        const payload = {
          customerName: s(row[H.customerName]),
          carType:      s(row[H.carType]),
          division:     s(row[H.division]),
          endPName:     H.endPName !== undefined ? s(row[H.endPName]) : '',
          endPNo:       s(row[H.endPNo]),
          partNo:       s(row[H.partNo]),
          partName:     H.partName !== undefined ? s(row[H.partName]) : '',
          material:     H.material !== undefined ? s(row[H.material]) : '',
          supplierName: H.supplierName !== undefined ? s(row[H.supplierName]) : '',
          notes:        H.notes !== undefined ? s(row[H.notes]) : '',
        };

        if (!payload.customerName || !payload.carType || !payload.division || !payload.endPNo || !payload.partNo) {
          throw new Error('키 필드 누락(customerName, carType, division, endPNo, partNo)');
        }

        // 2) 숫자/날짜 필드
        const unitPrice       = H.unitPrice       !== undefined ? n(row[H.unitPrice])       : null;
        const requiredQty     = H.requiredQty     !== undefined ? n(row[H.requiredQty])     : null;
        const endOfMonthStock = H.endOfMonthStock !== undefined ? n(row[H.endOfMonthStock]) : null;

        const inboundQty  = H.inboundQty  !== undefined ? n(row[H.inboundQty])  : null;
        const inboundDate = H.inboundDate !== undefined ? row[H.inboundDate]    : null;
        const defects     = H.defects     !== undefined ? n(row[H.defects])     : null;

        // 손실/파손/증가 통합 컬럼 처리: 양수=증가, 음수=손실/파손
        let lossDamage = 0, increase = 0;
        if (H.lossDamageInc !== undefined) {
          const ldi = n(row[H.lossDamageInc]);
          if (ldi !== null) {
            if (ldi >= 0) increase = ldi; else lossDamage = Math.abs(ldi);
          }
        }

        // 3) monthKey
        let monthKey = H.monthKey !== undefined ? s(row[H.monthKey]) : '';
        if (!monthKey) {
          // monthKey가 없으면 inboundDate 또는 오늘로 YYYY-MM 생성
          monthKey = toYYYYMM(inboundDate || new Date());
        }

        // DryRun은 검증만
        if (dryRun) {
          results.push({ rowIndex: r + 1, status: 'validated', key: `${monthKey}/${payload.endPNo}/${payload.partNo}` });
          continue;
        }

        // 4) 업서트 (키: monthKey + customerName + carType + division + endPNo + partNo)
        const setBase = {
          customerName: payload.customerName,
          carType: payload.carType,
          division: payload.division,
          endPName: payload.endPName,
          partName: payload.partName,
          material: payload.material,
          supplierName: payload.supplierName,
          notes: payload.notes,
          monthKey,
        };
        if (unitPrice   !== null) setBase.unitPrice = unitPrice;
        if (requiredQty !== null) setBase.requiredQty = requiredQty;
        if (endOfMonthStock !== null) setBase.endOfMonthStock = endOfMonthStock;

        const doc = await ProductionItem.findOneAndUpdate(
          {
            monthKey,
            customerName: payload.customerName,
            carType: payload.carType,
            division: payload.division,
            endPNo: payload.endPNo,
            partNo: payload.partNo,
          },
          {
            $setOnInsert: {
              monthKey,
              customerName: payload.customerName,
              carType: payload.carType,
              division: payload.division,
              endPNo: payload.endPNo,
              partNo: payload.partNo,
            },
            $set: setBase,
          },
          { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true, session }
        );

        // 5) 입고 라인 생성(있을 때만)
        if (inboundQty !== null || inboundDate || defects !== null || lossDamage || increase) {
          const inbound = {
            qty: Math.max(0, inboundQty || 0),
            date: inboundDate ? new Date(inboundDate) : new Date(),
            defects: Math.max(0, defects || 0),
            lossDamage: Math.max(0, lossDamage || 0),
            increase: Math.max(0, increase || 0),
            note: '', // 필요시 확장
          };

          // $push로 원자적 추가
          await ProductionItem.updateOne(
            { _id: doc._id },
            { $push: { inbound } },
            { session }
          );
        }

        results.push({ rowIndex: r + 1, status: 'upserted', id: doc._id });
      } catch (e) {
        errors.push({ rowIndex: r + 1, message: e.message });
      }
    }

    if (session) {
      await session.commitTransaction();
      session.endSession();
    }

    return { ok: true, dryRun, totalRows, results, errors };
  } catch (e) {
    if (session) {
      await session.abortTransaction();
      session.endSession();
    }
    throw e;
  }
};
