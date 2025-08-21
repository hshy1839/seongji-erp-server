// services/shippingExcelService.js
const XLSX = require('xlsx');
const mongoose = require('mongoose');
const Shipping = require('../models/Shipping');

// ===== utils =====
const toStr = v => (v == null ? '' : String(v));
const s = v => toStr(v).trim();
const norm = v => toStr(v).trim().replace(/\s+/g, '').replace(/[()]/g, '').toLowerCase();
const safeIncludes = (hay, needle) => norm(hay).includes(norm(needle));

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
    // 숫자형(엑셀 날짜) → UTC 자정
    return new Date(Date.UTC(date.y, date.m - 1, date.d));
  }
  const txt = s(v).replace(/\./g, '-').replace(/\//g, '-');
  const dt = new Date(txt);
  return isNaN(dt.getTime())
    ? null
    : new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
};

// ===== header aliases (Shipping 전용) =====
const HEADER_ALIASES = {
  shippingCompany: [
    '납품처','출하처','거래처','납품회사','출하회사',
    ,'업체','회사','고객사',
    'shippingcompany'
  ],
  shippingDate: [
    '출하일','출하일자','납품일자','납품일','납입일자',
    '주문일','일자','날짜','발주일자',
    'date','shippingdate'
  ],
  quantity: [
    '수량','납품수량','총납품수량','출하량','총출하량','총수량',
    '총발주수량' // 일부 양식에서 이 라벨로도 옴
  ],
  itemCode: ['품번','코드','품목코드','productcode','code','partnumber','oem','oemcode','완제품 품번'],
  itemName: ['품명','품목명','제품명','자재명','item','itemname','name'],
  category: ['대분류','카테고리','분류','category'],
  requester: ['요청자','담당자','requester'],
  status: ['상태','status'],
  remark: ['비고','메모','remark'],
  itemType: ['품목유형','itemtype','itemType','type','공정'], // 있으면 그대로 저장
};

// ===== status map =====
const mapStatus = v => (/(완료|complete)/i.test(s(v)) ? 'COMPLETE' : 'WAIT');

// ===== header row detection & index =====
const MUST = ['shippingCompany','shippingDate','quantity'];

/**
 * 머릿말(대분류/소분류 등) 아닌, 실제 헤더 후보를 찾음.
 * 필수 키 3개 중 2개 이상 매칭되는 첫 행을 즉시採用. 없으면 최대 히트 행.
 */
function findHeaderRow(rows) {
  const maxScan = Math.min(rows.length, 30);
  let bestIdx = 0, bestHits = -1;

  for (let r = 0; r < maxScan; r++) {
    const header = Array.isArray(rows[r]) ? rows[r].map(toStr) : [];
    const hits = MUST.reduce((acc, key) => {
      const aliases = HEADER_ALIASES[key] || [];
      const matched = aliases.some(a => header.some(h => safeIncludes(h, a)));
      return acc + (matched ? 1 : 0);
    }, 0);

    if (hits >= 2) return r; // 유효 헤더
    if (hits > bestHits) { bestHits = hits; bestIdx = r; }
  }
  return bestIdx;
}

function buildHeaderIndex(headerRow) {
  const idx = {};
  const headerNorm = (Array.isArray(headerRow) ? headerRow : []).map(v => norm(v));
  Object.entries(HEADER_ALIASES).forEach(([key, aliases = []]) => {
    const found = headerNorm.findIndex(h => aliases.some(lbl => safeIncludes(h, lbl)));
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
      lines.push(`  · ${key.padEnd(16)}: ${String(foundIndex).padStart(2)} / "${matchedAlias}"`);
    } else {
      lines.push(`  · ${key.padEnd(16)}: (NOT FOUND)  tried=${JSON.stringify(aliasList)}`);
    }
  });
  const preview = rows.slice(headerRowIdx + 1, headerRowIdx + 4).map(r => (r || []).map(s));
  lines.push('- first data rows (preview up to 3):');
  preview.forEach((r, i) => lines.push(`  [${i}] ${JSON.stringify(r)}`));
  lines.push('===========================================================');
  return lines.join('\n');
}

// ===== sheet pick (스마트) =====
/**
 * 1순위: '출하수량' 시트명
 * 2순위: 필수 헤더 매칭 수가 가장 높은 시트(시트명 보너스: 출하/납품/ship)
 * 최후: 첫 시트
 */
