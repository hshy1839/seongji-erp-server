const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  contact: { type: String, default: '' },
  address: { type: String, default: '' },
  remark: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Company', companySchema);
