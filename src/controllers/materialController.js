// src/controllers/material.controller.js
const Material = require('../models/Material');
const Stock = require('../models/Stock'); 

// 전체 부자재 조회
exports.getAllMaterials = async (req, res, next) => {
  try {
    const materials = await Material.find().sort({ name: 1 }); // 이름순 정렬
    res.json(materials);
  } catch (error) {
    next(error);
  }
};

// 단일 부자재 조회
exports.getMaterialById = async (req, res, next) => {
  try {
    const material = await Material.findById(req.params.id);
    if (!material) return res.status(404).json({ message: 'Material not found' });
    res.json(material);
  } catch (error) {
    next(error);
  }
};

// 부자재 생성
exports.createMaterial = async (req, res, next) => {
  try {
    // 1. 부자재 저장
    const material = new Material(req.body);
    const savedMaterial = await material.save();

    // 2. 해당 부자재에 대한 Stock 등록 (수량 0)
    const stock = new Stock({
      item: savedMaterial._id,
      itemType: 'Material',
      quantity: 0,
      location: '',
      status: '정상',
      netQuantity: 0,
    });
    await stock.save();

    res.status(201).json(savedMaterial);
  } catch (error) {
    next(error);
  }
};


// 부자재 수정
exports.updateMaterial = async (req, res, next) => {
  try {
    const updated = await Material.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: 'Material not found' });
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

// 부자재 삭제
exports.deleteMaterial = async (req, res, next) => {
  try {
    const deleted = await Material.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Material not found' });
    res.json({ message: 'Material deleted' });
  } catch (error) {
    next(error);
  }
};
