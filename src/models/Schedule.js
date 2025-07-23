const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
  },
  event: {
    type: String,
    required: true,
  },
}, { timestamps: true });

module.exports = mongoose.model('Schedule', scheduleSchema);
