// controllers/shippingController.js
const mongoose = require('mongoose');
const Shipping = require('../models/Shipping');
// 경로 주의: middlewares 가 아니라 services 폴더
const { parseAndInsertShippingsFromExcel } = require('../middlewares/shippingExcelService');

/**
 * 유틸: 안전한 숫자/날짜 캐스팅
 */
const toNum = (v) => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(String(v).replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : undefined;
};
const toDate = (v) => {
  if (!v || typeof v !== 'string') return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/**
 * GET /api/shippings
 * - 필터/검색/페이징/정렬 지원
 *   ?q=키워드(품명/품번/납품처 부분일치)
 *   ?company=납품처
 *   ?itemCode=품번
 *   ?status=WAIT|COMPLETE
 *   ?from=YYYY-MM-DD
 *   ?to=YYYY-MM-DD        (to 는 당일 23:59:59.999 까지 포함)
 *   ?page=1&limit=50
 *   ?sort=-shippingDate   (기본: -shippingDate)
 */
exports.getAllShippings = async (req, res, next) => {
  try {
    const {
      q,
      company,
      itemCode,
      status,
      from,
      to,
      page = 1,
      limit = 50,
      sort = '-shippingDate',
    } = req.query;

    const filter = {};

    if (q) {
      const regex = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { itemName: regex },
        { itemCode: regex },
        { shippingCompany: regex },
      ];
    }

    if (company) filter.shippingCompany = { $regex: new RegExp(company, 'i') };
    if (itemCode) filter.itemCode = { $regex: new RegExp(itemCode, 'i') };
    if (status && ['WAIT', 'COMPLETE'].includes(String(status).toUpperCase())) {
      filter.status = String(status).toUpperCase();
    }

    // 날짜범위
    const fromDt = toDate(from);
    const toDt = toDate(to);
    if (fromDt || toDt) {
      filter.shippingDate = {};
      if (fromDt) filter.shippingDate.$gte = fromDt;
      if (toDt) {
        // to 의 날짜 끝까지 포함
        const end = new Date(toDt);
        end.setHours(23, 59, 59, 999);
        filter.shippingDate.$lte = end;
      }
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 1000);
    const skip = (pageNum - 1) * limitNum;

    const [rows, total] = await Promise.all([
      Shipping.find(filter).sort(sort).skip(skip).limit(limitNum).lean(),
      Shipping.countDocuments(filter),
    ]);

    return res.json({
      ok: true,
      total,
      page: pageNum,
      limit: limitNum,
      rows,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/shippings/:id
 */
exports.getShippingById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ ok: false, message: '잘못된 id 형식입니다.' });

    // 스키마에 참조필드가 없으므로 populate 제거
    const shipping = await Shipping.findById(id).lean();
    if (!shipping) return res.status(404).json({ ok: false, message: 'Shipping not found' });
    return res.json({ ok: true, data: shipping });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/shippings
 * body: { itemType, itemName?, itemCode, category, carType, shippingCompany*, quantity*, shippingDate*, requester?, status?, remark? }
 */
exports.createShipping = async (req, res, next) => {
  try {
    const body = { ...req.body };

    // 숫자/날짜 캐스팅
    const q = toNum(body.quantity);
    if (q !== undefined) body.quantity = q;

    const sd = toDate(body.shippingDate);
    if (sd) body.shippingDate = sd;

    // 요청자 자동 주입
    if (req.user?.name) body.requester = req.user.name;

    const doc = new Shipping(body);
    const saved = await doc.save();
    return res.status(201).json({ ok: true, data: saved });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/shippings/:id
 * 부분수정 허용
 */
exports.updateShipping = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ ok: false, message: '잘못된 id 형식입니다.' });

    const body = { ...req.body };

    // 공백 제거/형변환
    if (body.quantity === '') delete body.quantity;
    const q = toNum(body.quantity);
    if (q !== undefined) body.quantity = q;

    if (body.shippingDate === '') delete body.shippingDate;
    const sd = typeof body.shippingDate === 'string' ? toDate(body.shippingDate) : undefined;
    if (sd) body.shippingDate = sd;

    if (req.user?.name) body.requester = req.user.name;

    const doc = await Shipping.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
    }).lean();

    if (!doc) return res.status(404).json({ ok: false, message: 'Shipping not found' });

    return res.json({ ok: true, data: doc });
  } catch (error) {
    console.error('[updateShipping ERROR]', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        ok: false,
        type: 'ValidationError',
        message: error.message,
        errors: error.errors,
      });
    }
    if (error.name === 'CastError') {
      return res.status(400).json({
        ok: false,
        type: 'CastError',
        path: error.path,
        value: error.value,
        message: '값 형식이 올바르지 않습니다.',
      });
    }
    return res.status(500).json({ ok: false, message: 'Internal Server Error' });
  }
};

/**
 * DELETE /api/shippings/:id
 */
exports.deleteShipping = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ ok: false, message: '잘못된 id 형식입니다.' });

    const deleted = await Shipping.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ ok: false, message: 'Shipping not found' });
    return res.json({ ok: true, message: 'Shipping deleted' });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/shippings/upload-excel
 * - multer.single('file') 로 파일 수신
 * - 옵션:
 *   ?dryRun=true|false
 *   ?tzOffsetMin=540     (기본 KST)
 *   ?defaultShippingDate=YYYY-MM-DD (엑셀 날짜 누락시 일괄 적용)
 */
exports.uploadShippingsExcelController = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ ok: false, message: '파일이 없습니다.' });
    }

    const dryRun = String(req.query.dryRun || 'false').toLowerCase() === 'true';
    const tzOffsetMin = Number.isFinite(Number(req.query.tzOffsetMin))
      ? Number(req.query.tzOffsetMin)
      : 540;
    const defaultShippingDate = req.query.defaultShippingDate || null;

    const result = await parseAndInsertShippingsFromExcel(req.file.buffer, {
      dryRun,
      tzOffsetMin,
      defaultShippingDate,
    });

    return res.json({ ok: true, dryRun, ...result });
  } catch (err) {
    console.error('uploadShippingsExcelController error:', err);
    return res.status(500).json({ ok: false, message: err.message || '서버 오류' });
  }
};
