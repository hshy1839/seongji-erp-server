const Order = require('../models/Order');

// 전체 발주 조회
exports.getAllOrders = async (req, res, next) => {
  try {
    const orders = await Order.find()
      .populate('productId', 'name productNumber category')
      .sort({ orderDate: -1 });
    res.json(orders);
  } catch (err) {
    next(err);
  }
};

// 단일 발주 조회
exports.getOrderById = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('productId', 'name productNumber category');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (err) {
    next(err);
  }
};

// 발주 생성
exports.createOrder = async (req, res, next) => {
  try {
    const order = new Order(req.body);
    const saved = await order.save();
    res.status(201).json(saved);
  } catch (err) {
    next(err);
  }
};

// 발주 수정 (전체/부분 수정 둘 다 처리)
exports.updateOrder = async (req, res, next) => {
  try {
    const updated = await Order.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate('productId', 'name productNumber category');
    if (!updated) return res.status(404).json({ message: 'Order not found' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// 발주 삭제
exports.deleteOrder = async (req, res, next) => {
  try {
    const deleted = await Order.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Order not found' });
    res.json({ message: 'Order deleted' });
  } catch (err) {
    next(err);
  }
};
