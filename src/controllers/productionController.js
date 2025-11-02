// src/controllers/productionController.js
const mongoose = require('mongoose');
const dayjs = require('dayjs');
const ProductionItem = require('../models/productionItem');
const { parseAndInsertProductionsFromExcel } = require('../middlewares/productionExcelService');

// ===== utils =====
const toNum = (v, d = 0) => {
  if (v === null || v === undefined || v === '') return d;
  const n = Number(String(v).replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : d;
};
const toMonthKey = (d) => dayjs(d || new Date()).format('YYYY-MM');

// ===== 목록
exports.list = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sort = '-updatedAt',
      month,         // monthKey
      division,
      partNo,
      q,             // division/partNo 부분검색
    } = req.query;

    const filter = {};
    if (month) filter.monthKey = month;
    if (division) filter.division = division;
    if (partNo) filter.partNo = partNo;
    if (q) {
      const rx = new RegExp(q, 'i');
      filter.$or = [{ division: rx }, { partNo: rx }];
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Math.min(200, Number(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      ProductionItem.find(filter).sort(sort).skip(skip).limit(limitNum).lean(),
      ProductionItem.countDocuments(filter),
    ]);
    res.json({ ok: true, page: pageNum, limit: limitNum, total, items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: 'Failed to fetch production items' });
  }
};

// ===== 단건
exports.getOne = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });
    const item = await ProductionItem.findById(id).lean();
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    res.json({ ok: true, item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: 'Failed to fetch item' });
  }
};

// ===== 생성
exports.create = async (req, res) => {
  try {
    const body = { ...req.body };

    // 필수 기본값/검증
    if (!body.monthKey) body.monthKey = toMonthKey(body.date || new Date());
    body.quantity = toNum(body.quantity, null);

    if (!body.division || !body.partNo) {
      return res.status(400).json({ ok: false, message: 'division, partNo are required' });
    }
    if (body.quantity == null || body.quantity < 0) {
      return res.status(400).json({ ok: false, message: 'valid quantity is required' });
    }

    const item = await ProductionItem.create({
      monthKey: body.monthKey,
      division: String(body.division).trim(),
      partNo: String(body.partNo).trim(),
      quantity: body.quantity,
      remark: body.remark || '',
    });

    res.status(201).json({ ok: true, item });
  } catch (err) {
    console.error(err);
    res.status(400).json({ ok: false, message: err.message || 'Create failed' });
  }
};

exports.summary = async (req, res) => {
  try {
    const rows = await ProductionItem.aggregate([
      {
        $group: {
          _id: { division: '$division', partNo: '$partNo' },
          quantity: { $sum: '$quantity' },
        },
      },
      {
        $project: {
          _id: 0,
          division: '$_id.division',
          partNo: '$_id.partNo',
          quantity: 1,
        },
      },
      { $sort: { division: 1, partNo: 1 } },
    ]);
    res.json({ ok: true, items: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: 'Summary failed' });
  }
};

// ===== 수정
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });

    const body = { ...req.body };
    const update = {};

    if (typeof body.monthKey === 'string' && body.monthKey.trim()) update.monthKey = body.monthKey.trim();
    if (typeof body.division === 'string') update.division = body.division.trim();
    if (typeof body.partNo === 'string') update.partNo = body.partNo.trim();
    if (body.remark !== undefined) update.remark = String(body.remark || '').trim();

    if (body.quantity !== undefined) {
      const q = toNum(body.quantity, null);
      if (q == null || q < 0) return res.status(400).json({ ok: false, message: 'valid quantity is required' });
      update.quantity = q;
    }

    const item = await ProductionItem.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    }).lean();

    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    res.json({ ok: true, item });
  } catch (err) {
    console.error(err);
    res.status(400).json({ ok: false, message: err.message || 'Update failed' });
  }
};

// ===== 삭제
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ ok: false, message: 'Invalid id' });
    const del = await ProductionItem.findByIdAndDelete(id);
    if (!del) return res.status(404).json({ ok: false, message: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ ok: false, message: err.message || 'Delete failed' });
  }
};

// ===== (간단) 월 요약: division, partNo 별 quantity 합계
exports.monthlySummary = async (req, res) => {
  try {
    const { month } = req.query;
    if (!month) return res.status(400).json({ ok: false, message: 'month required' });

    const rows = await ProductionItem.aggregate([
      { $match: { monthKey: month } },
      {
        $group: {
          _id: { division: '$division', partNo: '$partNo' },
          quantity: { $sum: '$quantity' },
        },
      },
      {
        $project: {
          _id: 0,
          division: '$_id.division',
          partNo: '$_id.partNo',
          quantity: 1,
        },
      },
      { $sort: { division: 1, partNo: 1 } },
    ]);

    res.json({ ok: true, items: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: 'Summary failed' });
  }
};

// ===== 엑셀 업로드
exports.uploadProductionExcelController = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ ok: false, message: '파일이 없습니다.' });
    }

   
    const month = typeof req.query.month === 'string' ? req.query.month.trim() : undefined;

    const result = await parseAndInsertProductionsFromExcel(req.file.buffer, { month });
   // result: { ok, monthKey, totalRows, processed, failed, errors }
   return res.json(result);
  } catch (err) {
    console.error('[uploadProductionExcelController]', err);
    const message = err?.message || '서버 오류';
    const isUserError = /필수 헤더 누락|파싱 실패|수량 0 이하|엑셀 시트가 비어/i.test(message);
    return res.status(isUserError ? 400 : 500).json({ ok: false, message });
  }
};
