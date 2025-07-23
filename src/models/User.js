const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true, // 로그인 ID
    trim: true,
  },
  password: {
    type: String,
    required: true,
  },
  name: { // 사용자 이름
    type: String,
    required: true,
  },
  email: {
    type: String,
    default: '',
    trim: true,
  },
  phone: {
    type: String,
    default: '',
    trim: true,
  },
  position: {
    type: String,
    default: '',
    trim: true,
  },
  department: {
    type: String,
    default: '',
    trim: true,
  },
  userType: {
    type: Number,
    enum: [1, 2], // 1: 관리자, 2: 일반직원
    default: 2,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// 비밀번호 암호화
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// 비밀번호 비교 메서드
userSchema.methods.comparePassword = function (inputPassword) {
  return bcrypt.compare(inputPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
