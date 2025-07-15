// src/controllers/packaging.controller.js
const Packaging = require('../models/Packaging');

// 전체 포장 내역 조회
exports.getAllPackagings = async (req, res, next) => {
  try {
    const packagings = await Packaging.find()
      .populate('productId', 'name productNumber category') // 제품 정보 일부 포함
      .sort({ packagingDate: -1 });
    res.json(packagings);
  } catch (error) {
    next(error);
  }
};

// 단일 포장 내역 조회
exports.getPackagingById = async (req, res, next) => {
  try {
    const packaging = await Packaging.findById(req.params.id)
      .populate('productId', 'name productNumber category');
    if (!packaging) return res.status(404).json({ message: 'Packaging not found' });
    res.json(packaging);
  } catch (error) {
    next(error);
  }
};

// 포장 내역 생성
exports.createPackaging = async (req, res, next) => {
  try {
    const packaging = new Packaging(req.body);
    const saved = await packaging.save();
    res.status(201).json(saved);
  } catch (error) {
    next(error);
  }
};

// 포장 내역 업데이트 (전체 또는 일부)
exports.updatePackaging = async (req, res, next) => {
  try {
    const updated = await Packaging.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('productId', 'name productNumber category');
    if (!updated) return res.status(404).json({ message: 'Packaging not found' });
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

// 포장 내역 삭제
exports.deletePackaging = async (req, res, next) => {
  try {
    const deleted = await Packaging.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Packaging not found' });
    res.json({ message: 'Packaging deleted' });
  } catch (error) {
    next(error);
  }
};
