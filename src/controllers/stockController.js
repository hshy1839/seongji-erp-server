// controllers/stockController.js
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const Stock = require('../models/Stock');
const { parseAndUpsertStocksFromExcel } = require('../middlewares/stockExcelService');
/** 숫자 파싱 유틸 */
const toNum = (v, d = 0) => {
  const n = Number(String(v).replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : d;
};

/** 고유키 구성 유틸 */
const keyFrom = (src = {}) => {
  const { division, partNumber, materialCode } = src;
  const miss = ['division','partNumber','materialCode'].filter(k => !src?.[k]);
  if (miss.length) {
    const err = new Error(`키 필드 누락: ${miss.join(', ')}`);
    err.status = 400;
    throw err;
  }
  return {
    // 키
    division, partNumber, materialCode,
    // 선택/부가(없어도 됨)
    customer: src.customer ?? '',
    carType: src.carType ?? '',
    deliveryTo: src.deliveryTo ?? '',
    materialName: src.materialName ?? '',
  };
};

/** =========================
 * 목록 조회 (필터 + 페이징)
 * GET /api/stocks
 * query: customer, carType, deliveryTo, division, partNumber, materialCode, materialName, q, page, limit, sort
 * ========================= */
exports.getAllStocks = async (req, res, next) => {
  try {
    const {
      customer, carType, deliveryTo, division, partNumber,
     materialCode, materialName, q,
     page = 1, limit = 20, sort = '-updatedAt', all,
    } = req.query;

    const filter = {};
    if (customer) filter.customer = customer;
    if (carType) filter.carType = carType;
    if (deliveryTo) filter.deliveryTo = deliveryTo;
    if (division) filter.division = division;
    if (partNumber) filter.partNumber = partNumber;
    if (materialCode) filter.materialCode = materialCode;
    if (materialName) filter.materialName = materialName;

    if (q) {
      filter.$or = [
        { customer: { $regex: q, $options: 'i' } },
        { carType: { $regex: q, $options: 'i' } },
        { deliveryTo: { $regex: q, $options: 'i' } },
        { division: { $regex: q, $options: 'i' } },
        { partNumber: { $regex: q, $options: 'i' } },
        { materialCode: { $regex: q, $options: 'i' } },
        { materialName: { $regex: q, $options: 'i' } },
      ];
    }

   const wantAll = String(all).toLowerCase() === 'true' || String(limit) === '-1';
   const sortSpec = sort || '-updatedAt';
   const projection = {}; // 필요시 성능 위해 특정 필드만

   if (wantAll) {
     const [items, total] = await Promise.all([
       Stock.find(filter, projection).sort(sortSpec).lean(),
       Stock.countDocuments(filter),
     ]);
     return res.json({ page: 1, limit: total, total, items });
   } else {
     const pageNum  = Math.max(1, Number(page) || 1);
     // 상한 넉넉히 (예: 5000). 한 번에 전부가 싫으면 1000 정도로.
     const limitMax = 5000;
     const limitNum = Math.max(1, Math.min(limitMax, Number(limit) || 20));
     const skip     = (pageNum - 1) * limitNum;
     const [items, total] = await Promise.all([
       Stock.find(filter, projection).sort(sortSpec).skip(skip).limit(limitNum).lean(),
       Stock.countDocuments(filter),
     ]);
     return res.json({ page: pageNum, limit: limitNum, total, items });
   }
  } catch (err) {
    next(err);
  }
};

/** =========================
 * 단건 조회
 * GET /api/stocks/:id
 * ========================= */
exports.getStockById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'invalid id' });
    const doc = await Stock.findById(id);
    if (!doc) return res.status(404).json({ message: 'not found' });
    res.json(doc);
  } catch (err) {
    next(err);
  }
};

/** =========================
 * 생성 (명시적 생성) - 중복키면 409
 * POST /api/stocks
 * body: customer, carType, deliveryTo, division, partNumber, materialName, materialCode, bomQtyPer, openingQty, inboundQty, usedQty, uom, remark
 * ========================= */
exports.createStock = async (req, res, next) => {
  try {
    const key = keyFrom(req.body);
const exists = await Stock.findOne({
  division: key.division,
  partNumber: key.partNumber,
  materialCode: key.materialCode,
});
if (exists) return res.status(409).json({ message: 'duplicate key', id: exists._id });

   const doc = await Stock.create({
  division: key.division,
  partNumber: key.partNumber,
  materialCode: key.materialCode,
  // 선택 필드들
  customer: key.customer,
  carType: key.carType,
  deliveryTo: key.deliveryTo,
  materialName: req.body.materialName ?? key.materialName,
  bomQtyPer: toNum(req.body.bomQtyPer, 0),
  openingQty: toNum(req.body.openingQty, 0),
  inboundQty: toNum(req.body.inboundQty, 0),
  usedQty: toNum(req.body.usedQty, 0),
  uom: req.body.uom || 'EA',
  remark: req.body.remark || '',
});

    res.status(201).json(doc);
  } catch (err) {
    if (err?.code === 11000) {
      err.status = 409;
      err.message = 'duplicate key';
    }
    next(err);
  }
};

