const Shipping = require('../models/Shipping');  // Shipping 모델 경로 맞게 조정 필요
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
exports.updateShipping = async (req, res, next) => {
  try {
    const updated = await Shipping.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('productId', 'name productNumber category');

    if (!updated) return res.status(404).json({ message: 'Shipping not found' });
    res.json(updated);
  } catch (error) {
    next(error);
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