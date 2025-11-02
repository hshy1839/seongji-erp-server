// routes/production.routes.js
const express = require('express');
const multer = require('multer');
const upload = multer();
const ctrl = require('../controllers/productionController');

const router = express.Router();

router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.get('/summary', ctrl.summary);      
router.delete('/:id', ctrl.remove);

// 엑셀 업로드
router.post('/import/excel', upload.single('file'), ctrl.uploadProductionExcelController);

module.exports = router;
