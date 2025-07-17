const mongoose = require('mongoose');

const stockSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, required: true },
  itemType: { type: String, enum: ['Product', 'Material'], required: true },
  quantity: { type: Number, default: 0, min: 0 },
  location: { type: String, default: '' },
  status: { type: String, enum: ['정상', '부족'], default: '정상' },
  netQuantity: { type: Number, default: 0, min: 0 }, // ✅ 총량 필드 추가
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

stockSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('Stock', stockSchema);
