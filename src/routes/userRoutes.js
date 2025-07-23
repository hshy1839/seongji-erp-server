const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
router.use((req, res, next) => {
  // 인증, 로깅 등 공통 미들웨어 가능
  next();
});

router.post('/signup', userController.signup);
router.post('/login', userController.login);
router.post('/logout', userController.logout);
router.get('/check-auth', userController.checkAuth);

module.exports = router;
