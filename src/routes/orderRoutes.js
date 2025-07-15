const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

router.use((req, res, next) => {
  // 공통 미들웨어(예: 인증, 로깅)
  next();
});

router.get('/orders', orderController.getAllOrders);
router.get('/orders/:id', orderController.getOrderById);
router.post('/orders', orderController.createOrder);
router.put('/orders/:id', orderController.updateOrder);
router.patch('/orders/:id', orderController.updateOrder);
router.delete('/orders/:id', orderController.deleteOrder);

module.exports = router;
