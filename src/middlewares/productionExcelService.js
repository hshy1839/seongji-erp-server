// services/productionExcelService.js
const XLSX = require('xlsx');
const ProductionItem = require('../models/productionItem');

// ===== 설정 =====
const MODE = 'REPLACE'; // 'REPLACE' | 'INC'

// ===== utils =====
const s = v => (v === undefined || v === null ? '' : String(v).trim());
const norm = v => s(v).replace(/\s+/g, '').replace(/[()]/g, '').toLowerCase();
const n = v => {
  if (v === undefined || v === null || v === '') return null;
  const txt = String(v).replace(/,/g, '').trim();
  if (!isNaN(txt)) {
    const num1 = Number(txt);
    return Number.isFinite(num1) ? num1 : null;
  }
  const m = txt.match(/-?\d+(?:\.\d+)?/);
  if (m) {
    const num2 = Number(m[0]);
    return Number.isFinite(num2) ? num2 : null;
  }
  return null;
};

// ===== header aliases =====
const HEADER_ALIASES = {
  partNo:   ['품번','p/no','partno','part number','code','oem','pno','모비스품번','품번(모비스)'],
  division: ['구분','division','type','category'],
  qty:      ['수량','생산수량','qty','quantity','납품수량','생산수 량'],
};

// ===== sheet pick =====
function pickSheet(workbook) {
  const prefer = ['생산실적','생산','production','prod','Sheet1','sheet1'];
  for (const name of prefer) if (workbook.Sheets[name]) return workbook.Sheets[name];
  return workbook.Sheets[workbook.SheetNames[0]];
}

// ===== header row detection & index =====
function findHeaderRow(rows) {
  const must = ['partNo','qty'];
  const maxScan = Math.min(rows.length, 25);
  for (let r = 0; r < maxScan; r++) {
    const header = (rows[r] || []).map(h => norm(h));
    const hasKey = (k) => HEADER_ALIASES[k].some(a =>
      header.some(cell => cell.includes(norm(a)))
    );
    const hit = must.filter(k => hasKey(k));
    if (hit.length >= 2) return r;
  }
  return 0; // 첫 줄을 헤더로 가정
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

/**
 * Excel 파싱 + 업서트 (구분/품번/수량) — 월 개념 없음
 * @param {Buffer} fileBuffer
 * @returns {Promise<{ok:boolean,totalRows:number,processed:number,failed:number,errors:Array}>}
 */
exports.parseAndInsertProductionsFromExcel = async (fileBuffer) => {
  const wb = XLSX.read(fileBuffer, { type: 'buffer' });
  const ws = pickSheet(wb);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
  if (!rows.length) throw new Error('엑셀 시트가 비어있습니다.');

  // === 헤더 파싱 ===
  const headerRowIdx = findHeaderRow(rows);
  const headerRaw  = (rows[headerRowIdx] || []).map(v => s(v));
  const H = buildHeaderIndex(headerRaw);
  const start = headerRowIdx + 1;

  const need = ['partNo', 'qty'];
  const missing = need.filter(k => H[k] === undefined);
  if (missing.length) {
    throw new Error(`필수 헤더 누락: ${missing.join(', ')} (헤더: ${headerRaw.join(', ')})`);
  }

  // === 데이터 파싱 ===
  const now = new Date();
  const ops = [];
  const errors = [];
  let totalRows = rows.length - start;

  for (let r = start; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every(v => !String(v || '').trim())) {
      totalRows--;
      continue;
    }

    try {
      const partNo = s(row[H.partNo]);
      const qty = n(row[H.qty]);
      const division = H.division !== undefined ? s(row[H.division]) : '';

      if (!partNo) throw new Error('품번 없음');
      if (qty === null || !Number.isFinite(qty)) throw new Error('수량 파싱 실패');
      if (qty < 0) throw new Error('수량 음수');

      const filter = { division, partNo };

      if (MODE === 'REPLACE') {
        ops.push({
          updateOne: {
            filter,
            update: {
              $setOnInsert: { ...filter, createdAt: now },
              $set: { quantity: qty, updatedAt: now },
            },
            upsert: true,
          },
        });
      } else {
        // INC 모드: 기존 수량에 더하기
        ops.push({
          updateOne: {
            filter,
            update: {
              $setOnInsert: { ...filter, quantity: 0, createdAt: now },
              $inc: { quantity: qty },
              $set: { updatedAt: now },
            },
            upsert: true,
          },
        });
      }
    } catch (e) {
      errors.push({ rowIndex: r + 1, message: e.message });
    }
  }

  // === DB 반영 (bulkWrite) ===
  let processed = 0, failed = errors.length;
  if (ops.length > 0) {
    const BATCH = 1000;
    for (let i = 0; i < ops.length; i += BATCH) {
      const chunk = ops.slice(i, i + BATCH);
      try {
        const res = await ProductionItem.bulkWrite(chunk, { ordered: false });
        processed += (res.upsertedCount || 0) + (res.modifiedCount || 0); // matchedCount 제외
      } catch (e) {
        failed += (e.result?.nWriteErrors || e.writeErrors?.length || 0);
      }
    }
  }

  return { ok: true, totalRows, processed, failed, errors };
};
