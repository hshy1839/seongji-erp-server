const mongoose = require('mongoose');

const packagingSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  packagingDate: { type: Date, required: true },
  quantity: { type: Number, required: true, min: 1 },
  doneBy: { type: String, required: true },
  remark: { type: String, default: '' },
}, { timestamps: true });

packagingSchema.index({ packagingDate: -1 });

module.exports = mongoose.model('Packaging', packagingSchema);
