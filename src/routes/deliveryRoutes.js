// routes/deliveryRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const deliveryController = require('../controllers/deliveryController');

// 파일 업로드용 미들웨어 (메모리 저장)
const upload = multer({ storage: multer.memoryStorage() });

router.use((req, res, next) => {
  // 공통 미들웨어 (예: 인증)
  next();
});

// ✅ 엑셀 업로드 (DryRun 지원)
// POST /deliveries/upload-excel?dryRun=true&tzOffsetMin=540
router.post(
  '/deliveries/upload-excel',
  upload.single('file'),
  deliveryController.uploadDeliveriesExcel
);

// CRUD
router.get('/deliveries', deliveryController.getAllDeliveries);
router.get('/deliveries/:id', deliveryController.getDeliveryById);
router.post('/deliveries', deliveryController.createDelivery);
router.put('/deliveries/:id', deliveryController.updateDelivery);
router.patch('/deliveries/:id', deliveryController.updateDelivery);
router.delete('/deliveries/:id', deliveryController.deleteDelivery);

module.exports = router;
