const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  orderCompany: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  orderDate: { type: Date, required: true },
  requester: { type: String, required: true },
  status: { type: String, enum: ['WAIT', 'COMPLETE'], default: 'WAIT' },
  remark: { type: String, default: '' },
}, { timestamps: true });

orderSchema.index({ orderCompany: 1, orderDate: -1 });

module.exports = mongoose.model('Order', orderSchema);
