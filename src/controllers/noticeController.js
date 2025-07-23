const Notice = require('../models/Notice');

// 전체 공지사항 조회
exports.getAllNotices = async (req, res, next) => {
  try {
    const notices = await Notice.find().sort({ createdAt: -1 });
    res.json(notices);
  } catch (err) {
    next(err);
  }
};

// 단일 공지사항 조회
exports.getNoticeById = async (req, res, next) => {
  try {
    const notice = await Notice.findById(req.params.id);
    if (!notice) return res.status(404).json({ message: '공지사항이 없습니다' });
    res.json(notice);
  } catch (err) {
    next(err);
  }
};

// 공지사항 등록
exports.createNotice = async (req, res, next) => {
  try {
    const notice = new Notice(req.body);
    const saved = await notice.save();
    res.status(201).json(saved);
  } catch (err) {
    next(err);
  }
};

// 공지사항 수정
exports.updateNotice = async (req, res, next) => {
  try {
    const updated = await Notice.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: '공지사항이 없습니다' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// 공지사항 삭제
exports.deleteNotice = async (req, res, next) => {
  try {
    const deleted = await Notice.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: '공지사항이 없습니다' });
    res.json({ message: '삭제 완료' });
  } catch (err) {
    next(err);
  }
};
