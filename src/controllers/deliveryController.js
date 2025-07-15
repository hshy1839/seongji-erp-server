const Delivery = require('../models/Delivery');

// 전체 납입 조회
exports.getAllDeliveries = async (req, res, next) => {
  try {
    const deliveries = await Delivery.find()
      .populate('productId', 'name productNumber category')
      .sort({ deliveryDate: -1 });
    res.json(deliveries);
  } catch (err) {
    next(err);
  }
};

// 단일 납입 조회
exports.getDeliveryById = async (req, res, next) => {
  try {
    const delivery = await Delivery.findById(req.params.id)
      .populate('productId', 'name productNumber category');
    if (!delivery) return res.status(404).json({ message: 'Delivery not found' });
    res.json(delivery);
  } catch (err) {
    next(err);
  }
};

// 납입 생성
exports.createDelivery = async (req, res, next) => {
  try {
    const delivery = new Delivery(req.body);
    const saved = await delivery.save();
    res.status(201).json(saved);
  } catch (err) {
    next(err);
  }
};

// 납입 수정 (전체/부분)
exports.updateDelivery = async (req, res, next) => {
  try {
    const updated = await Delivery.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate('productId', 'name productNumber category');
    if (!updated) return res.status(404).json({ message: 'Delivery not found' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// 납입 삭제
exports.deleteDelivery = async (req, res, next) => {
  try {
    const deleted = await Delivery.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Delivery not found' });
    res.json({ message: 'Delivery deleted' });
  } catch (err) {
    next(err);
  }
};