/** =========================
 * 업데이트 (부분/전체)
 * PATCH /api/stocks/:id
 * ========================= */
exports.updateStock = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok:false, message:'잘못된 id 형식입니다.' });
    }

    const body = { ...req.body };
    // 숫자 필드 정규화
    ['bomQtyPer','openingQty','inboundQty','usedQty'].forEach(k => {
      if (body[k] === '') delete body[k];
      if (typeof body[k] !== 'undefined') body[k] = toNum(body[k]);
    });

    const doc = await Stock.findByIdAndUpdate(id, body, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ ok:false, message:'not found' });
    res.json(doc);
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ ok:false, type:'ValidationError', message: err.message, errors: err.errors });
    }
    if (err.name === 'CastError') {
      return res.status(400).json({ ok:false, type:'CastError', path: err.path, value: err.value, message:'값 형식이 올바르지 않습니다.' });
    }
    res.status(500).json({ ok:false, message:'Internal Server Error' });
  }
};

/** =========================
 * 삭제
 * DELETE /api/stocks/:id
 * ========================= */
exports.deleteStock = async (req, res, next) => {
  try {
    const deleted = await Stock.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'not found' });
    res.json({ message: 'deleted' });
  } catch (err) {
    next(err);
  }
};

/** =========================
 * 키기반 업서트 (권장)
 * PUT /api/stocks/upsert
 * body: 키필드 + 갱신필드
 * ========================= */
exports.upsertStock = async (req, res, next) => {
  try {
   const key = keyFrom(req.body);
const update = {
  materialName: req.body.materialName ?? key.materialName,
  uom: req.body.uom || 'EA',
  remark: req.body.remark || '',
  // 선택 부가
  customer: req.body.customer ?? key.customer ?? '',
  carType: req.body.carType ?? key.carType ?? '',
  deliveryTo: req.body.deliveryTo ?? key.deliveryTo ?? '',
};
['bomQtyPer','openingQty','inboundQty','usedQty'].forEach(k => {
  if (typeof req.body[k] !== 'undefined') update[k] = toNum(req.body[k]);
});

const doc = await Stock.findOneAndUpdate(
  {
    division: key.division,
    partNumber: key.partNumber,
    materialCode: key.materialCode,
  },
  {
    $setOnInsert: { division: key.division, partNumber: key.partNumber, materialCode: key.materialCode },
    $set: update,
  },
  { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
);

  } catch (err) {
    next(err);
  }
};

/** =========================
 * 입고 증가 (누적)
 * POST /api/stocks/add-inbound
 * body: 키필드 + qty, when?
 * ========================= */
exports.addInbound = async (req, res, next) => {
  try {
    const key = keyFrom(req.body);
    const qty = toNum(req.body.qty, 0);
    if (qty <= 0) return res.status(400).json({ ok:false, message:'qty must be > 0' });
    const when = req.body.when ? new Date(req.body.when) : new Date();

    const doc = await Stock.addInbound(key, qty, when);
    res.json({ ok:true, doc });
  } catch (err) {
    next(err);
  }
};

/** =========================
 * 생산실적 사용(자재 차감)
 * POST /api/stocks/consume
 * body: 키필드 + useQty, when?
 * ========================= */
exports.consumeByProduction = async (req, res, next) => {
  try {
    const key = keyFrom(req.body);
    const useQty = toNum(req.body.useQty, 0);
    if (useQty <= 0) return res.status(400).json({ ok:false, message:'useQty must be > 0' });
    const when = req.body.when ? new Date(req.body.when) : new Date();

    const doc = await Stock.consumeByProduction(key, useQty, when);
    res.json({ ok:true, doc });
  } catch (err) {
    next(err);
  }
};

/** =========================
 * 엑셀 업로드 (벌크 업서트)
 * POST /api/stocks/upload?dryRun=true&mode=openAsOpening=true
 * - 기대 컬럼(한글 헤더):
 *   발주처, 차종, 납품처, 구분, 품번, 자재, 자재품번, 재고수량, 소요량
 * - 옵션:
 *   dryRun=true  : 검증만
 *   openAsOpening=true : 재고수량을 openingQty로 입력(기본 true)
 * ========================= */
exports.uploadStocksExcelController = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ ok:false, message:'파일이 없습니다.' });
    }
    const dryRun = String(req.query.dryRun || 'false').toLowerCase() === 'true';
    const openAsOpening = String(req.query.openAsOpening || 'true').toLowerCase() === 'true';

    const report = await parseAndUpsertStocksFromExcel(req.file.buffer, { dryRun, openAsOpening });
    return res.json(report);
  } catch (err) {
    console.error('[uploadStocksExcelController]', err);
    res.status(500).json({ ok:false, message: err.message || '서버 오류' });
  }
};
