const express = require('express');
const multer = require('multer');
const router = express.Router();
const stockCtrl = require('../controllers/stockController');

const upload = multer(); // memoryStorage 기본

router.get('/', stockCtrl.getAllStocks);
router.get('/:id', stockCtrl.getStockById);

router.post('/', stockCtrl.createStock);
router.patch('/:id', stockCtrl.updateStock);
router.delete('/:id', stockCtrl.deleteStock);

router.put('/upsert', stockCtrl.upsertStock);
router.post('/add-inbound', stockCtrl.addInbound);
router.post('/consume', stockCtrl.consumeByProduction);

// 엑셀 업로드 (multipart/form-data, field name: file)
router.post('/upload', upload.single('file'), stockCtrl.uploadStocksExcelController);

module.exports = router;
