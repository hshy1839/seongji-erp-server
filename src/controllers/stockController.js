const Stock = require('../models/Stock');

// 전체 재고 조회
exports.getAllStocks = async (req, res, next) => {
  try {
    const stocks = await Stock.find().sort({ updatedAt: -1 });

    // 제품/자재 정보 합쳐서 응답
    const populated = await Promise.all(
      stocks.map(async (stock) => {
        const model = stock.itemType === 'Product' ? 'Product' : 'Material';
        const populatedItem = await stock.populate({ path: 'item', model, select: 'name code productNumber category' });
        return populatedItem;
      })
    );

    res.json(populated);
  } catch (error) {
    next(error);
  }
};

// 단일 재고 조회
exports.getStockById = async (req, res, next) => {
  try {
    const stock = await Stock.findById(req.params.id);
    if (!stock) return res.status(404).json({ message: 'Stock not found' });

    const model = stock.itemType === 'Product' ? 'Product' : 'Material';
    const populated = await stock.populate({ path: 'item', model, select: 'name code productNumber category' });

    res.json(populated);
  } catch (error) {
    next(error);
  }
};

// 재고 생성
exports.createStock = async (req, res, next) => {
  try {
    const stock = new Stock(req.body);
    const saved = await stock.save();

    const model = saved.itemType === 'Product' ? 'Product' : 'Material';
    const populated = await saved.populate({ path: 'item', model, select: 'name code productNumber category' });

    res.status(201).json(populated);
  } catch (error) {
    next(error);
  }
};

// 재고 업데이트
exports.updateStock = async (req, res, next) => {
  try {
    const { _id, quantity, location } = req.body;

    const stock = await Stock.findById(_id);
    if (!stock) return res.status(404).json({ message: 'Stock not found' });

    const diff = Number(quantity) - Number(stock.quantity);

    stock.quantity = quantity;
    stock.netQuantity += diff; // 누적 증가
    stock.location = location;
    stock.updatedAt = new Date();

    const updated = await stock.save();
    res.json(updated);
  } catch (err) {
    next(err);
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
