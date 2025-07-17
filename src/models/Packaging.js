const mongoose = require('mongoose');

const packagingSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },

  packagingDate: {
    type: Date,
    required: true
  },

  quantity: {
    type: Number,
    required: true,
    min: 1
  },

  unit: {
    type: String,
    enum: ['BOX', 'EA', 'SET'],
    default: 'BOX'
  },

  doneBy: {
    type: String,
    required: true
  },

  materialId: { // 박스 등 포장재
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Material',
    required: true
  },

  packagingType: {
    type: String,
    enum: ['일반', '완충', '진공', '기타'],
    default: '일반'
  },

  status: {
    type: String,
    enum: ['포장중', '완료', '보류'],
    default: '완료'
  },

  remark: {
    type: String,
    default: ''
  }
}, { timestamps: true });

packagingSchema.index({ packagingDate: -1 });

module.exports = mongoose.model('Packaging', packagingSchema);
