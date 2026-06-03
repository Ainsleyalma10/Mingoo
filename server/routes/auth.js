const express = require('express');
const router = express.Router();
const { googleLogin, completeRegistration, getMe } = require('../controllers/authController');
const { protect } = require('../middlewares/auth');

router.post('/google-login', googleLogin);
router.post('/complete-registration', completeRegistration);
router.get('/me', protect, getMe);

module.exports = router;
