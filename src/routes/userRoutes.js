const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

router.use((req, res, next) => {
  // 인증, 로깅 등 공통 미들웨어 가능
  next();
});

// 인증 관련
router.post('/signup', userController.signup);
router.post('/login', userController.login);
router.post('/logout', userController.logout);
router.get('/check-auth', userController.checkAuth);

// ✅ 유저 정보 관련 API 추가
router.get('/', userController.getAllUsers);           // 전체 유저 목록
router.get('/:id', userController.getUserById);       // 특정 유저 정보
router.put('/:id', userController.updateUser);        // 유저 정보 수정
router.delete('/:id', userController.deleteUser);     // 유저 삭제

module.exports = router;
