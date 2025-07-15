const express = require('express');
const router = express.Router();
const deliveryController = require('../controllers/deliveryController');

router.use((req, res, next) => {
  // 공통 미들웨어 (예: 인증)
  next();
});

router.get('/deliveries', deliveryController.getAllDeliveries);
router.get('/deliveries/:id', deliveryController.getDeliveryById);
router.post('/deliveries', deliveryController.createDelivery);
router.put('/deliveries/:id', deliveryController.updateDelivery);
router.patch('/deliveries/:id', deliveryController.updateDelivery);
router.delete('/deliveries/:id', deliveryController.deleteDelivery);

module.exports = router;
