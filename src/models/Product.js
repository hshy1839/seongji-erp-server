const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, index: true },
  category: { type: String, required: true, enum: ['사이드실', '가니쉬', '부자재'], index: true },
  productNumber: { type: String, required: true, unique: true },
  carType: { type: String, default: '' },
  orderCompany: { type: String, default: '' },
  deliveryPlace: { type: String, default: '' },
  minStock: { type: Number, default: 0, min: 0 },
  packagingTarget: { type: Boolean, default: false },
  division: { type: String, default: '' },
  remark: { type: String, default: '' },
}, { timestamps: true });

productSchema.index({ category: 1, productNumber: 1 });

module.exports = mongoose.model('Product', productSchema);
