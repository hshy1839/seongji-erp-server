// src/routes/shippingRoutes.js
const express = require('express');
const multer = require('multer');
const shippingController = require('../controllers/shippingController');

const router = express.Router();

// 공통 미들웨어 (인증/로깅 등 필요하면 여기)
router.use((req, res, next) => {
  next();
});

const upload = multer({ storage: multer.memoryStorage() });

// ✅ 여기서부터는 "기본 경로 = /api/shippings" 라고 가정
//    => app.js 에서 app.use('/api/shippings', shippingRoutes); 로 붙일 거야.

// 전체 납품 목록
router.get('/', shippingController.getAllShippings);

// 단일 납품 조회
router.get('/:id', shippingController.getShippingById);

// 생성
router.post('/', shippingController.createShipping);

// 수정 (PUT / PATCH 둘 다 동일 로직 사용)
router.put('/:id', shippingController.updateShipping);
router.patch('/:id', shippingController.updateShipping);

// 삭제
router.delete('/:id', shippingController.deleteShipping);

// 엑셀 업로드
router.post(
  '/upload-excel',
  upload.single('file'),
  shippingController.uploadShippingsExcelController
);

module.exports = router;
