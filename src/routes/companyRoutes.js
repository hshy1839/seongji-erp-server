const express = require('express');
const router = express.Router();
const companyController = require('../controllers/companyController');

router.use((req, res, next) => {
  // 인증, 로깅 등 공통 미들웨어
  next();
});

router.get('/companies', companyController.getAllCompanies);
router.get('/companies/:id', companyController.getCompanyById);
router.post('/companies', companyController.createCompany);
router.put('/companies/:id', companyController.updateCompany);
router.patch('/companies/:id', companyController.updateCompany);
router.delete('/companies/:id', companyController.deleteCompany);

module.exports = router;
