// controllers/shortageController.js
const XLSX = require('xlsx'); // (다른 곳에서 쓰면 유지, 아니면 제거 가능)
const ShortageItem = require('../models/ShortageItem');
const { parseAndUpsertShortagesFromExcel } = require('../middlewares/shortageExcelService');

/**
 * 리스트 조회 (검색/필터/정렬/페이지네이션)
 * GET /api/shortages
 * query:
 *  - q (텍스트 검색: division/material/materialCode/supplier)
 *  - division, materialCode, supplier (정확 필터)
 *  - page=1, limit=20
 *  - sort=-updatedAt (기본 최신순)
 */
exports.listShortages = async (req, res) => {
  try {
    const {
      q,
      division,
      materialCode,
      supplier,
      page = 1,
      limit = 20,
      sort = '-updatedAt',
    } = req.query;

    const filter = {};
    if (division) filter.division = division;
    if (materialCode) filter.materialCode = materialCode;
    if (supplier) filter.supplier = supplier;

    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { division: rx },
        { material: rx },
        { materialCode: rx },
        { supplier: rx },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      ShortageItem.find(filter).sort(String(sort)).skip(skip).limit(Number(limit)),
      ShortageItem.countDocuments(filter),
    ]);

    res.json({
      ok: true,
      page: Number(page),
      limit: Number(limit),
      total,
      items,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: 'listShortages failed', error: err.message });
  }
};

/**
 * 단건 조회
 * GET /api/shortages/:id
 */
exports.getShortage = async (req, res) => {
  try {
    const item = await ShortageItem.findById(req.params.id);
    if (!item) return res.status(404).json({ ok: false, message: 'Not found' });
    res.json({ ok: true, item });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'getShortage failed', error: err.message });
  }
};

/**
 * 생성(또는 업서트)
 * POST /api/shortages
 * body: { division*, material*, materialCode*, supplier?, inQty?, stockQty? }
 * 옵션: upsert=true (기본 true)
 */
exports.createOrUpsertShortage = async (req, res) => {
  try {
    const { division, material, materialCode, supplier, inQty, stockQty, upsert = true } = req.body;

    if (!division || !material || !materialCode) {
      return res.status(400).json({ ok: false, message: 'division, material, materialCode are required' });
    }

    if (upsert) {
      const doc = await ShortageItem.upsertByKey(
        { division, material, materialCode },
        { supplier, inQty, stockQty }
      );
      return res.status(200).json({ ok: true, upserted: true, item: doc });
    } else {
      const created = await ShortageItem.create({ division, material, materialCode, supplier, inQty, stockQty });
      return res.status(201).json({ ok: true, upserted: false, item: created });
    }
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ ok: false, message: 'Duplicate key', key: err.keyValue });
    }
    res.status(500).json({ ok: false, message: 'createOrUpsertShortage failed', error: err.message });
  }
};

/**
 * 수정
 * PATCH /api/shortages/:id
 */
exports.updateShortage = async (req, res) => {
  try {
    const { supplier, inQty, stockQty, division, material, materialCode } = req.body;

    const toSet = {};
    if (supplier !== undefined) toSet.supplier = supplier;
    if (inQty !== undefined) toSet.inQty = inQty;
    if (stockQty !== undefined) toSet.stockQty = stockQty;
    if (division !== undefined) toSet.division = division;
    if (material !== undefined) toSet.material = material;
    if (materialCode !== undefined) toSet.materialCode = materialCode;

    const updated = await ShortageItem.findByIdAndUpdate(
      req.params.id,
      { $set: toSet },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ ok: false, message: 'Not found' });
    res.json({ ok: true, item: updated });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ ok: false, message: 'Duplicate key', key: err.keyValue });
    }
    res.status(500).json({ ok: false, message: 'updateShortage failed', error: err.message });
  }
};

/**
 * 삭제
 * DELETE /api/shortages/:id
 */
exports.deleteShortage = async (req, res) => {
  try {
    const removed = await ShortageItem.findByIdAndDelete(req.params.id);
    if (!removed) return res.status(404).json({ ok: false, message: 'Not found' });
    res.json({ ok: true, deletedId: removed._id });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'deleteShortage failed', error: err.message });
  }
};

/**
 * 엑셀 업로드 (서비스 위임)
 * POST /api/shortages/upload?dryRun=true|false&overwriteToday=true|false
 * form-data: file=<xlsx>
 */
exports.uploadShortagesExcelController = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ ok: false, message: '파일이 없습니다.' });
    }

    const dryRun = String(req.query.dryRun ?? 'false').toLowerCase() === 'true';
    const tzOffsetMinRaw = Number(req.query.tzOffsetMin);
    const tzOffsetMin = Number.isFinite(tzOffsetMinRaw) ? tzOffsetMinRaw : 540;
    const overwriteToday = String(req.query.overwriteToday ?? 'false').toLowerCase() === 'true';

    const result = await parseAndUpsertShortagesFromExcel(req.file.buffer, {
      dryRun,
      tzOffsetMin,
      overwriteToday,
    });

    return res.json({ ok: true, dryRun, tzOffsetMin, overwriteToday, ...result });
  } catch (err) {
    console.error('uploadShortagesExcelController error:', err);
    const message = err?.message || '서버 오류';
    const isUserError = /필수 헤더 누락|파싱 실패|엑셀 시트가 비어있습니다/i.test(message);
    return res.status(isUserError ? 400 : 500).json({ ok: false, message });
  }
};
