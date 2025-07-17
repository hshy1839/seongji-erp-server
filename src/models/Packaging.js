const mongoose = require('mongoose');

const packagingSchema = new mongoose.Schema({
  item: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'itemType'
  },
  itemType: {
    type: String,
    required: true,
    enum: ['Product', 'Material']
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

  registeredBy: { // ✅ 등록자 필드
    type: String,
    required: true
  },

  status: {
    type: String,
    enum: ['포장중', '완료', '보류'],
    default: '완료'
  },

  materialsUsed: [ // ✅ 사용된 포장재들
    {
      material: { type: mongoose.Schema.Types.ObjectId, ref: 'Material', required: true },
      quantity: { type: Number, required: true, min: 1 },
      unit: { type: String, default: 'EA' }
    }
  ],

  remark: {
    type: String,
    default: ''
  }
}, { timestamps: true });

packagingSchema.index({ packagingDate: -1 });

module.exports = mongoose.model('Packaging', packagingSchema);
