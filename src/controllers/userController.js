const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');

dotenv.config();
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
const TOKEN_EXPIRY = '2h'; // 세션 유지 시간

// 회원가입
exports.signup = async (req, res) => {
  try {
    const { username, password, name, email, phone, position, department, userType } = req.body;

    // 필수 항목 검사
    if (!username || !password || !name) {
      return res.status(400).json({ message: '필수 정보를 모두 입력해주세요.' });
    }

    // 중복 검사
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ message: '이미 사용 중인 아이디입니다.' });
    }

    // 사용자 생성
    const user = new User({
      username,
      password,
      name,
      email,
      phone,
      position,
      department,
      userType,
    });

    await user.save();

    return res.status(201).json({ message: '회원가입 완료' });
  } catch (err) {
    console.error('[Signup Error]', err);
    return res.status(500).json({ message: '서버 에러로 회원가입에 실패했습니다.' });
  }
};

// 로그인
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // 입력 확인
    if (!username || !password) {
      return res.status(400).json({ message: '아이디와 비밀번호를 입력해주세요.' });
    }

    // 사용자 확인
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: '존재하지 않는 사용자입니다.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: '비밀번호가 일치하지 않습니다.' });
    }

    // JWT 발급
    const token = jwt.sign(
      {
        id: user._id,
        username: user.username,
        userType: user.userType,
      },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    // 보안 쿠키로 저장
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 1000 * 60 * 60 * 2, // 2시간
    });

    res.status(200).json({
      message: '로그인 성공',
      user: {
        id: user._id,
        name: user.name,
        userType: user.userType,
      },
    });
  } catch (err) {
    console.error('[Login Error]', err);
    res.status(500).json({ message: '로그인 실패. 서버 오류.' });
  }
};

// 로그아웃
exports.logout = (req, res) => {
  res.clearCookie('token');
  res.status(200).json({ message: '로그아웃 되었습니다.' });
};

// 로그인 상태 확인 (프론트에서 새로고침 시 사용)
exports.checkAuth = async (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ message: '토큰 없음' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(401).json({ message: '유저 없음' });

    res.status(200).json({ user });
  } catch (err) {
    console.error('[CheckAuth Error]', err);
    res.status(401).json({ message: '인증 실패' });
  }
};

// 전체 유저 목록 조회 (관리자용)
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password'); // 비밀번호 제외
    res.status(200).json(users);
  } catch (err) {
    console.error('[GetAllUsers Error]', err);
    res.status(500).json({ message: '유저 목록 조회 실패' });
  }
};

// 특정 유저 정보 조회
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select('-password');
    if (!user) return res.status(404).json({ message: '유저를 찾을 수 없습니다.' });

    res.status(200).json(user);
  } catch (err) {
    console.error('[GetUserById Error]', err);
    res.status(500).json({ message: '유저 정보 조회 실패' });
  }
};

// 유저 정보 수정
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, position, department, userType } = req.body;

    const user = await User.findByIdAndUpdate(
      id,
      { name, email, phone, position, department, userType },
      { new: true }
    ).select('-password');

    if (!user) return res.status(404).json({ message: '수정할 유저를 찾을 수 없습니다.' });

    res.status(200).json({ message: '유저 정보 수정 완료', user });
  } catch (err) {
    console.error('[UpdateUser Error]', err);
    res.status(500).json({ message: '유저 정보 수정 실패' });
  }
};

// 유저 삭제
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByIdAndDelete(id);
    if (!user) return res.status(404).json({ message: '삭제할 유저를 찾을 수 없습니다.' });

    res.status(200).json({ message: '유저 삭제 완료' });
  } catch (err) {
    console.error('[DeleteUser Error]', err);
    res.status(500).json({ message: '유저 삭제 실패' });
  }
};
