const mongoose = require('mongoose');

const materialSchema = new mongoose.Schema({
  name: { type: String, required: true },               // 부자재 이름
  code: { type: String, required: true, unique: true }, // 부자재 코드 (예: 8701)
  
  category: {
    type: String,
    enum: ['박스', '사출부자재', '완충재', '테이프', '비닐', '기타'],
    required: true
  },

  spec: { type: String },                               // 규격 (예: 600x300x200)
  unit: { type: String, enum: ['EA', 'SET', 'BOX'], default: 'EA' },

  price: { type: Number, default: 0 },                  // 단가 또는 단품 금액
  stock: { type: Number, default: 0 },                  // 현재 재고 수량
  minStock: { type: Number, default: 0 },               // 최소 재고 수량
  deliveryPlace: { type: String },                      // 납입처

  usePurpose: { type: String },                         // 사용 용도 (예: 박스 포장용)
  remark: { type: String, default: '' },                // 비고 또는 기타 설명
}, {
  timestamps: true
});

module.exports = mongoose.model('Material', materialSchema);
