const express = require('express');
const router = express.Router();

const shippingController = require('../controllers/shippingController');

router.use((req, res, next) => {
  // 공통 미들웨어 (ex. 인증, 로깅 등)
  next();
});

router.get('/shippings', shippingController.getAllShippings);
router.get('/shippings/:id', shippingController.getShippingById);
router.post('/shippings', shippingController.createShipping);
router.put('/shippings/:id', shippingController.updateShipping);
router.patch('/shippings/:id', shippingController.updateShipping);
router.delete('/shippings/:id', shippingController.deleteShipping);

module.exports = router;
