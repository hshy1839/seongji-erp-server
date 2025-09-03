// models/Order.js
const mongoose = require('mongoose');

const shippingSchema = new mongoose.Schema(
  {
    // ✅ 레거시 참조 필드 제거(또는 단순 ObjectId로만 둠; populate 안 씀)
    // item: { type: mongoose.Schema.Types.ObjectId, default: null }, // 필요 없으면 아예 주석/삭제

    // ✅ 한글 그대로 저장
    itemType: { type: String, default: '', trim: true },   // 공정/유형(엑셀 그대로)
    itemName: { type: String, required: true, trim: true },// 품명
    itemCode: { type: String, default: '', trim: true },   // 품번
    category: { type: String, default: '', trim: true },   // 대분류/카테고리
carType: { type: String, default: '', trim: true }, 
    shippingCompany: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    shippingDate: { type: Date, required: true },
    requester: { type: String, required: true, default: '미지정', trim: true },
    status: { type: String, enum: ['WAIT', 'COMPLETE'], default: 'WAIT' },
    remark: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

// 유용한 인덱스
shippingSchema.index({ shippingCompany: 1, shippingDate: -1 });
shippingSchema.index({ itemCode: 1, shippingDate: -1 });
shippingSchema.index({ itemName: 'text', itemCode: 'text' });

module.exports = mongoose.model('Shipping', shippingSchema);
