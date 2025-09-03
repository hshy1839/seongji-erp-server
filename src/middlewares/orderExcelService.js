// services/orderExcelService.js
const XLSX = require('xlsx');
const mongoose = require('mongoose');
const Order = require('../models/Order');

// ===== utils =====
const s = v => (v === undefined || v === null ? '' : String(v).trim());
const norm = v => s(v).replace(/\s+/g, '').replace(/[()]/g, '').toLowerCase();

const n = v => {
  if (v === undefined || v === null || v === '') return null;
  const num = Number(String(v).replace(/[, ]/g, ''));
  return Number.isFinite(num) ? num : null;
};

const d = v => {
  if (!v && v !== 0) return null;
  if (typeof v === 'number') {
    const date = XLSX.SSF.parse_date_code(v);
    if (!date) return null;
    // 원본 셀은 "날짜"만 있다고 가정 → UTC 자정으로 고정
    return new Date(Date.UTC(date.y, date.m - 1, date.d));
  }
  const txt = s(v).replace(/\./g, '-').replace(/\//g, '-');
  const dt = new Date(txt);
  return isNaN(dt.getTime())
    ? null
    : new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
};

// ===== header aliases =====
const HEADER_ALIASES = {
  orderCompany: ['발주처','주문처','거래처','발주회사','ordercompany','company'],
  orderDate:    ['발주일','주문일','일자','date','orderdate','납품일자','납입일','납입일자'],
  quantity:     ['수량','발주수량','총발주수량','qty','quantity','총수량'],
  itemCode:     ['품번','코드','품목코드','productcode','code','partnumber','oem','oemcode'],
  itemName:     ['품명','품목명','제품명','자재명','item','itemname','name'],
  category:     ['대분류','카테고리','분류','category'],
  requester:    ['요청자','담당자','requester'],
  status:       ['상태','status'],
  remark:       ['비고','메모','remark'],
  itemType:     ['품목유형','itemtype','itemType','type','공정'],
  // [ADD carType]
  carType:      ['차종','cartype','차명','vehicle','model'], 
};

// ===== status map =====
const mapStatus = v => (/(완료|complete)/i.test(s(v)) ? 'COMPLETE' : 'WAIT');

// ===== sheet pick =====
function pickSheet(workbook) {
  const prefer = ['총발주수량', '발주', 'orders'];
  for (const name of prefer) {
    if (workbook.Sheets[name]) return workbook.Sheets[name];
  }
  return workbook.Sheets[workbook.SheetNames[0]];
}

// ===== header row detection & index =====
function findHeaderRow(rows) {
  const must = ['orderCompany','orderDate','quantity'];
  const maxScan = Math.min(rows.length, 20);
  for (let r = 0; r < maxScan; r++) {
    const header = (rows[r] || []).map(h => norm(h));
    const hit = must.filter(k => HEADER_ALIASES[k].some(a => header.includes(norm(a))));
    if (hit.length >= 2) return r;
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

// ===== debug header =====
function debugHeaderInfo({ rows, headerRowIdx, headerRaw, headerNorm, H, aliases }) {
  const lines = [];
  lines.push('=== [Excel Header Debug] =================================');
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

// ===== createdAt 기준 "업로드 일자" 범위 (기본: KST, UTC+9) =====
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
exports.parseAndInsertOrdersFromExcel = async (
  fileBuffer,
  { dryRun = false, tzOffsetMin = 540 } = {}
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

  // required headers
  const need = ['orderCompany','orderDate','quantity'];
  const missing = need.filter(k => H[k] === undefined);
  if (missing.length) {
    console.error(
      debugHeaderInfo({ rows, headerRowIdx, headerRaw, headerNorm, H, aliases: HEADER_ALIASES })
    );
    const shortDump = headerRaw.map(h => `[${h}]`).join(', ');
    throw new Error(`필수 헤더 누락: ${missing.join(', ')}. 헤더행=${headerRowIdx}, 헤더=${shortDump} (서버 콘솔 참조)`);
  }

  // 파싱 결과
  const docs = [];
  const results = {
    totalRows: rows.length - start,
    success: 0,
    failed: 0,
    errors: [],
    insertedIds: [],
    overwriteByCreatedAtDay: false,
    overwriteDayKey: null,
  };

  for (let r = start; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every(v => v === undefined || v === null || String(v).trim() === '')) continue;

    try {
      const orderCompany = s(row[H.orderCompany]);
      const requester    = H.requester !== undefined ? s(row[H.requester]) : '';
      const orderDate    = d(row[H.orderDate]);
      const quantity     = n(row[H.quantity]);

      const itemCode = H.itemCode !== undefined ? s(row[H.itemCode]) : '';
      const itemName = H.itemName !== undefined ? s(row[H.itemName]) : '';
      const category = H.category !== undefined ? s(row[H.category]) : '';
      const remark   = H.remark   !== undefined ? s(row[H.remark])   : '';
      const status   = H.status   !== undefined ? mapStatus(row[H.status]) : 'WAIT';
      const itemType = H.itemType !== undefined ? s(row[H.itemType]) : '';
      // [ADD carType]
      const carType  = H.carType  !== undefined ? s(row[H.carType])  : '';

      // validations
      if (!itemName && !itemCode) throw new Error('품명(itemName) 또는 품번(itemCode) 필요');
      if (!orderCompany) throw new Error('발주처(orderCompany) 없음');
      if (!orderDate)    throw new Error('발주일(orderDate) 파싱 실패');
      if (!quantity || quantity <= 0) throw new Error('수량(quantity) 파싱 실패');

      docs.push({
        itemName,
        itemCode,
        category,
        itemType,
        // [ADD carType]
        carType,
        orderCompany,
        quantity,
        orderDate,
        requester: requester || '미지정',
        status,
        remark,
        item: null,
      });

      results.success += 1;
    } catch (rowErr) {
      results.failed += 1;
      results.errors.push({ row: r + 1, message: rowErr.message });
    }
  }

  if (!docs.length) {
    return results; // 모두 스킵/에러
  }

  // 업로드 "일자"(타깃 타임존) → createdAt 덮어쓰기 범위 계산
  const { startUTC, endUTC, key } = getUploadDayRangeUTC(new Date(), tzOffsetMin);
  results.overwriteDayKey = key;

  // 트랜잭션
  const session = dryRun ? null : await mongoose.startSession();
  if (session) session.startTransaction();

  try {
    if (!dryRun) {
      const existingCount = await Order.countDocuments(
        { createdAt: { $gte: startUTC, $lt: endUTC } },
        { session }
      );

      if (existingCount > 0) {
        await Order.deleteMany({ createdAt: { $gte: startUTC, $lt: endUTC } }, { session });
        results.overwriteByCreatedAtDay = true;
      }

      const created = await Order.insertMany(docs, { session });
      results.insertedIds = created.map(d => d._id);
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
