const Schedule = require('../models/Schedule');

// 전체 일정 조회
exports.getAllSchedules = async (req, res) => {
  try {
    const schedules = await Schedule.find().sort({ date: 1 });
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ error: '일정 불러오기 실패' });
  }
};

// 일정 생성
exports.createSchedule = async (req, res) => {
  try {
    const { date, event } = req.body;
    const newSchedule = new Schedule({ date, event });
    const saved = await newSchedule.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(400).json({ error: '일정 생성 실패' });
  }
};

// 일정 삭제
exports.deleteSchedule = async (req, res) => {
  try {
    await Schedule.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '일정 삭제 실패' });
  }
};