function pickSheetSmart(workbook) {
  const names = workbook.SheetNames || [];
  if (!names.length) return null;

  const exact = names.find(n => /출하수량/i.test(n));
  if (exact) return workbook.Sheets[exact];

  let best = { score: -1, name: names[0] };
  for (const name of names) {
    const ws = workbook.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
    if (!rows.length) continue;

    const idx = findHeaderRow(rows);
    const header = (rows[idx] || []).map(toStr);

    const hit = MUST.reduce((acc, key) => {
      const aliases = HEADER_ALIASES[key] || [];
      const matched = aliases.some(a => header.some(h => safeIncludes(h, a)));
      return acc + (matched ? 1 : 0);
    }, 0);

    const bonus = /출하|납품|ship/i.test(name) ? 0.5 : 0;
    const score = hit + bonus;

    if (score > best.score) best = { score, name };
  }
  return workbook.Sheets[best.name];
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
/**
 * 엑셀 업로드 정책:
 * - 현재 업로드 시각의 "업로드 일자"(기본: KST)와 DB의 createdAt이 같은 날인 레코드가 있으면 → 그 날 전체 삭제 후 새 데이터로 교체
 * - createdAt이 다른 날만 DB에 있으면 → 그대로 추가
 *
 * 옵션:
 * - defaultShippingDate: 'YYYY-MM-DD' 또는 엑셀과 동일 포맷. 시트에 날짜 컬럼이 없거나 셀 비어있을 때 일괄 적용.
 */
exports.parseAndInsertShippingsFromExcel = async (
  fileBuffer,
  { dryRun = false, tzOffsetMin = 540, defaultShippingDate = null } = {}
) => {
  const wb = XLSX.read(fileBuffer, { type: 'buffer' });
  const ws = pickSheetSmart(wb); // ✅ 스마트 선택
  if (!ws) throw new Error('엑셀 통합문서에 시트가 없습니다.');

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
  if (!rows.length) throw new Error('엑셀 시트가 비어있습니다.');

  // header
  const headerRowIdx = findHeaderRow(rows);
  const headerRaw  = (rows[headerRowIdx] || []).map(v => s(v));
  const headerNorm = headerRaw.map(norm);
  const H = buildHeaderIndex(headerRaw);
  const start = headerRowIdx + 1;

  // required headers
  const need = ['shippingCompany','shippingDate','quantity'];
  const missing = need.filter(k => H[k] === undefined);
  const defaultDateObj = defaultShippingDate ? d(defaultShippingDate) : null;

  if (missing.length) {
    // 날짜만 없고 defaultShippingDate가 있으면 허용
    const onlyDateMissing = (missing.length === 1 && missing[0] === 'shippingDate' && !!defaultDateObj);
    if (!onlyDateMissing) {
      console.error(
        debugHeaderInfo({ rows, headerRowIdx, headerRaw, headerNorm, H, aliases: HEADER_ALIASES })
      );
      const shortDump = headerRaw.map(h => `[${h}]`).join(', ');
      throw new Error(`필수 헤더 누락: ${missing.join(', ')}. 헤더행=${headerRowIdx}, 헤더=${shortDump} (서버 콘솔 참조)`);
    }
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
    dryRun: !!dryRun,
  };

  for (let r = start; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every(v => v === undefined || v === null || String(v).trim() === '')) continue;

    try {
      const shippingCompany = H.shippingCompany !== undefined ? s(row[H.shippingCompany]) : '';
      const requester      = H.requester       !== undefined ? s(row[H.requester])       : '';
      const shippingDate   = H.shippingDate    !== undefined ? d(row[H.shippingDate])    : null;
      const quantity       = H.quantity        !== undefined ? n(row[H.quantity])        : null;

      const itemCode = H.itemCode !== undefined ? s(row[H.itemCode]) : '';
      const itemName = H.itemName !== undefined ? s(row[H.itemName]) : '';
      const category = H.category !== undefined ? s(row[H.category]) : '';
      const remark   = H.remark   !== undefined ? s(row[H.remark])   : '';
      const status   = H.status   !== undefined ? mapStatus(row[H.status]) : 'WAIT';
      const itemType = H.itemType !== undefined ? s(row[H.itemType]) : '';

      // validations
      if (!itemName && !itemCode) throw new Error('품명(itemName) 또는 품번(itemCode) 필요');
      if (!shippingCompany) throw new Error('납품처(shippingCompany) 없음');
      const finalDate = shippingDate || defaultDateObj;
      if (!finalDate) throw new Error('납품일(shippingDate) 파싱 실패 (defaultShippingDate 미제공)');
      if (!quantity || quantity <= 0) throw new Error('수량(quantity) 파싱 실패');

      docs.push({
        itemName,
        itemCode,
        category,
        itemType,               // 엑셀 값 그대로
        shippingCompany,
        quantity,
        shippingDate: finalDate, // 시트값 또는 기본값
        requester: requester || '미지정',
        status,
        remark,
        item: null,             // 레거시 참조 비움
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
      // 같은 createdAt-일자 데이터가 있다면 삭제(덮어쓰기)
      const existingCount = await Shipping.countDocuments(
        { createdAt: { $gte: startUTC, $lt: endUTC } },
        { session }
      );

      if (existingCount > 0) {
        await Shipping.deleteMany({ createdAt: { $gte: startUTC, $lt: endUTC } }, { session });
        results.overwriteByCreatedAtDay = true;
      }

      // 새 데이터 삽입 (timestamps:true로 createdAt 자동 기록)
      const created = await Shipping.insertMany(docs, { session });
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
