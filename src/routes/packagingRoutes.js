const express = require('express');
const router = express.Router();

const {
  getAllPackagings,
  getPackagingById,
  createPackaging,
  updatePackaging,
  deletePackaging,
} = require('../controllers/packagingController');

// 공통 미들웨어 (필요하면)
router.use((req, res, next) => {
  // 예: 인증 체크, 로깅 등
  next();
});

// 전체 포장 내역 조회
router.get('/packagings', getAllPackagings);

// 단일 포장 내역 조회
router.get('/packagings/:id', getPackagingById);

// 새 포장 내역 생성
router.post('/packagings', createPackaging);

// 포장 내역 전체 수정
router.put('/packagings/:id', updatePackaging);

// 포장 내역 부분 수정
router.patch('/packagings/:id', updatePackaging);

// 포장 내역 삭제
router.delete('/packagings/:id', deletePackaging);

module.exports = router;
