// models/Shipping.js
const mongoose = require('mongoose');

const shippingSchema = new mongoose.Schema(
  {
    // ✅ 한글 그대로 저장
    itemType: { type: String, default: '', trim: true },     // 공정/유형 (예: 사출, 도장 등)
    itemName: { type: String, required: true, trim: true },  // 품명
    itemCode: { type: String, default: '', trim: true },     // 품번
    category: { type: String, default: '', trim: true },     // 대분류/카테고리
    carType: { type: String, default: '', trim: true },      // 차종
    shippingCompany: { type: String, required: true, trim: true }, // 납품처
    quantity: { type: Number, required: true, min: 1 },      // 납품수량
    shippingDate: { type: Date, required: true },            // 납품일자
    requester: { type: String, default: '미지정', trim: true }, // 요청자
    status: { type: String, enum: ['WAIT', 'COMPLETE'], default: 'WAIT' }, // 상태
    remark: { type: String, default: '', trim: true },       // 비고
  },
  { timestamps: true }
);

// ✅ 유용한 인덱스
shippingSchema.index({ shippingCompany: 1, shippingDate: -1 }); // 납품처별 정렬
shippingSchema.index({ itemCode: 1, shippingDate: -1 });        // 품번별 납품내역 조회용
shippingSchema.index({ itemName: 'text', itemCode: 'text' });   // 검색 최적화

module.exports = mongoose.model('Shipping', shippingSchema);
