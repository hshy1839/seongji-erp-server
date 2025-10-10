// routes/productionRoutes.js
const router = require('express').Router();
const ctrl = require('../controllers/productionController');
const multer = require('multer');
const upload = multer();

// CRUD
router.get('/', ctrl.list);
router.get('/summary', ctrl.monthlySummary); // ?month=YYYY-MM
router.get('/:id', ctrl.getOne);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

// 입고 라인 추가
router.post('/:id/inbound', ctrl.addInbound);
router.post('/upload', upload.single('file'), ctrl.uploadProductionExcelController);

module.exports = router;
