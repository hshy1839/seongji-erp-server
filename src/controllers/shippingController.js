// src/controllers/shippingController.js
const mongoose = require('mongoose');
const Shipping = require('../models/Shipping');
const Order = require('../models/Order');
const { parseAndInsertShippingsFromExcel } = require('../middlewares/shippingExcelService');

// 공통: 주문 수량 증감 헬퍼
async function adjustOrderQuantity({ division, itemCode, deltaQty, session }) {
  if (!itemCode) return;

  // 기본 조건: 품번
  const query = { itemCode };

  // 구분이 있으면 Order.category 로 매칭 (구분 = category)
  if (division) {
    query.category = division;
  }

  const updated = await Order.findOneAndUpdate(
    query,
    { $inc: { quantity: deltaQty } },   // deltaQty: -10 이면 10개 차감, +10 이면 복구
    {
      new: true,
      session,
    }
  );

  if (!updated) {
    console.log('[adjustOrderQuantity] 매칭되는 발주 없음', query);
  } else {
    console.log(
      '[adjustOrderQuantity] 발주 수량 변경',
      query,
      '→ quantity:',
      updated.quantity
    );
  }
}

/**
 * GET /api/shippings
 * 전체 납품 목록
 */
exports.getAllShippings = async (req, res, next) => {
  try {
    const shippings = await Shipping.find().sort({ shippingDate: -1 });
    res.json(shippings);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/shippings/:id
 * 단일 납품
 */
exports.getShippingById = async (req, res, next) => {
  try {
    const shipping = await Shipping.findById(req.params.id);
    if (!shipping) {
      return res.status(404).json({ message: 'Shipping not found' });
    }
    res.json(shipping);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/shippings
 * 납품 생성 + 해당 발주 수량 차감
 */
exports.createShipping = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const payload = { ...req.body };

    // 수량 숫자 변환
    if (typeof payload.quantity === 'string') {
      const q = Number(payload.quantity);
      if (Number.isFinite(q)) payload.quantity = q;
    }

    // 납품일 날짜 변환
    if (typeof payload.shippingDate === 'string') {
      const d = new Date(payload.shippingDate);
      if (!Number.isNaN(d.getTime())) payload.shippingDate = d;
    }

    // 요청자 자동 세팅 (로그인 유저가 있다면)
    if (req.user?.name) {
      payload.requester = req.user.name;
    }

    const shipping = new Shipping(payload);
    const saved = await shipping.save({ session });

    // 발주 quantity 차감 (구분+품번 기반)
    await adjustOrderQuantity({
      division: saved.division,           // Shipping.division
      itemCode: saved.itemCode,
      deltaQty: -saved.quantity,          // 납품한 만큼 빼기
      session,
    });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json(saved);
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    next(err);
  }
};

/**
 * PUT/PATCH /api/shippings/:id
 * 납품 수정 (수량/구분/품번 변경 시 발주 수량도 재조정)
 */
exports.updateShipping = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const id = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, message: '잘못된 id 형식입니다.' });
    }

    const body = { ...req.body };

    // 수량 변환
    if (body.quantity === '') delete body.quantity;
    if (typeof body.quantity === 'string') {
      const q = Number(body.quantity);
      if (Number.isFinite(q)) body.quantity = q;
    }

    // 날짜 변환
    if (body.shippingDate === '') delete body.shippingDate;
    if (typeof body.shippingDate === 'string') {
      const d = new Date(body.shippingDate);
      if (!Number.isNaN(d.getTime())) body.shippingDate = d;
    }

    // 요청자
    if (req.user?.name) {
      body.requester = req.user.name;
    }

    // 기존 값 조회 (차이 계산용)
    const before = await Shipping.findById(id).session(session);
    if (!before) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ ok: false, message: 'Shipping not found' });
    }

    const prevDivision = before.division;
    const prevItemCode = before.itemCode;
    const prevCompany = before.shippingCompany;
    const prevQty = before.quantity;

    // 실제 업데이트
    const doc = await Shipping.findByIdAndUpdate(id, body, {
      new: true,
      runValidators: true,
      session,
    });

    // quantity/구분/품번/업체가 바뀌었으면 발주 수량 재조정
    const newDivision = doc.division;
    const newItemCode = doc.itemCode;
    const newCompany = doc.shippingCompany;
    const newQty = doc.quantity;

    // 이전 발주에서 롤백 (구분/품번/업체 기준)
    await adjustOrderQuantity({
      division: prevDivision,
      itemCode: prevItemCode,
      deltaQty: prevQty, // 이전에 뺐던 만큼 다시 더해줌
      session,
    });

    // 새 발주에서 다시 차감
    await adjustOrderQuantity({
      division: newDivision,
      itemCode: newItemCode,
      deltaQty: -newQty,
      session,
    });

    await session.commitTransaction();
    session.endSession();

    return res.json(doc);
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();

    console.error('[updateShipping ERROR]', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        ok: false,
        type: 'ValidationError',
        message: error.message,
        errors: error.errors,
      });
    }
    if (error.name === 'CastError') {
      return res.status(400).json({
        ok: false,
        type: 'CastError',
        path: error.path,
        value: error.value,
        message: '값 형식이 올바르지 않습니다.',
      });
    }
    if (error.name === 'StrictPopulateError') {
      return res.status(400).json({
        ok: false,
        type: 'StrictPopulateError',
        message: error.message,
        path: error.path,
      });
    }
    return res.status(500).json({ ok: false, message: 'Internal Server Error' });
  }
};

/**
 * DELETE /api/shippings/:id
 * 납품 삭제 + 해당 발주 수량 되돌리기
 */
exports.deleteShipping = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const id = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ ok: false, message: '잘못된 id 형식입니다.' });
    }

    // 삭제할 납품 먼저 조회
    const shipping = await Shipping.findById(id).session(session);
    if (!shipping) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ ok: false, message: 'Shipping not found' });
    }

    // 발주 수량 롤백 (구분+품번 기준)
    await adjustOrderQuantity({
      division: shipping.division,
      itemCode: shipping.itemCode,
      deltaQty: shipping.quantity, // 삭제되니까 다시 되돌려 더해준다
      session,
    });

    // 실제 삭제
    await Shipping.findByIdAndDelete(id, { session });

    await session.commitTransaction();
    session.endSession();

    res.json({ ok: true, message: 'Shipping deleted', shippingId: id });
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    next(err);
  }
};

/**
 * POST /api/shippings/upload-excel
 * 엑셀 업로드 (기존 parseAndInsertShippingsFromExcel 사용)
 */
exports.uploadShippingsExcelController = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ ok: false, message: '파일이 없습니다.' });
    }

    const dryRun = String(req.query.dryRun || 'false').toLowerCase() === 'true';
    const tzOffsetMin = Number(req.query.tzOffsetMin ?? 540) || 540;

    const result = await parseAndInsertShippingsFromExcel(req.file.buffer, {
      dryRun,
      tzOffsetMin,
    });

    return res.json({ ok: true, dryRun, ...result });
  } catch (err) {
    console.error('uploadShippingsExcelController error:', err);
    return res.status(500).json({ ok: false, message: err.message || '서버 오류' });
  }
};
