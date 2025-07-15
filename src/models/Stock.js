const mongoose = require('mongoose');

const stockSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, default: 0, min: 0 },
  location: { type: String, default: '' }, // 보관 위치
  status: { type: String, enum: ['정상', '부족'], default: '정상' },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

stockSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('Stock', stockSchema);
