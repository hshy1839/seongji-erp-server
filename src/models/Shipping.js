const mongoose = require('mongoose');

const shippingSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  company: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
  shippingDate: { type: Date, required: true },
  receiver: { type: String, required: true },
  remark: { type: String, default: '' },
}, { timestamps: true });

shippingSchema.index({ shippingDate: -1 });

module.exports = mongoose.model('Shipping', shippingSchema);
