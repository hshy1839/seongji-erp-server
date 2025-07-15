const Stock = require('../models/Stock');

// 전체 재고 조회
exports.getAllStocks = async (req, res, next) => {
  try {
    const stocks = await Stock.find()
      .populate('productId', 'name productNumber category')
      .sort({ updatedAt: -1 });
    res.json(stocks);
  } catch (error) {
    next(error);
  }
};

// 단일 재고 조회
exports.getStockById = async (req, res, next) => {
  try {
    const stock = await Stock.findById(req.params.id)
      .populate('productId', 'name productNumber category');
    if (!stock) return res.status(404).json({ message: 'Stock not found' });
    res.json(stock);
  } catch (error) {
    next(error);
  }
};

// 재고 생성
exports.createStock = async (req, res, next) => {
  try {
    const stock = new Stock(req.body);
    const saved = await stock.save();
    res.status(201).json(saved);
  } catch (error) {
    next(error);
  }
};

// 재고 업데이트 (전체 혹은 부분)
exports.updateStock = async (req, res, next) => {
  try {
    const updated = await Stock.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('productId', 'name productNumber category');
    if (!updated) return res.status(404).json({ message: 'Stock not found' });
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

// 재고 삭제
exports.deleteStock = async (req, res, next) => {
  try {
    const deleted = await Stock.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Stock not found' });
    res.json({ message: 'Stock deleted' });
  } catch (error) {
    next(error);
  }
};
