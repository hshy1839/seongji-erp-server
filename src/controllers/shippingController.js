const Shipping = require('../models/Shipping');  // Shipping 모델 경로 맞게 조정 필요
const mongoose = require('mongoose'); 
const { parseAndInsertShippingsFromExcel } = require('../middlewares/shippingExcelService');
// 전체 납품 목록 조회
exports.getAllShippings = async (req, res, next) => {
  try {
   const shipping = await Shipping.find()
  .populate({ path: 'item', strictPopulate: false, select: 'name category productNumber code' })
  .sort({ shippingDate: -1 });
    res.json(shipping);
  } catch (err) {
    next(err);
  }
};

// 단일 납품 조회
exports.getShippingById = async (req, res, next) => {
  try {
    const shipping = await Shipping.findById(req.params.id).populate('item');
    if (!shipping) return res.status(404).json({ message: 'Order not found' });
    res.json(shipping);
  } catch (err) {
    next(err);
  }
};

// 납품 생성
exports.createShipping = async (req, res, next) => {
  try {
    const shipping = new Shipping(req.body);
    const saved = await shipping.save();
    res.status(201).json(saved);
  } catch (err) {
    next(err);
  }
};

// 납품 수정 (전체/부분)
exports.updateShipping = async (req, res) => {
  try {
    // ObjectId 형식 검증
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ ok:false, message: '잘못된 id 형식입니다.' });
    }

    // 바디 sanitize
    const body = { ...req.body };

    if (body.quantity === '') delete body.quantity;
    if (typeof body.quantity === 'string') {
      const q = Number(body.quantity);
      if (Number.isFinite(q)) body.quantity = q;
    }

    if (body.shippingDate === '') delete body.shippingDate;
    if (typeof body.shippingDate === 'string') {
      const d = new Date(body.shippingDate);
      if (!Number.isNaN(d.getTime())) body.shippingDate = d;
    }

    if (req.user?.name) body.requester = req.user.name;

    // 업데이트
    const doc = await Shipping.findByIdAndUpdate(req.params.id, body, {
      new: true,
      runValidators: true,
    });

    if (!doc) return res.status(404).json({ ok:false, message: 'Shipping not found' });

    // 스키마에 있을 때만 populate
    const populatePaths = [];
    if (Shipping.schema.path('productId')) {
      populatePaths.push({ path: 'productId', select: 'name productNumber category', strictPopulate: false });
    }
    if (Shipping.schema.path('shippingCompany')) {
      populatePaths.push({ path: 'shippingCompany', select: 'name type', strictPopulate: false });
    }
    if (populatePaths.length) {
      await doc.populate(populatePaths);
    }

    return res.json(doc);
  } catch (error) {
    console.error('[updateShipping ERROR]', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ ok:false, type:'ValidationError', message: error.message, errors: error.errors });
    }
    if (error.name === 'CastError') {
      return res.status(400).json({ ok:false, type:'CastError', path: error.path, value: error.value, message: '값 형식이 올바르지 않습니다.' });
    }
    if (error.name === 'StrictPopulateError') {
      return res.status(400).json({ ok:false, type:'StrictPopulateError', message: error.message, path: error.path });
    }
    return res.status(500).json({ ok:false, message: 'Internal Server Error' });
  }
};

// 납품 삭제
exports.deleteShipping = async (req, res, next) => {
  try {
    const deleted = await Shipping.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Shipping not found' });
    res.json({ message: 'Shipping deleted' });
  } catch (error) {
    next(error);
  }
};

exports.uploadShippingsExcelController = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ ok: false, message: '파일이 없습니다.' });
    }

    // ?dryRun=true 로 미리 검증만 가능
    const dryRun = String(req.query.dryRun || 'false').toLowerCase() === 'true';

    const result = await parseAndInsertShippingsFromExcel(req.file.buffer, { dryRun });

    return res.json({ ok: true, dryRun, ...result });
  } catch (err) {
    console.error('uploadShippingsExcelController error:', err);
    return res.status(500).json({ ok: false, message: err.message || '서버 오류' });
  }
};