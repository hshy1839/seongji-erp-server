// src/controllers/productionController.js
const mongoose = require('mongoose');
const dayjs = require('dayjs');
const ProductionItem = require('../models/productionItem');
const { parseAndInsertProductionsFromExcel } = require('../middlewares/productionExcelService'); // ✅ services 경로

const toNum = (v, d = 0) => {
  if (v === null || v === undefined || v === '') return d;
  const n = Number(String(v).replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : d;
};
const toMonthKey = (d) => dayjs(d || new Date()).format('YYYY-MM');

// 목록
exports.list = async (req, res) => {
  try {
    const {
      page = 1, limit = 20, sort = '-updatedAt',
      month, q, customerName, carType, division, endPNo, partNo, material, supplierName,
    } = req.query;

    const filter = {};
    if (month) filter.monthKey = month;
    if (customerName) filter.customerName = new RegExp(customerName, 'i');
    if (carType) filter.carType = carType;
    if (division) filter.division = division;
    if (endPNo) filter.endPNo = endPNo;
    if (partNo) filter.partNo = partNo;
    if (material) filter.material = material;
    if (supplierName) filter.supplierName = new RegExp(supplierName, 'i');
    if (q) {
      filter.$or = [
        { customerName: { $regex: q, $options: 'i' } },
        { carType: { $regex: q, $options: 'i' } },
        { division: { $regex: q, $options: 'i' } },
        { endPName: { $regex: q, $options: 'i' } },
        { endPNo: { $regex: q, $options: 'i' } },
        { partNo: { $regex: q, $options: 'i' } },
        { partName: { $regex: q, $options: 'i' } },
        { material: { $regex: q, $options: 'i' } },
        { supplierName: { $regex: q, $options: 'i' } },
      ];
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Math.min(200, Number(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      ProductionItem.find(filter).sort(sort).skip(skip).limit(limitNum).lean({ virtuals: true }),
      ProductionItem.countDocuments(filter),
    ]);
    res.json({ ok: true, page: pageNum, limit: limitNum, total, items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok:false, message:'Failed to fetch production items' });
  }
};

// 단건
exports.getOne = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ ok:false, message:'Invalid id' });
    const item = await ProductionItem.findById(id).lean({ virtuals: true });
    if (!item) return res.status(404).json({ ok:false, message:'Not found' });
    res.json({ ok:true, item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok:false, message:'Failed to fetch item' });
  }
};

// 생성
exports.create = async (req, res) => {
  try {
    const body = { ...req.body };
    body.unitPrice = toNum(body.unitPrice, 0);
    body.requiredQty = toNum(body.requiredQty, 0);
    body.endOfMonthStock = toNum(body.endOfMonthStock, 0);
    if (!body.monthKey) body.monthKey = toMonthKey(body.date || new Date());
    const item = await ProductionItem.create(body);
    res.status(201).json({ ok:true, item });
  } catch (err) {
    console.error(err);
    res.status(400).json({ ok:false, message: err.message || 'Create failed' });
  }
};

// 수정
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ ok:false, message:'Invalid id' });

    const body = { ...req.body };
    ['unitPrice','requiredQty','endOfMonthStock'].forEach(k=>{
      if (body[k] === '') delete body[k];
      if (typeof body[k] !== 'undefined') body[k] = toNum(body[k]);
    });

    const item = await ProductionItem.findByIdAndUpdate(
      id, body, { new:true, runValidators:true }
    ).lean({ virtuals: true });
    if (!item) return res.status(404).json({ ok:false, message:'Not found' });
    res.json({ ok:true, item });
  } catch (err) {
    console.error(err);
    res.status(400).json({ ok:false, message: err.message || 'Update failed' });
  }
};

// 삭제
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ ok:false, message:'Invalid id' });
    const del = await ProductionItem.findByIdAndDelete(id);
    if (!del) return res.status(404).json({ ok:false, message:'Not found' });
    res.json({ ok:true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ ok:false, message: err.message || 'Delete failed' });
  }
};

// 입고 라인 추가
exports.addInbound = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ ok:false, message:'Invalid id' });

    const payload = {
      qty: toNum(req.body.qty, null),
      date: req.body.date ? new Date(req.body.date) : null,
      defects: toNum(req.body.defects, 0),
      lossDamage: toNum(req.body.lossDamage, 0),
      increase: toNum(req.body.increase, 0),
      note: req.body.note || '',
    };
    if (payload.qty == null || !payload.date)
      return res.status(400).json({ ok:false, message:'qty/date required' });

    const item = await ProductionItem.findByIdAndUpdate(
      id, { $push: { inbound: payload } }, { new:true }
    ).lean({ virtuals: true });

    if (!item) return res.status(404).json({ ok:false, message:'Not found' });
    res.json({ ok:true, item });
  } catch (err) {
    console.error(err);
    res.status(400).json({ ok:false, message:'Add inbound failed' });
  }
};

// 월 요약
exports.monthlySummary = async (req, res) => {
  try {
    const { month } = req.query;
    if (!month) return res.status(400).json({ ok:false, message:'month required' });

    const rows = await ProductionItem.aggregate([
      { $match: { monthKey: month } },
      { $addFields: {
          inboundTotal: { $sum: '$inbound.qty' },
          defectsTotal: { $sum: '$inbound.defects' },
          lossDamageTotal: { $sum: '$inbound.lossDamage' },
          increaseTotal: { $sum: '$inbound.increase' },
        } },
      { $addFields: {
          stockTotal: {
            $subtract: [
              { $add: ['$endOfMonthStock', '$inboundTotal', '$increaseTotal'] },
              { $add: ['$defectsTotal', '$lossDamageTotal'] },
            ],
          },
        } },
      { $addFields: {
          shortage: { $subtract: ['$stockTotal', '$requiredQty'] },
          stockValue: { $multiply: ['$stockTotal', '$unitPrice'] },
        } },
      { $project: {
          customerName:1, carType:1, division:1, endPName:1, endPNo:1,
          partNo:1, partName:1, material:1, unitPrice:1, requiredQty:1,
          endOfMonthStock:1, inboundTotal:1, defectsTotal:1, lossDamageTotal:1, increaseTotal:1,
          stockTotal:1, shortage:1, stockValue:1, supplierName:1, monthKey:1,
        } },
      { $sort: { shortage: 1, partNo: 1 } },
    ]);
    res.json({ ok:true, items: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok:false, message:'Summary failed' });
  }
};

// 엑셀 업로드
exports.uploadProductionExcelController = async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ ok:false, message:'파일이 없습니다.' });
    const dryRun = String(req.query.dryRun || 'false').toLowerCase() === 'true';
    const report = await parseAndInsertProductionsFromExcel(req.file.buffer, { dryRun });
    res.json(report);
  } catch (err) {
    console.error('[uploadProductionExcelController]', err);
    res.status(500).json({ ok:false, message: err.message || '서버 오류' });
  }
};
