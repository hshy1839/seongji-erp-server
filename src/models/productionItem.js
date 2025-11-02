// models/ProductionItem.js
const mongoose = require('mongoose');

const productionItemSchema = new mongoose.Schema(
  {
    division: { type: String, trim: true, default: '' },    // 구분 (빈값 허용)
    partNo:   { type: String, trim: true, required: true }, // 품번
    quantity: { type: Number, min: 0, default: 0 },         // 수량(파일 값으로 덮어쓰기)
    remark:   { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

// (division, partNo) 조합 유니크
productionItemSchema.index({ division: 1, partNo: 1 }, { unique: true });
productionItemSchema.index({ partNo: 1 });

module.exports = mongoose.model('ProductionItem', productionItemSchema);
