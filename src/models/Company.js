const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
  name: { type: String, required: true,  },         // 업체명
  type: { type: String, default: '' }, // 업체 유형
  manager: { type: String, default: '' },                       // 담당자 이름
  phone: { type: String, default: '' },                         // 담당자 연락처
  email: { type: String, default: '' },                         // 담당자 이메일
  fax: { type: String, default: '' },                           // 팩스 번호
  address: { type: String, default: '' },                       // 회사 주소
  businessNumber: { type: String, default: '' },                // 사업자 등록번호
  industryType: { type: String, default: '' },                  // 업종
  bankName: { type: String, default: '' },                      // 은행명
  bankAccount: { type: String, default: '' },                   // 계좌번호
  bankOwner: { type: String, default: '' },                     // 예금주
  contracts: [{ type: String }],                                // 계약 사항 메모 리스트
  remark: { type: String, default: '' },                        // 비고
}, { timestamps: true });

module.exports = mongoose.model('Company', companySchema);
