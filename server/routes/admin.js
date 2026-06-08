const express = require('express');
const router = express.Router();
const { 
    getStats, 
    getUsers, 
    toggleUserBan,
    addCoins,
    removeCoins,
    assignSubscription,
    getHosts,
    getStreams,
    terminateStream,
    getStreamAnalytics,
    getCalls,
    getWithdrawals,
    updateWithdrawal,
    getGifts,
    createGift,
    updateGift,
    deleteGift,
    getSubscriptions,
    createSubscriptionPlan,
    updateSubscriptionPlan,
    deleteSubscriptionPlan,
    getFinancialReports,
    getModerationReports,
    updateModerationReport,
    sendNotification,
    getAuditLogs
} = require('../controllers/adminController');
const { protect, adminOnly } = require('../middlewares/auth');

router.use(protect, adminOnly);

// Dashboard
router.get('/stats', getStats);
router.get('/financial-reports', getFinancialReports);

// Users
router.get('/users', getUsers);
router.put('/users/:id/ban', toggleUserBan);
router.post('/users/:id/coins/add', addCoins);
router.post('/users/:id/coins/remove', removeCoins);
router.post('/users/:id/subscription', assignSubscription);

// Hosts
router.get('/hosts', getHosts);

// Streams
router.get('/streams', getStreams);
router.put('/streams/:id/terminate', terminateStream);
router.get('/streams/analytics', getStreamAnalytics);

// Calls
router.get('/calls', getCalls);

// Gifts
router.get('/gifts', getGifts);
router.post('/gifts', createGift);
router.put('/gifts/:id', updateGift);
router.delete('/gifts/:id', deleteGift);

// Subscriptions
router.get('/subscriptions', getSubscriptions);
router.post('/subscriptions', createSubscriptionPlan);
router.put('/subscriptions/:id', updateSubscriptionPlan);
router.delete('/subscriptions/:id', deleteSubscriptionPlan);

// Withdrawals
router.get('/withdrawals', getWithdrawals);
router.put('/withdrawals/:id', updateWithdrawal);

// Moderation
router.get('/moderation', getModerationReports);
router.put('/moderation/:id', updateModerationReport);

// Notifications
router.post('/notifications/send', sendNotification);

// Audit
router.get('/audit-logs', getAuditLogs);

module.exports = router;
