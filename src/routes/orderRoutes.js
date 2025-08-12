const express = require('express');
const router = express.Router();
const multer = require('multer');
const orderController = require('../controllers/orderController');

router.use((req, res, next) => {
  // 공통 미들웨어(예: 인증, 로깅)
  next();
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 1024 }, // 15MB
});

router.get('/orders', orderController.getAllOrders);
router.get('/orders/:id', orderController.getOrderById);
router.post('/orders', orderController.createOrder);
router.put('/orders/:id', orderController.updateOrder);
router.patch('/orders/:id', orderController.updateOrder);
router.delete('/orders/:id', orderController.deleteOrder);

router.post('/orders/upload-excel', upload.single('file'), orderController.uploadOrdersExcelController);

module.exports = router;
