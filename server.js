// index.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB 연결
mongoose.connect('mongodb://localhost:27017/my_express_db', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
mongoose.connection.on('connected', () => console.log('MongoDB 연결 완료'));

// 예시 라우터
app.get('/', (req, res) => {
  res.send('Hello Express!');
});

const PORT = 8864;
app.listen(PORT, () => {
  console.log(`서버 실행: http://localhost:${PORT}`);
});
