const Packaging = require('../models/Packaging');

// 전체 포장 내역 조회
exports.getAllPackagings = async (req, res, next) => {
  try {
    const packagings = await Packaging.find()
      .populate('item', 'name code category productNumber')
      .populate('materialsUsed.material', 'name code category') // ✅ 포장재 정보도 populate
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
      .populate('item', 'name code category productNumber')
      .populate('materialsUsed.material', 'name code category'); // ✅
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
    const populated = await saved.populate([
      { path: 'item', select: 'name code category productNumber' },
      { path: 'materialsUsed.material', select: 'name code category' },
    ]);
    res.status(201).json(populated);
  } catch (error) {
    next(error);
  }
};


// 포장 내역 업데이트
exports.updatePackaging = async (req, res, next) => {
  try {
    const updated = await Packaging.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate('item', 'name code category')
      .populate('materialsUsed.material', 'name code category');
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
