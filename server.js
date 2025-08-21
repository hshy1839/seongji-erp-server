const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const app = express();
const allowedOrigins = [
  'http://localhost:3000',
  'https://seongji-erp.onrender.com',
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn('Blocked by CORS:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - IP: ${req.ip}`);
  next();
});
app.use(express.json());
app.use(cookieParser());

const connectDB = require('./src/config/db.config');
connectDB();

const productRoutes = require('./src/routes/productRoutes');
const orderRoutes = require('./src/routes/orderRoutes');
const deliveryRoutes = require('./src/routes/deliveryRoutes');
const shippingRoutes = require('./src/routes/shippingRoutes');
const stockRoutes = require('./src/routes/stockRoutes');
const companyRoutes = require('./src/routes/companyRoutes');
const packagingRoutes = require('./src/routes/packagingRoutes');
const materialRoutes = require('./src/routes/materialRoutes');
const noticeRoutes = require('./src/routes/noticeRoutes');
const scheduleRoutes = require('./src/routes/scheduleRoutes');
const userRoutes = require('./src/routes/userRoutes');

app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});
app.use('/api', productRoutes);
app.use('/api', orderRoutes);
app.use('/api', deliveryRoutes);
app.use('/api', shippingRoutes);
app.use('/api', stockRoutes);
app.use('/api', companyRoutes);
app.use('/api', packagingRoutes);
app.use('/api', materialRoutes);
app.use('/api', noticeRoutes);
app.use('/api', scheduleRoutes);
app.use('/api/users', userRoutes);
app.use((req, res) => {
  res.status(404).json({ message: 'Not Found' });
});

const PORT = 8864;
app.listen(PORT, () => {
  console.log(`서버 실행: http://localhost:${PORT}`);
});
