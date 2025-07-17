// models/Delivery.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const deliverySchema = new Schema({
  orderId: {
    type: Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
  },
  item: {
    type: Schema.Types.ObjectId,
    required: true,
  },
  itemType: {
    type: String,
    enum: ['Product', 'Material'],
    default: 'Product',
  },
  quantity: {
    type: Number,
    required: true,
  },
  deliveryDate: {
    type: Date,
    required: true,
  },
  deliveryCompany: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
  },
  type: {
    type: String,
    enum: ['일반', '사급', '선사급'],
    default: '일반',
  },
  remark: {
    type: String,
    default: '',
  },
  createdBy: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// 저장 전에 updatedAt 자동 갱신
deliverySchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// findOneAndUpdate나 update 시에도 갱신되게
deliverySchema.pre('findOneAndUpdate', function (next) {
  this.set({ updatedAt: new Date() });
  next();
});

module.exports = mongoose.model('Delivery', deliverySchema);
