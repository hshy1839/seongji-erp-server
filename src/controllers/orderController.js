const Order = require('../models/Order');
const XLSX = require('xlsx');
const Product = require('../models/Product');
const Material = require('../models/Material');
const { parseAndInsertOrdersFromExcel } = require('../middlewares/orderExcelService');
const mongoose = require('mongoose');


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
exports.updateOrder = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ ok:false, message:'잘못된 id 형식입니다.' });
    }

    // 빈값 sanitize (선택)
    const body = { ...req.body };
    if (body.quantity === '') delete body.quantity;
    if (typeof body.quantity === 'string') {
      const q = Number(body.quantity);
      if (Number.isFinite(q)) body.quantity = q;
    }
    if (body.orderDate === '') delete body.orderDate;
    if (typeof body.orderDate === 'string') {
      const d = new Date(body.orderDate);
      if (!Number.isNaN(d.getTime())) body.orderDate = d;
    }
    if (req.user?.name) body.requester = req.user.name;

    const doc = await Order.findByIdAndUpdate(req.params.id, body, {
      new: true,
      runValidators: true,
    });
    if (!doc) return res.status(404).json({ ok:false, message: 'Order not found' });

    // 스키마에 존재할 때만 populate
    const populatePaths = [];
    if (Order.schema.path('item')) {
      populatePaths.push({ path: 'item', strictPopulate: false });
    }
    if (Order.schema.path('productId')) {
      populatePaths.push({ path: 'productId', select: 'name code productNumber category', strictPopulate: false });
    }
    if (Order.schema.path('orderCompany')) {
      populatePaths.push({ path: 'orderCompany', select: 'name type', strictPopulate: false });
    }
    if (populatePaths.length) {
      await doc.populate(populatePaths);
    }

    res.json(doc);
  } catch (err) {
    console.error('[updateOrder ERROR]', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ ok:false, type:'ValidationError', message: err.message, errors: err.errors });
    }
    if (err.name === 'CastError') {
      return res.status(400).json({ ok:false, type:'CastError', path: err.path, value: err.value, message:'값 형식이 올바르지 않습니다.' });
    }
    res.status(500).json({ ok:false, message:'Internal Server Error' });
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