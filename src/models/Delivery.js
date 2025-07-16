const mongoose = require('mongoose');

const deliverySchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, min: 1 },
  deliveryDate: { type: Date, required: true },
  type: { type: String, enum: ['일반', '사급', '선사급'], default: '일반' },
  status: { type: String, enum: ['WAIT', 'COMPLETE'], default: 'WAIT' },
  remark: { type: String, default: '' },

  deliveryCompany: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },

}, { timestamps: true });

deliverySchema.index({ deliveryDate: -1 });

module.exports = mongoose.model('Delivery', deliverySchema);
