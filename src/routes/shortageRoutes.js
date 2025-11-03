// routes/shortageRoutes.js
const express = require('express');
const multer = require('multer');
const controller = require('../controllers/shortageController');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', controller.listShortages);
router.get('/:id', controller.getShortage);
router.post('/', controller.createOrUpsertShortage);
router.patch('/:id', controller.updateShortage);
router.delete('/:id', controller.deleteShortage);

router.post('/upload', upload.single('file'), controller.uploadShortagesExcelController);

module.exports = router;
