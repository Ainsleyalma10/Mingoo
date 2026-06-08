const { db } = require('../config/db');
const { creditCoins } = require('../utils/balance');

// --- Helper for Audit Logs ---
const logAdminAction = async (adminId, action, entityType, entityId, prevVal, newVal) => {
    try {
        await db.from('audit_logs').insert([{
            admin_id: adminId,
            action,
            entity_type: entityType,
            entity_id: entityId,
            previous_value: prevVal || null,
            new_value: newVal || null,
            ip_address: '0.0.0.0', // can be passed from req.ip
            device_info: 'Server'
        }]);
    } catch (e) {
        console.error("Failed to write audit log:", e.message);
    }
};

// ==========================================
// DASHBOARD
// ==========================================
const getStats = async (req, res) => {
    try {
        const stats = { totalUsers: 0, totalStreams: 0, liveStreams: 0, platformRevenue: 0, pendingWithdrawals: 0, totalGiftsSent: 0 };
        const [
            { count: totalUsers }, { count: totalStreams }, { count: liveStreams },
            { count: pendingWithdrawals }, { count: totalGiftsSent }, { data: revenueData }
        ] = await Promise.all([
            db.from('users').select('*', { count: 'exact', head: true }).neq('role', 'admin'),
            db.from('streams').select('*', { count: 'exact', head: true }),
            db.from('streams').select('*', { count: 'exact', head: true }).eq('is_live', true),
            db.from('withdrawals').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
            db.from('transactions').select('*', { count: 'exact', head: true }).eq('type', 'gift'),
            db.from('transactions').select('amount').eq('type', 'gift')
        ]);
        stats.totalUsers = totalUsers || 0;
        stats.totalStreams = totalStreams || 0;
        stats.liveStreams = liveStreams || 0;
        stats.pendingWithdrawals = pendingWithdrawals || 0;
        stats.totalGiftsSent = totalGiftsSent || 0;
        stats.platformRevenue = revenueData ? revenueData.reduce((sum, tx) => sum + tx.amount, 0) : 0;
        res.json(stats);
    } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

const getFinancialReports = async (req, res) => {
    try {
        const { data, error } = await db.from('financial_reports').select('*').order('date', { ascending: false }).limit(30);
        if (error) throw error;
        res.json(data);
    } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

// ==========================================
// USERS
// ==========================================
const getUsers = async (req, res) => {
    try {
        const { data: users, error } = await db.from('users').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        res.json(users);
    } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

const toggleUserBan = async (req, res) => {
    const { id } = req.params;
    const { is_banned } = req.body; 
    try {
        const { data: oldUser } = await db.from('users').select('is_banned').eq('id', id).single();
        const { error } = await db.from('users').update({ is_banned: !!is_banned }).eq('id', id);
        if (error) throw error;
        await logAdminAction(req.user.id, is_banned ? 'BAN_USER' : 'UNBAN_USER', 'users', id, { is_banned: oldUser?.is_banned }, { is_banned });
        res.json({ message: `User ${is_banned ? 'banned' : 'unbanned'} successfully` });
    } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

const addCoins = async (req, res) => {
    const { id } = req.params;
    const { amount } = req.body;
    try {
        const { data: user } = await db.from('users').select('coin_balance').eq('id', id).single();
        const newBalance = user.coin_balance + parseInt(amount);
        await db.from('users').update({ coin_balance: newBalance }).eq('id', id);
        await db.from('wallet_transactions').insert([{ user_id: id, amount, transaction_type: 'admin_adjustment' }]);
        await logAdminAction(req.user.id, 'ADD_COINS', 'users', id, { balance: user.coin_balance }, { balance: newBalance });
        res.json({ message: 'Coins added', newBalance });
    } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

const removeCoins = async (req, res) => {
    const { id } = req.params;
    const { amount } = req.body;
    try {
        const { data: user } = await db.from('users').select('coin_balance').eq('id', id).single();
        const newBalance = Math.max(0, user.coin_balance - parseInt(amount));
        await db.from('users').update({ coin_balance: newBalance }).eq('id', id);
        await db.from('wallet_transactions').insert([{ user_id: id, amount: -amount, transaction_type: 'admin_adjustment' }]);
        await logAdminAction(req.user.id, 'REMOVE_COINS', 'users', id, { balance: user.coin_balance }, { balance: newBalance });
        res.json({ message: 'Coins removed', newBalance });
    } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

const assignSubscription = async (req, res) => {
    const { id } = req.params;
    const { plan_id, duration_days } = req.body;
    try {
        const expires_at = new Date();
        expires_at.setDate(expires_at.getDate() + parseInt(duration_days));
        await db.from('user_subscriptions').insert([{ user_id: id, plan_id, expires_at }]);
        await logAdminAction(req.user.id, 'ASSIGN_SUBSCRIPTION', 'users', id, null, { plan_id, duration_days });
        res.json({ message: 'Subscription assigned' });
    } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

// ==========================================
// HOSTS
// ==========================================
const getHosts = async (req, res) => {
    try {
        const { data: hosts, error } = await db.from('users').select('*').gt('followers_count', 0); // Simplified host condition
        if (error) throw error;
        res.json(hosts || []);
    } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

// ==========================================
// STREAMS & CALLS
// ==========================================
const getStreams = async (req, res) => {
    try {
        const { data: streams, error } = await db.from('streams').select('*, users!host_id(username)').order('created_at', { ascending: false }).limit(100);
        if (error) throw error;
        res.json(streams.map(s => ({ ...s, username: s.users?.username, users: undefined })));
    } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

const terminateStream = async (req, res) => {
    const { id } = req.params;
    const io = req.app.get('io');
    try {
        const { data: stream } = await db.from('streams').select('livekit_room, is_live').eq('id', id).single();
        if (!stream) return res.status(404).json({ message: 'Stream not found' });
        await db.from('streams').update({ is_live: false }).eq('id', id);
        if (io && stream.livekit_room) io.to(stream.livekit_room).emit('stream-ended', { message: 'Terminated by admin' });
        await logAdminAction(req.user.id, 'TERMINATE_STREAM', 'streams', id, { is_live: true }, { is_live: false });
        res.json({ message: 'Stream terminated' });
    } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

const getStreamAnalytics = async (req, res) => {
    try {
        const { data, error } = await db.from('stream_analytics').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

const getCalls = async (req, res) => {
    try {
        const { data, error } = await db.from('calls').select('*').order('started_at', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

// ==========================================
// WITHDRAWALS
// ==========================================
const getWithdrawals = async (req, res) => {
    try {
        const { data, error } = await db.from('withdrawals').select('*, users!user_id(username)').order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data.map(w => ({ ...w, username: w.users?.username, users: undefined })));
    } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

const updateWithdrawal = async (req, res) => {
    const { status } = req.body; 
    try {
        const { data: existing } = await db.from('withdrawals').select('id, amount, user_id, status').eq('id', req.params.id).single();
        if (!existing || existing.status !== 'pending') return res.status(400).json({ message: 'Invalid withdrawal' });
        await db.from('withdrawals').update({ status }).eq('id', req.params.id);
        if (status === 'rejected') await creditCoins(existing.user_id, existing.amount);
        await logAdminAction(req.user.id, 'UPDATE_WITHDRAWAL', 'withdrawals', req.params.id, { status: existing.status }, { status });
        res.json({ message: `Withdrawal ${status}` });
    } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

// ==========================================
// GIFTS
// ==========================================
const getGifts = async (req, res) => {
    try {
        const { data, error } = await db.from('gifts').select('*');
        if (error) throw error;
        res.json(data);
    } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

const createGift = async (req, res) => {
    const { name, icon, coin_cost } = req.body;
    try {
        const { data, error } = await db.from('gifts').insert([{ name, icon, coin_cost }]).select().single();
        if (error) throw error;
        await logAdminAction(req.user.id, 'CREATE_GIFT', 'gifts', data.id, null, { name, coin_cost });
        res.json(data);
    } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

const updateGift = async (req, res) => {
    const { name, icon, coin_cost } = req.body;
    try {
        const { data, error } = await db.from('gifts').update({ name, icon, coin_cost }).eq('id', req.params.id).select().single();
        if (error) throw error;
        await logAdminAction(req.user.id, 'UPDATE_GIFT', 'gifts', data.id, null, { name, coin_cost });
        res.json(data);
    } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

const deleteGift = async (req, res) => {
    try {
        await db.from('gifts').delete().eq('id', req.params.id);
        await logAdminAction(req.user.id, 'DELETE_GIFT', 'gifts', req.params.id, null, null);
        res.json({ message: 'Deleted' });
    } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

// ==========================================
// SUBSCRIPTION PLANS
// ==========================================
const getSubscriptions = async (req, res) => {
    try {
        const { data, error } = await db.from('subscription_plans').select('*');
        if (error) throw error;
        res.json(data || []);
    } catch (e) { res.status(500).json({ message: 'Server error' }); }
};
const createSubscriptionPlan = async (req, res) => {
    try {
        const { data, error } = await db.from('subscription_plans').insert([req.body]).select().single();
        if (error) throw error;
        res.json(data);
    } catch (e) { res.status(500).json({ message: 'Server error' }); }
};
const updateSubscriptionPlan = async (req, res) => {
    try {
        const { data, error } = await db.from('subscription_plans').update(req.body).eq('id', req.params.id).select().single();
        if (error) throw error;
        res.json(data);
    } catch (e) { res.status(500).json({ message: 'Server error' }); }
};
const deleteSubscriptionPlan = async (req, res) => {
    try {
        await db.from('subscription_plans').delete().eq('id', req.params.id);
        res.json({ message: 'Deleted' });
    } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

// ==========================================
// MODERATION
// ==========================================
const getModerationReports = async (req, res) => {
    try {
        const { data, error } = await db.from('moderation_reports').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch (e) { res.status(500).json({ message: 'Server error' }); }
};
const updateModerationReport = async (req, res) => {
    try {
        const { data, error } = await db.from('moderation_reports').update({ status: req.body.status, resolved_by: req.user.id }).eq('id', req.params.id).select().single();
        if (error) throw error;
        res.json(data);
    } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

// ==========================================
// NOTIFICATIONS
// ==========================================
const sendNotification = async (req, res) => {
    try {
        const { target_type, message, type } = req.body;
        await db.from('notification_logs').insert([{ sender_id: req.user.id, target_type, message, type }]);
        res.json({ message: 'Notification sent' });
    } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

// ==========================================
// AUDIT LOGS
// ==========================================
const getAuditLogs = async (req, res) => {
    try {
        const { data, error } = await db.from('audit_logs').select('*, users!admin_id(username)').order('created_at', { ascending: false }).limit(200);
        if (error) throw error;
        res.json(data.map(l => ({ ...l, admin_username: l.users?.username, users: undefined })));
    } catch (e) { res.status(500).json({ message: 'Server error' }); }
};

module.exports = { 
    getStats, getUsers, toggleUserBan, addCoins, removeCoins, assignSubscription,
    getHosts, getStreams, terminateStream, getStreamAnalytics, getCalls,
    getWithdrawals, updateWithdrawal, getGifts, createGift, updateGift, deleteGift,
    getSubscriptions, createSubscriptionPlan, updateSubscriptionPlan, deleteSubscriptionPlan,
    getFinancialReports, getModerationReports, updateModerationReport, sendNotification, getAuditLogs
};
