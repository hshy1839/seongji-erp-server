const express = require('express');
const router = express.Router();
const scheduleController = require('../controllers/scheduleController');
router.use((req, res, next) => {
    next();
});

router.get('/schedules', scheduleController.getAllSchedules);
router.post('/schedules', scheduleController.createSchedule);
router.delete('/schedules/:id', scheduleController.deleteSchedule);

module.exports = router;
