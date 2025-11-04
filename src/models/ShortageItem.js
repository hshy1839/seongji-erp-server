const mongoose = require('mongoose');
const { Schema } = mongoose;

const ShortageItemSchema = new Schema(
  {
    division: { type: String, required: true, trim: true },      // 구분
    material: { type: String, required: true, trim: true },      // 자재
    materialCode: { type: String, required: true, trim: true },  // 자재품번
    supplier: { type: String, trim: true, default: '' },         // 자재업체
    inQty: { type: Number, default: 0 },                         // 입고수량
    stockQty: { type: Number, default: 0 },                      // 재고수량
    systemStock: { type: Number, default: 0 },                   // ✅ 전산재고
  },
  {
    timestamps: true,
    versionKey: false,
    minimize: false,
  }
);

// 복합 고유키
ShortageItemSchema.index(
  { division: 1, material: 1, materialCode: 1 },
  { unique: true, name: 'uniq_division_material_code' }
);

// 업서트
ShortageItemSchema.statics.upsertByKey = function (key, payload = {}) {
  const filter = { ...key };
  const update = {
    $setOnInsert: { ...key },
    $set: {},
  };

  if (payload.supplier !== undefined) update.$set.supplier = payload.supplier;
  if (payload.inQty !== undefined) update.$set.inQty = payload.inQty;
  if (payload.stockQty !== undefined) update.$set.stockQty = payload.stockQty;
  if (payload.systemStock !== undefined) update.$set.systemStock = payload.systemStock; // ✅ 여기

  return this.findOneAndUpdate(filter, update, { upsert: true, new: true });
};

module.exports =
  mongoose.models.ShortageItem ||
  mongoose.model('ShortageItem', ShortageItemSchema);
