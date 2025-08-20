const Delivery = require('../models/Delivery');
const Stock = require('../models/Stock'); // ✅ 추가

const { parseAndInsertDeliveriesFromExcel } = require('../middlewares/deliveryExcelService');


// 전체 납입 조회
exports.getAllDeliveries = async (req, res, next) => {
  try {
    const deliveries = await Delivery.find()
      .populate('item') // refPath: 'itemType' 자동 처리
      .populate('orderId')
      .populate('deliveryCompany')
      .sort({ deliveryDate: -1 });

    res.json(deliveries);
  } catch (err) {
    next(err);
  }
};

// 단일 납입 조회
exports.getDeliveryById = async (req, res, next) => {
  try {
    const delivery = await Delivery.findById(req.params.id)
      .populate('item')
      .populate('orderId')
      .populate('deliveryCompany');

    if (!delivery) return res.status(404).json({ message: 'Delivery not found' });
    res.json(delivery);
  } catch (err) {
    next(err);
  }
};

// ✅ 납입 생성 + Stock 자동 처리
// ✅ 납입 생성 + Stock 자동 처리 (netQuantity까지 포함)
exports.createDelivery = async (req, res, next) => {
  try {
    const delivery = new Delivery(req.body);
    const saved = await delivery.save();

    const { item, itemType, quantity } = saved;

    if (item && itemType && quantity) {
      const stock = await Stock.findOne({ item, itemType });

      if (stock) {
        stock.netQuantity += Number(quantity);       // 총량도 추가
        stock.updatedAt = new Date();
        await stock.save();
      } else {
        await Stock.create({
          item,
          itemType,
          netQuantity: Number(quantity),             // 새로 생성 시 총량도 시작값 설정
          location: '', // 기본값
        });
      }
    }

    const populated = await Delivery.findById(saved._id)
      .populate('item')
      .populate('orderId')
      .populate('deliveryCompany');

    res.status(201).json(populated);
  } catch (err) {
    next(err);
  }
};


// 납입 수정 + Stock 납입합계만 반영
exports.updateDelivery = async (req, res, next) => {
  try {
    const prev = await Delivery.findById(req.params.id);
    if (!prev) return res.status(404).json({ message: 'Delivery not found' });

    const updated = await Delivery.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate('item').populate('orderId').populate('deliveryCompany');

    // ✅ 납입량 변경 → Stock의 netQuantity에만 반영
    const { item, itemType, quantity } = updated;
    const prevQty = Number(prev.quantity);
    const newQty = Number(quantity);

    if (item && itemType && !isNaN(newQty) && !isNaN(prevQty)) {
      const stock = await Stock.findOne({ item, itemType });
      if (stock) {
        const diff = newQty - prevQty;
        stock.netQuantity = (stock.netQuantity || 0) + diff;
        stock.updatedAt = new Date();
        await stock.save();
      }
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
};


// 납입 삭제
exports.deleteDelivery = async (req, res, next) => {
  try {
    const deleted = await Delivery.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Delivery not found' });
    res.json({ message: 'Delivery deleted' });
  } catch (err) {
    next(err);
  }
};

// ✅ 엑셀 업로드 (DryRun 지원, 업로드 일자(KST 기본) 동일분 삭제 후 교체 정책)
exports.uploadDeliveriesExcel = async (req, res, next) => {
  try {
    // multer.single('file') 를 라우트에서 사용한다고 가정
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ ok: false, error: '파일이 없습니다.' });
    }

    const dryRun = String(req.query.dryRun || 'false').toLowerCase() === 'true';
    const tzOffsetMin = req.query.tzOffsetMin ? Number(req.query.tzOffsetMin) : 540; // 기본: KST(+9h)

    const result = await parseAndInsertDeliveriesFromExcel(req.file.buffer, {
      dryRun,
      tzOffsetMin,
    });

    return res.json({ ok: true, dryRun, ...result });
  } catch (err) {
    console.error('[deliveries:upload-excel] ', err);
    return next(err);
  }
};
