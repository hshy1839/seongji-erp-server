// models/productionItem.js
const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

/**
 * 엑셀 컬럼 → 스키마 매핑
 * - 거래처: customerName (또는 customer ref)
 * - 차종: carType
 * - 구분: division
 * - END P/NAME: endPName
 * - END P/NO  : endPNo
 * - P/NO      : partNo
 * - P/NAME    : partName
 * - MATERIAL  : material
 * - 단가      : unitPrice
 * - 소요량    : requiredQty
 * - 재고현황 하위:
 *    · 월말재고: endOfMonthStock
 *    · 입고수량: inbound[].qty
 *    · 입고날짜: inbound[].date
 *    · 손실,파손,증가: inbound[].lossDamage, inbound[].increase
 *    · 불량: inbound[].defects
 *    · 합계: (가상필드 stockTotal로 계산)
 * - 과부족: shortage (가상필드)
 * - 공급업체: supplierName (또는 supplier ref)
 */

const InboundSchema = new Schema(
  {
    qty: { type: Number, required: true, min: 0 },     // 입고수량
    date: { type: Date, required: true },              // 입고날짜
    note: { type: String },

    // 재고 조정 요인
    defects: { type: Number, default: 0, min: 0 },     // 불량
    lossDamage: { type: Number, default: 0, min: 0 },  // 손실/파손
    increase: { type: Number, default: 0, min: 0 },    // 증가(재고조정 +)
  },
  { _id: false }
);

const ProductionItemSchema = new Schema(
  {
    // 기본 정보
    customer: { type: Types.ObjectId, ref: 'Company' }, // 레퍼런스를 쓸 경우
    customerName: { type: String, index: true },        // 문자열로 저장도 가능
    carType: { type: String, index: true },
    division: { type: String, index: true },

    endPName: { type: String, index: true },            // END P/NAME
    endPNo: { type: String, index: true },              // END P/NO

    partNo: { type: String, index: true },              // P/NO
    partName: { type: String },                         // P/NAME
    material: { type: String, index: true },            // MATERIAL

    unitPrice: { type: Number, default: 0, min: 0 },    // 단가
    requiredQty: { type: Number, default: 0, min: 0 },  // 소요량

    // 재고현황 요약
    endOfMonthStock: { type: Number, default: 0, min: 0 }, // 월말재고

    // 입고 라인(여러 건)
    inbound: { type: [InboundSchema], default: [] },

    // 공급업체
    supplier: { type: Types.ObjectId, ref: 'Company' },
    supplierName: { type: String, index: true },

    // 월 단위 키(집계/필터용): 'YYYY-MM'
    monthKey: { type: String, index: true },

    // 메모/감사
    notes: { type: String },
    createdBy: { type: Types.ObjectId, ref: 'User' },
    updatedBy: { type: Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

/** 가상필드(집계) */
ProductionItemSchema.virtual('inboundTotal').get(function () {
  return (this.inbound || []).reduce((sum, r) => sum + (r.qty || 0), 0);
});
ProductionItemSchema.virtual('defectsTotal').get(function () {
  return (this.inbound || []).reduce((sum, r) => sum + (r.defects || 0), 0);
});
ProductionItemSchema.virtual('lossDamageTotal').get(function () {
  return (this.inbound || []).reduce((sum, r) => sum + (r.lossDamage || 0), 0);
});
ProductionItemSchema.virtual('increaseTotal').get(function () {
  return (this.inbound || []).reduce((sum, r) => sum + (r.increase || 0), 0);
});
ProductionItemSchema.virtual('stockTotal').get(function () {
  const base = (this.endOfMonthStock || 0) + this.inboundTotal + this.increaseTotal;
  return base - this.defectsTotal - this.lossDamageTotal;
});
ProductionItemSchema.virtual('shortage').get(function () {
  return (this.stockTotal || 0) - (this.requiredQty || 0);
});

ProductionItemSchema.index({ monthKey: 1, partNo: 1 });
ProductionItemSchema.index({ monthKey: 1, endPNo: 1 });
ProductionItemSchema.index({ customerName: 1, monthKey: 1 });
ProductionItemSchema.index({ supplierName: 1, monthKey: 1 });

module.exports = mongoose.model('ProductionItem', ProductionItemSchema);
