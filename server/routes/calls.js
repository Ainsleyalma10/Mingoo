const express = require('express');
const router = express.Router();
const { startCall, endCall, getCallToken } = require('../controllers/callController');
const { protect } = require('../middlewares/auth');

router.post('/start', protect, startCall);
router.put('/:id/end', protect, endCall);
router.post('/token', protect, getCallToken);

module.exports = router;
