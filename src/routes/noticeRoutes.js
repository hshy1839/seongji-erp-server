const express = require('express');
const router = express.Router();

const noticeController = require('../controllers/noticeController');

// 공통 미들웨어 (ex. 인증, 로깅 등)
router.use((req, res, next) => {
  next();
});

// 전체 공지사항 조회
router.get('/notices', noticeController.getAllNotices);

// 단일 공지사항 조회
router.get('/notices/:id', noticeController.getNoticeById);

// 공지사항 등록
router.post('/notices', noticeController.createNotice);

// 공지사항 수정
router.put('/notices/:id', noticeController.updateNotice);

// 공지사항 삭제
router.delete('/notices/:id', noticeController.deleteNotice);

module.exports = router;
