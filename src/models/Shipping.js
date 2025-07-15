const mongoose = require('mongoose');

const shippingSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  company: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  shippingDate: { type: Date, required: true },
  receiver: { type: String, required: true },
  status: { type: String, enum: ['WAIT', 'COMPLETE'], default: 'WAIT' },
  remark: { type: String, default: '' },
}, { timestamps: true });

shippingSchema.index({ shippingDate: -1 });

module.exports = mongoose.model('Shipping', shippingSchema);
