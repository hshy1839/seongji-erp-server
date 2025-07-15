const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stockController');

router.use((req, res, next) => {
  // 인증, 로깅 등 공통 미들웨어 가능
  next();
});

router.get('/stocks', stockController.getAllStocks);
router.get('/stocks/:id', stockController.getStockById);
router.post('/stocks', stockController.createStock);
router.put('/stocks/:id', stockController.updateStock);
router.patch('/stocks/:id', stockController.updateStock);
router.delete('/stocks/:id', stockController.deleteStock);

module.exports = router;
