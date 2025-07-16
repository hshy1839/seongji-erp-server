const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});
app.use(express.json());

const connectDB = require('./src/config/db.config');
connectDB();

const productRoutes = require('./src/routes/productRoutes');
const orderRoutes = require('./src/routes/orderRoutes');
const deliveryRoutes = require('./src/routes/deliveryRoutes');
const shippingRoutes = require('./src/routes/shippingRoutes');
const stockRoutes = require('./src/routes/stockRoutes');
const companyRoutes = require('./src/routes/companyRoutes');
const packagingRoutes = require('./src/routes/packagingRoutes');

app.use('/api', productRoutes);
app.use('/api', orderRoutes);
app.use('/api', deliveryRoutes);
app.use('/api', shippingRoutes);
app.use('/api', stockRoutes);
app.use('/api', companyRoutes);
app.use('/api', packagingRoutes);

const PORT = 8864;
app.listen(PORT, () => {
  console.log(`서버 실행: http://localhost:${PORT}`);
});
