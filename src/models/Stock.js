// models/Stock.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * 목적
 * - 발주처, 차종, 납품처, 구분(현수/내수/수출 등), 품번, 자재/자재품번 별 재고 단위행
 * - 컬럼: 재고수량(=실시간재고), 소요량(BOM 1ea당), + 운영에 필요한 누적값(기초/입고/실적)
 *
 * 고유키(Unique):
 *   customer + carType + deliveryTo + division + partNumber + materialCode
 */

const stockSchema = new Schema({
  // 식별/분류
  customer:    { type: String, required: true, trim: true },  // 발주처
  carType:     { type: String, required: true, trim: true },  // 차종
  deliveryTo:  { type: String, required: true, trim: true },  // 납품처
  division:    { type: String, required: true, trim: true },  // 구분: 현수/내수/수출 등 (자유 텍스트 또는 enum)
  partNumber:  { type: String, required: true, trim: true },  // 품번(완제품)
  materialName:{ type: String, required: true, trim: true },  // 자재
  materialCode:{ type: String, required: true, trim: true },  // 자재품번

  // BOM 기준 소요량 (1EA 완제품당 해당 자재 소요량)
  // 여러 품번에서 동일 자재를 쓰더라도, 이 행은 위의 고유키로 특정됨
  bomQtyPer:   { type: Number, required: true, min: 0 },      // 소요량

  // 재고 4대 지표
  openingQty:  { type: Number, default: 0, min: 0 },          // 기초재고
  inboundQty:  { type: Number, default: 0, min: 0 },          // 자재입고 누적
  usedQty:     { type: Number, default: 0, min: 0 },          // 생산실적에 의한 사용 누적
  currentQty:  { type: Number, default: 0, min: 0 },          // 실시간 재고 = opening + inbound - used

  // 참고 메타
  uom:         { type: String, default: 'EA' },               // 단위
  lastMovementAt: { type: Date },                             // 최근 입/출고 일시
  remark:      { type: String, default: '' },
}, { timestamps: true });

/** 고유 복합 인덱스 */
stockSchema.index(
  { customer:1, carType:1, deliveryTo:1, division:1, partNumber:1, materialCode:1 },
  { unique: true, name: 'uniq_stock_key' }
);

/** currentQty 일관성 유지 */
function recomputeCurrent(doc) {
  doc.currentQty = (doc.openingQty || 0) + (doc.inboundQty || 0) - (doc.usedQty || 0);
}

/** 저장 전 재계산 */
stockSchema.pre('save', function(next) {
  recomputeCurrent(this);
  next();
});

/** findOneAndUpdate 시 updatedAt & currentQty 유지 */
stockSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate() || {};
  // $inc / $set 혼용 고려
  // 업데이트 후 currentQty 다시 계산하도록 aggregation-style로 처리 불가하므로,
  // post hook에서 재조회하거나, 여기서 계산 가능한 경우 계산.
  // 간단히 updatedAt만 세팅하고, post hook에서 재계산.
  this.set({ updatedAt: new Date() });
  next();
});

stockSchema.post('findOneAndUpdate', async function(doc) {
  if (doc) {
    recomputeCurrent(doc);
    await doc.save();
  }
});

/** 편의 메서드: 입고 증가 */
stockSchema.statics.addInbound = async function(key, qty, when = new Date()) {
  const res = await this.findOneAndUpdate(
    key,
    { 
      $inc: { inboundQty: qty },
      $set: { lastMovementAt: when }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return res;
};

/** 편의 메서드: 생산실적 사용(자재 차감) */
stockSchema.statics.consumeByProduction = async function(key, useQty, when = new Date()) {
  const res = await this.findOneAndUpdate(
    key,
    { 
      $inc: { usedQty: useQty },
      $set: { lastMovementAt: when }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return res;
};

module.exports = mongoose.model('Stock', stockSchema);
