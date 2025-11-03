const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * 부족수량(ShortageItem) 모델
 * 필수: 구분(division), 자재(material), 자재품번(materialCode)
 * 선택: 자재업체(supplier), 입고수량(inQty), 재고수량(stockQty)
 */
const ShortageItemSchema = new Schema(
  {
    division: { type: String, required: true, trim: true },      // 구분
    material: { type: String, required: true, trim: true },      // 자재
    materialCode: { type: String, required: true, trim: true },  // 자재품번
    supplier: { type: String, trim: true, default: '' },         // 자재업체
    inQty: { type: Number, default: 0 },                         // 입고수량
    stockQty: { type: Number, default: 0 },                      // 재고수량
  },
  {
    timestamps: true,
    versionKey: false,
    minimize: false,
  }
);

// ✅ 복합 고유키 설정: 구분 + 자재 + 자재품번
ShortageItemSchema.index(
  { division: 1, material: 1, materialCode: 1 },
  { unique: true, name: 'uniq_division_material_code' }
);

// ✅ 업서트용 정적 메서드 (엑셀 업로드 시 바로 사용 가능)
ShortageItemSchema.statics.upsertByKey = function (key, payload) {
  const filter = { ...key };
  const update = {
    $setOnInsert: { ...key },
    $set: {},
  };

  if (payload?.supplier !== undefined) update.$set.supplier = payload.supplier;
  if (payload?.inQty !== undefined) update.$set.inQty = payload.inQty;
  if (payload?.stockQty !== undefined) update.$set.stockQty = payload.stockQty;

  return this.findOneAndUpdate(filter, update, { upsert: true, new: true });
};

module.exports =
  mongoose.models.ShortageItem ||
  mongoose.model('ShortageItem', ShortageItemSchema);
