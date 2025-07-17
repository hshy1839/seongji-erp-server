const express = require('express');
const https = require('https');
const fs = require('fs');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();

// CORS 설정
app.use(cors());
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - IP: ${req.ip}`);
  next();
});
app.use(express.json());

// 데이터베이스 연결
const connectDB = require('./src/config/db.config');
connectDB();

// 라우트 설정
const productRoutes = require('./src/routes/productRoutes');
const orderRoutes = require('./src/routes/orderRoutes');
const deliveryRoutes = require('./src/routes/deliveryRoutes');
const shippingRoutes = require('./src/routes/shippingRoutes');
const stockRoutes = require('./src/routes/stockRoutes');
const companyRoutes = require('./src/routes/companyRoutes');
const packagingRoutes = require('./src/routes/packagingRoutes');
const materialRoutes = require('./src/routes/materialRoutes');

// API 경로 설정
app.use('/api', productRoutes);
app.use('/api', orderRoutes);
app.use('/api', deliveryRoutes);
app.use('/api', shippingRoutes);
app.use('/api', stockRoutes);
app.use('/api', companyRoutes);
app.use('/api', packagingRoutes);
app.use('/api', materialRoutes);

// SSL 인증서 경로 설정
const options = {
  cert: fs.readFileSync('./certificate.crt'),  // 인증서 경로 (루트 디렉토리)
  key: fs.readFileSync('./private.key')       // 개인 키 경로 (루트 디렉토리)
};

// HTTPS 서버 시작
const PORT = 8864;
https.createServer(options, app).listen(PORT, () => {
  console.log(`HTTPS 서버가 443번 포트에서 실행 중입니다.`);
});

// HTTP -> HTTPS 리디렉션 (선택 사항)
app.listen(80, () => {
  console.log('HTTP 서버가 80번 포트에서 실행 중입니다.');
});
