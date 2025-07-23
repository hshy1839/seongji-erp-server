const Shipping = require('../models/Shipping');  // Shipping 모델 경로 맞게 조정 필요

// 전체 납품 목록 조회
exports.getAllShippings = async (req, res, next) => {
  try {
    const shippings = await Shipping.find()
      .populate('productId', 'name productNumber category')
      .sort({ shippingDate: -1 });
    res.json(shippings);
  } catch (error) {
    next(error);
  }
};

// 단일 납품 조회
exports.getShippingById = async (req, res, next) => {
  try {
    const shipping = await Shipping.findById(req.params.id)
      .populate('productId', 'name productNumber category');
    if (!shipping) return res.status(404).json({ message: 'Shipping not found' });
    res.json(shipping);
  } catch (error) {
    next(error);
  }
};

// 납품 생성
exports.createShipping = async (req, res, next) => {
  try {
    const data = {
      ...req.body,
      quantity: Number(req.body.quantity),
      unitPrice: Number(req.body.unitPrice), // ✅ 여기!
    };
    const shipping = new Shipping(req.body);
    const saved = await shipping.save();
    res.status(201).json(saved);
  } catch (error) {
    next(error);
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
