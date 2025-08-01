
const Product = require('../models/Product');
const Stock = require('../models/Stock');

// 전체 제품 목록 조회
exports.getAllProducts = async (req, res, next) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (error) {
    next(error);
  }
};

// 단일 제품 조회 (id 기준)
exports.getProductById = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (error) {
    next(error);
  }
};

// 제품 생성
// 제품 생성
exports.createProduct = async (req, res, next) => {
  try {
    // 1. 제품 저장
    const product = new Product(req.body);
    const savedProduct = await product.save();

    // 2. 해당 제품에 대한 Stock 초기화 등록 (수량: 0)
    const stock = new Stock({
      item: savedProduct._id,
      itemType: 'Product',
      quantity: 0,
      location: '',
      status: '정상',
      netQuantity: 0,
    });
    await stock.save();

    res.status(201).json(savedProduct);
  } catch (error) {
    next(error);
  }
};


// 제품 업데이트 (전체 또는 일부 필드)
exports.updateProduct = async (req, res, next) => {
  try {
    const updated = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ message: 'Product not found' });
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

// 제품 삭제
exports.deleteProduct = async (req, res, next) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Product not found' });
    res.json({ message: 'Product deleted' });
  } catch (error) {
    next(error);
  }
};
