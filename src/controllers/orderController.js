const Order = require('../models/Order');
const XLSX = require('xlsx');
const Product = require('../models/Product');
const Material = require('../models/Material');
const { parseAndInsertOrdersFromExcel } = require('../middlewares/orderExcelService');


// 전체 발주 조회
exports.getAllOrders = async (req, res, next) => {
  try {
   const orders = await Order.find()
  .populate({ path: 'item', strictPopulate: false, select: 'name category productNumber code' })
  .sort({ orderDate: -1 });
    res.json(orders);
  } catch (err) {
    next(err);
  }
};


// 단일 발주 조회
exports.getOrderById = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).populate('item');
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
    }).populate('item');
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


exports.uploadOrdersExcelController = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ ok: false, message: '파일이 없습니다.' });
    }

    // ?dryRun=true 로 미리 검증만 가능
    const dryRun = String(req.query.dryRun || 'false').toLowerCase() === 'true';

    const result = await parseAndInsertOrdersFromExcel(req.file.buffer, { dryRun });

    return res.json({ ok: true, dryRun, ...result });
  } catch (err) {
    console.error('uploadOrdersExcelController error:', err);
    return res.status(500).json({ ok: false, message: err.message || '서버 오류' });
  }
};