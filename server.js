const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const connectDB = require('./src/config/db.config');
connectDB();

const productRoutes = require('./src/routes/productRoutes');
const orderRoutes = require('./src/routes/orderRoutes');
const deliveryRoutes = require('./src/routes/deliveryRoutes');
const shippingRoutes = require('./src/routes/shippingRoutes');
const stockRoutes = require('./src/routes/stockRoutes');
const companyRoutes = require('./src/routes/companyRoutes');

app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/deliveries', deliveryRoutes);
app.use('/api/shippings', shippingRoutes);
app.use('/api/stocks', stockRoutes);
app.use('/api/companies', companyRoutes);

const PORT = 8864;
app.listen(PORT, () => {
  console.log(`서버 실행: http://localhost:${PORT}`);
});
