// models/Shipping.js
const mongoose = require('mongoose');

const shippingSchema = new mongoose.Schema(
  {
    itemType:   { type: String, default: '', trim: true },
    itemName:   { type: String, required: true, trim: true },
    itemCode:   { type: String, default: '', trim: true },
    category:   { type: String, default: '', trim: true }, // 대분류/카테고리
    carType:    { type: String, default: '', trim: true },
    division:   { type: String, default: '', trim: true }, // 구분(내수/수출 등)

    shippingCompany: { type: String, required: true, trim: true },
    quantity:        { type: Number, required: true, min: 1 },
    shippingDate:    { type: Date, required: true },
    requester:       { type: String, default: '미지정', trim: true },
    status:          { type: String, enum: ['WAIT', 'COMPLETE'], default: 'WAIT' },
    remark:          { type: String, default: '', trim: true },

    // ✅ 이 납품이 어떤 발주에서 몇 개를 차감했는지 기록
    allocations: [
      {
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
        qty:     { type: Number, required: true }, // 이 발주에서 깎은 수량 (양수)
      },
    ],
  },
  { timestamps: true }
);

shippingSchema.index({ shippingCompany: 1, shippingDate: -1 });
shippingSchema.index({ itemCode: 1,      shippingDate: -1 });
shippingSchema.index({ itemName: 'text', itemCode: 'text' });

module.exports = mongoose.model('Shipping', shippingSchema);
