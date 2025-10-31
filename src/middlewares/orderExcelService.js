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
    // "날짜"만 있다고 가정 → UTC 자정으로 고정
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
  // 기존 일반 포맷 + 모비스 간소 포맷 혼용
  orderCompany: ['발주처','주문처','거래처','발주회사','ordercompany','company'],
  orderDate:    ['발주일','주문일','일자','date','orderdate','납품일자','납입일','납입일자'],
  quantity:     ['수량','발주수량','총발주수량','총 발주수량','총발주량','총 발주량','qty','quantity','총수량'],
  itemCode:     ['품번','코드','품목코드','productcode','code','partnumber','oem','oemcode','모비스품번','모비스 품번'],
  itemName:     ['품명','품목명','제품명','자재명','item','itemname','name'],
  category:     ['대분류','카테고리','분류','category','구분','division'],
  requester:    ['요청자','담당자','requester'],
  status:       ['상태','status'],
  remark:       ['비고','메모','remark'],
  itemType:     ['품목유형','itemtype','itemType','type','공정'],
  carType:      ['차종','cartype','차명','vehicle','model'],
};

// ===== status map =====
const mapStatus = v => (/(완료|complete)/i.test(s(v)) ? 'COMPLETE' : 'WAIT');

// ===== sheet pick =====
function pickSheet(workbook) {
  const prefer = ['발주수량', '총발주수량', '발주', 'orders'];
  for (const name of prefer) {
    if (workbook.Sheets[name]) return workbook.Sheets[name];
  }
  return workbook.Sheets[workbook.SheetNames[0]];
}

// ===== header row detection =====
// 표준 포맷(발주처/발주일/수량) 실패 시, MOBIS-간소 포맷(모비스품번/구분/총발주량)으로 자동 전환
function findHeaderProfile(rows) {
  const maxScan = Math.min(rows.length, 20);

  const build = headerRow => {
    const raw = (rows[headerRow] || []).map(v => s(v));
    return { headerRow, headerRaw: raw, headerNorm: raw.map(norm) };
  };

  // 1) 표준 프로필: orderCompany + orderDate + quantity 중 2개 이상
  for (let r = 0; r < maxScan; r++) {
    const { headerNorm } = build(r);
    const hit = ['orderCompany','orderDate','quantity'].filter(k =>
      HEADER_ALIASES[k].some(a => headerNorm.some(h => h.includes(norm(a))))
    );
    if (hit.length >= 2) return { profile: 'standard', ...build(r) };
  }

  // 2) MOBIS 간소 프로필: itemCode + category + quantity 중 2개 이상
  for (let r = 0; r < maxScan; r++) {
    const { headerNorm } = build(r);
    const hit = ['itemCode','category','quantity'].filter(k =>
      HEADER_ALIASES[k].some(a => headerNorm.some(h => h.includes(norm(a))))
    );
    if (hit.length >= 2) return { profile: 'mobis-simple', ...build(r) };
  }

  // 못 찾으면 0행 가정
  return { profile: 'standard', ...build(0) };
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
function debugHeaderInfo({ rows, headerRowIdx, headerRaw, headerNorm, H, aliases, profile }) {
  const lines = [];
  lines.push('=== [Excel Header Debug] =================================');
  lines.push(`- profile    : ${profile}`);
  lines.push(`- headerRow  : ${headerRowIdx}`);
  lines.push(`- headerRaw  : ${JSON.stringify(headerRaw)}`);
  lines.push(`- headerNorm : ${JSON.stringify(headerNorm)}`);
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

const DEFAULT_COMPANY = '모비스';

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
  const { profile, headerRow, headerRaw, headerNorm } = findHeaderProfile(rows);
  const H = buildHeaderIndex(headerRaw);
  const start = headerRow + 1;

  // 필수 헤더: 프로필별
  let need = [];
  if (profile === 'standard') {
    need = ['quantity']; // 유연성 위해 최소만 강제
  } else if (profile === 'mobis-simple') {
    need = ['itemCode','quantity']; // 모비스 간소: 모비스품번 + 총발주량
  }

  const missing = need.filter(k => H[k] === undefined);
  if (missing.length) {
    console.error(
      debugHeaderInfo({ rows, headerRowIdx: headerRow, headerRaw, headerNorm, H, aliases: HEADER_ALIASES, profile })
    );
    const shortDump = headerRaw.map(h => `[${h}]`).join(', ');
    throw new Error(`필수 헤더 누락: ${missing.join(', ')}. 헤더행=${headerRow}, 헤더=${shortDump} (서버 콘솔 참조)`);
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
    profile,
  };

  // 업로드 "일자"(KST) 미리 산출
  const { startUTC, endUTC, key } = getUploadDayRangeUTC(new Date(), tzOffsetMin);
  results.overwriteDayKey = key;

  for (let r = start; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every(v => v === undefined || v === null || String(v).trim() === '')) continue;

    try {
      const quantity     = H.quantity !== undefined ? n(row[H.quantity]) : null;
      const itemCode     = H.itemCode !== undefined ? s(row[H.itemCode]) : '';
      const itemName     = H.itemName !== undefined ? s(row[H.itemName]) : '';
      const category     = H.category !== undefined ? s(row[H.category]) : ''; // "구분"
      const remark       = H.remark   !== undefined ? s(row[H.remark])   : '';
      const status       = H.status   !== undefined ? mapStatus(row[H.status]) : 'WAIT';
      const itemType     = H.itemType !== undefined ? s(row[H.itemType]) : '';
      const carType      = H.carType  !== undefined ? s(row[H.carType])  : '';

      // 표준 필드(있으면 사용)
      const orderCompany = H.orderCompany !== undefined ? s(row[H.orderCompany]) : '';
      const orderDate    = H.orderDate    !== undefined ? d(row[H.orderDate])    : null;
      const requester    = H.requester    !== undefined ? s(row[H.requester])    : '';

      // === [REQ] 구분이 비어있으면 그 행만 스킵 ===
      // - mobis-simple 프로필이거나, 실제로 구분 컬럼이 존재(H.category !== undefined)할 때만 스킵
      if ((profile === 'mobis-simple' || H.category !== undefined) && !category) {
        results.failed += 1;
        results.errors.push({ row: r + 1, message: '스킵: 구분(category) 없음' });
        continue;
      }

      // === 유효성 ===
      if (!itemCode && !itemName) throw new Error('품번(itemCode) 또는 품명(itemName) 필요');
      if (!quantity || quantity <= 0) throw new Error('수량(quantity) 파싱 실패');

      // === 기본값(모비스 간소 포맷 대응) ===
      const safeOrderCompany = orderCompany || DEFAULT_COMPANY;
      const safeOrderDate = orderDate || startUTC; // 업로드 당일 00:00(KST)을 UTC로 환산

      docs.push({
        itemName,
        itemCode,
        category,
        itemType,
        carType,
        orderCompany: safeOrderCompany,
        quantity,
        orderDate: safeOrderDate,
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

  // 트랜잭션
  const session = dryRun ? null : await mongoose.startSession();
  if (session) session.startTransaction();

  try {
    if (!dryRun) {
      // 같은 "업로드 일자(KST)" 데이터 덮어쓰기
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
