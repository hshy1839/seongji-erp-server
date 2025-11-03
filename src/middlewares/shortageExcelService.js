// services/shortageExcelService.js
const XLSX = require('xlsx');
const mongoose = require('mongoose');
const ShortageItem = require('../models/ShortageItem');

// ===== utils =====
const s = (v) => (v === undefined || v === null ? '' : String(v).trim());
const norm = (v) =>
  s(v)
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, '')
    .replace(/[()\[\]]/g, '')
    .toLowerCase();
const n = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const num = Number(String(v).replace(/[, ]/g, ''));
  return Number.isFinite(num) ? num : null;
};

// ===== header aliases =====
const HEADER_ALIASES = {
  division:     ['구분', 'division', '분류', '대분류', '카테고리'],
  material:     ['자재', 'material', '자재명', '품명', '제품명', 'item', 'name'],
  materialCode: ['자재품번', 'materialcode', '품번', '코드', 'code', 'partnumber', 'oem', 'oemcode', '모비스품번'],
  supplier:     ['자재업체', 'supplier', '업체', '거래처', '공급사', 'vendor'],
  inQty:        ['입고수량', 'inqty', '입고', '입고량', '입고합계'],
  stockQty:     ['재고수량', 'stockqty', '재고', '잔량', 'stock', 'onhand', '현재고'],
};

// ===== sheet pick =====
function pickSheet(workbook) {
  const prefer = ['부족수량', 'Shortage', 'shortage', '재고', 'Stock', '자재', 'Sheet1', 'sheet1'];
  for (const name of prefer) if (workbook.Sheets[name]) return workbook.Sheets[name];
  return workbook.Sheets[workbook.SheetNames[0]];
}

// ===== header row detection =====
function findHeaderRow(rows, maxScan = 50) {
  const requiredKeys = ['division', 'material', 'materialCode'];
  for (let r = 0; r < Math.min(rows.length, maxScan); r++) {
    const raw = (rows[r] || []).map(s);
    const headerNorm = raw.map(norm);
    const hit = requiredKeys.filter((key) =>
      HEADER_ALIASES[key].some((a) => headerNorm.some((h) => h.includes(norm(a))))
    );
    if (hit.length >= 2) {
      return { headerRow: r, headerRaw: raw, headerNorm };
    }
  }
  const raw0 = (rows[0] || []).map(s);
  return { headerRow: 0, headerRaw: raw0, headerNorm: raw0.map(norm) };
}

function buildHeaderIndex(headerRaw) {
  const idx = {};
  const headerNorm = (headerRaw || []).map(norm);
  Object.entries(HEADER_ALIASES).forEach(([key, aliases]) => {
    const found = headerNorm.findIndex((h) => aliases.some((lbl) => h.includes(norm(lbl))));
    if (found >= 0) idx[key] = found;
  });
  return idx;
}

// ===== debug header =====
function debugHeaderInfo({ rows, headerRowIdx, headerRaw, headerNorm, H, aliases }) {
  const lines = [];
  lines.push('=== [Shortage Excel Header Debug] =========================');
  lines.push(`- headerRow  : ${headerRowIdx}`);
  lines.push(`- headerRaw  : ${JSON.stringify(headerRaw)}`);
  lines.push(`- headerNorm : ${JSON.stringify(headerNorm)}`);
  lines.push('- key → foundIndex / matchedAlias');
  Object.entries(aliases).forEach(([key, aliasList]) => {
    const foundIndex = H[key];
    if (foundIndex !== undefined) {
      const matchedAlias =
        aliasList.find((a) => headerNorm.includes(norm(a))) || '(norm-match)';
      lines.push(`  · ${key.padEnd(12)}: ${String(foundIndex).padStart(2)} / "${matchedAlias}"`);
    } else {
      lines.push(`  · ${key.padEnd(12)}: (NOT FOUND)  tried=${JSON.stringify(aliasList)}`);
    }
  });
  const preview = rows.slice(headerRowIdx + 1, headerRowIdx + 4).map((r) => (r || []).map(s));
  lines.push('- first data rows (preview up to 3):');
  preview.forEach((r, i) => lines.push(`  [${i}] ${JSON.stringify(r)}`));
  lines.push('===========================================================');
  return lines.join('\n');
}

