const express = require('express');

const multer = require('multer');
const router = express.Router();

const shippingController = require('../controllers/shippingController');

router.use((req, res, next) => {
  // 공통 미들웨어 (ex. 인증, 로깅 등)
  next();
});

const upload = multer({ storage: multer.memoryStorage() });

router.get('/shippings', shippingController.getAllShippings);
router.get('/shippings/:id', shippingController.getShippingById);
router.post('/shippings', shippingController.createShipping);
router.put('/shippings/:id', shippingController.updateShipping);
router.patch('/shippings/:id', shippingController.updateShipping);
router.delete('/shippings/:id', shippingController.deleteShipping);

router.post('/shippings/upload-excel', upload.single('file'), shippingController.uploadShippingsExcelController);


module.exports = router;
