const express = require('express');
const router = express.Router();
const materialController = require('../controllers/materialController');

// 공통 미들웨어 (예: 인증, 로깅 등)
router.use((req, res, next) => {
  // TODO: 인증, 권한 체크, 로깅 등 추가 가능
  next();
});

// 전체 부자재 목록 조회
router.get('/materials', materialController.getAllMaterials);

// 단일 부자재 조회
router.get('/materials/:id', materialController.getMaterialById);

// 부자재 등록
router.post('/materials', materialController.createMaterial);

// 부자재 수정 (전체)
router.put('/materials/:id', materialController.updateMaterial);

// 부자재 수정 (일부)
router.patch('/materials/:id', materialController.updateMaterial);

// 부자재 삭제
router.delete('/materials/:id', materialController.deleteMaterial);

module.exports = router;