// ===== 업로드 일자 범위(KST, UTC+9) =====
function getUploadDayRangeUTC(now = new Date(), tzOffsetMin = 540) {
  const offsetMs = tzOffsetMin * 60 * 1000;
  const localNow = new Date(now.getTime() + offsetMs);
  const y = localNow.getUTCFullYear();
  const m = localNow.getUTCMonth();
  const ddd = localNow.getUTCDate();
  const startLocal = Date.UTC(y, m, ddd);
  const startUTC = new Date(startLocal - offsetMs);
  const endUTC = new Date(startUTC.getTime() + 24 * 60 * 60 * 1000);
  const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(ddd).padStart(2, '0')}`;
  return { startUTC, endUTC, key };
}

// ===== main =====
/**
 * Order 업로드 컨벤션과 동일한 동작으로 Shortage 업로드
 */
exports.parseAndUpsertShortagesFromExcel = async (
  fileBuffer,
  { dryRun = false, tzOffsetMin = 540, overwriteToday = false } = {}
) => {
  const wb = XLSX.read(fileBuffer, { type: 'buffer' });
  const ws = pickSheet(wb);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

  if (!rows.length) throw new Error('엑셀 시트가 비어있습니다.');

  // header
  const { headerRow, headerRaw, headerNorm } = findHeaderRow(rows);
  const H = buildHeaderIndex(headerRaw);
  const start = headerRow + 1;

  // 필수 헤더 검증
  const need = ['division', 'material', 'materialCode'];
  const missing = need.filter((k) => H[k] === undefined);
  if (missing.length) {
    console.error(
      debugHeaderInfo({ rows, headerRowIdx: headerRow, headerRaw, headerNorm, H, aliases: HEADER_ALIASES })
    );
    const shortDump = headerRaw.map((h) => `[${h}]`).join(', ');
    throw new Error(`필수 헤더 누락: ${missing.join(', ')}. 헤더행=${headerRow}, 헤더=${shortDump} (서버 콘솔 참조)`);
  }

  const results = {
    totalRows: rows.length - start,
    success: 0,
    failed: 0,
    errors: [],
    upserts: 0,
    overwrittenToday: false,
    overwriteDayKey: null,
    headerRow,
    upsertedIds: {}, // bulkWrite upsertedIds
  };

  // 업로드 "일자"(KST) 기준 (overwriteToday 용)
  const { startUTC, endUTC, key } = getUploadDayRangeUTC(new Date(), tzOffsetMin);
  results.overwriteDayKey = key;

  // 트랜잭션
  const session = dryRun ? null : await mongoose.startSession();
  if (session) session.startTransaction();

  try {
    // 같은 업로드일 덮어쓰기
    if (!dryRun && overwriteToday) {
      const existing = await ShortageItem.countDocuments(
        { createdAt: { $gte: startUTC, $lt: endUTC } },
        { session }
      );
      if (existing > 0) {
        await ShortageItem.deleteMany({ createdAt: { $gte: startUTC, $lt: endUTC } }, { session });
        results.overwrittenToday = true;
      }
    }

    // 파싱 → bulk upsert
    const ops = [];

    for (let r = start; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.every((v) => v === undefined || v === null || String(v).trim() === '')) continue;

      try {
        const division = s(row[H.division]);
        const material = s(row[H.material]);
        const materialCode = s(row[H.materialCode]);
        if (!division || !material || !materialCode) {
          throw new Error('필수값 누락(division/material/materialCode)');
        }

        const supplier = H.supplier !== undefined ? s(row[H.supplier]) : undefined;
        const inQty    = H.inQty    !== undefined ? n(row[H.inQty])    : undefined;
        const stockQty = H.stockQty !== undefined ? n(row[H.stockQty]) : undefined;

        if (!dryRun) {
          ops.push({
            updateOne: {
              filter: { division, material, materialCode },
              update: {
                $setOnInsert: { division, material, materialCode },
                $set: {
                  ...(supplier !== undefined ? { supplier } : {}),
                  ...(inQty    !== undefined ? { inQty }    : {}),
                  ...(stockQty !== undefined ? { stockQty } : {}),
                },
              },
              upsert: true,
            },
          });
        }

        results.success += 1;
        results.upserts += 1;
      } catch (e) {
        results.failed += 1;
        results.errors.push({ row: r + 1, message: e.message });
      }
    }

    if (!dryRun && ops.length) {
      const bw = await ShortageItem.bulkWrite(ops, { ordered: false, session });
      // upsertedIds는 { 0:{_id}, 3:{_id}, ... } 형태
      results.upsertedIds = bw.upsertedIds || {};
    }

    if (session) {
      await session.commitTransaction();
      session.endSession();
    }
    return results;
  } catch (e) {
    if (session) {
      await session.abortTransaction();
      session.endSession();
    }
    throw e;
  }
};
