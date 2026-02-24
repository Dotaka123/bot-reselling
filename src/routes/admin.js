/**
 * admin.js — Admin Panel API Routes
 * Protected by ADMIN_PASSWORD env variable + JWT session token
 */
const express  = require('express');
const router   = express.Router();
const crypto   = require('crypto');
const User     = require('../models/User');
const Proxy    = require('../models/Proxy');
const SupportMessage = require('../models/SupportMessage');
const TopUpRequest   = require('../models/TopUpRequest');
const { sendText }   = require('../utils/messenger');

// ── Simple token store (in-memory, resets on restart) ──────────────────────
const SESSIONS = new Set();

function genToken() {
    return crypto.randomBytes(32).toString('hex');
}

function requireAuth(req, res, next) {
    const auth = req.headers['x-admin-token'] || req.query.token;
    if (!auth || !SESSIONS.has(auth)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// ── AUTH ───────────────────────────────────────────────────────────────────

router.post('/login', (req, res) => {
    const { password } = req.body;
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Wrong password' });
    }
    const token = genToken();
    SESSIONS.add(token);
    // Auto-expire after 8h
    setTimeout(() => SESSIONS.delete(token), 8 * 60 * 60 * 1000);
    res.json({ token });
});

router.post('/logout', requireAuth, (req, res) => {
    const auth = req.headers['x-admin-token'];
    SESSIONS.delete(auth);
    res.json({ ok: true });
});

// ── DASHBOARD STATS ────────────────────────────────────────────────────────

router.get('/stats', requireAuth, async (req, res) => {
    try {
        const [
            totalUsers,
            activeProxies,
            totalProxies,
            pendingTopups,
            newSupport,
            revenue,
            recentUsers,
            recentProxies
        ] = await Promise.all([
            User.countDocuments(),
            Proxy.countDocuments({ status: 'ACTIVE' }),
            Proxy.countDocuments(),
            TopUpRequest.countDocuments({ status: 'PENDING' }),
            SupportMessage.countDocuments({ status: 'NEW' }),
            Proxy.aggregate([{ $group: { _id: null, total: { $sum: '$price' } } }]),
            User.find().sort({ createdAt: -1 }).limit(5).select('email balance createdAt'),
            Proxy.find().sort({ createdAt: -1 }).limit(5).populate('userId', 'email').select('ip port protocol country status price createdAt')
        ]);

        const totalRevenue = revenue[0]?.total || 0;

        // Users created in last 7 days
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const newUsersWeek = await User.countDocuments({ createdAt: { $gte: weekAgo } });

        res.json({
            totalUsers, activeProxies, totalProxies,
            pendingTopups, newSupport, totalRevenue,
            newUsersWeek, recentUsers, recentProxies
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── USERS ──────────────────────────────────────────────────────────────────

router.get('/users', requireAuth, async (req, res) => {
    try {
        const { search, page = 1, limit = 20 } = req.query;
        const query = {};
        if (search) {
            query.$or = [
                { email: { $regex: search, $options: 'i' } },
                { psid: { $regex: search, $options: 'i' } }
            ];
        }
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [users, total] = await Promise.all([
            User.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit))
                .select('-passwordHash -stateData'),
            User.countDocuments(query)
        ]);
        res.json({ users, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/users/:id', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-passwordHash');
        if (!user) return res.status(404).json({ error: 'User not found' });
        const [proxies, topups, messages] = await Promise.all([
            Proxy.find({ userId: user._id }).sort({ createdAt: -1 }),
            TopUpRequest.find({ userId: user._id }).sort({ createdAt: -1 }),
            SupportMessage.find({ userId: user._id }).sort({ createdAt: -1 })
        ]);
        res.json({ user, proxies, topups, messages });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.patch('/users/:id/balance', requireAuth, async (req, res) => {
    try {
        const { amount, action } = req.body; // action: 'add' | 'set'
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const val = parseFloat(amount);
        if (isNaN(val) || val < 0) return res.status(400).json({ error: 'Invalid amount' });

        if (action === 'set') {
            user.balance = val;
        } else {
            user.balance = parseFloat(((user.balance || 0) + val).toFixed(4));
        }
        await user.save();

        // Notify user on Messenger
        await sendText(user.psid,
            `💰 BALANCE UPDATE\n\n` +
            `Your balance has been ${action === 'set' ? 'set to' : 'credited with'} $${val.toFixed(2)}.\n` +
            `New balance: $${user.balance.toFixed(2)}\n\n` +
            `Type anything to return to the menu.`
        );

        res.json({ balance: user.balance });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Send direct message to a user
router.post('/users/:id/message', requireAuth, async (req, res) => {
    try {
        const { message } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (!message?.trim()) return res.status(400).json({ error: 'Empty message' });

        const ok = await sendText(user.psid, `📣 Admin message:\n\n${message.trim()}`);
        res.json({ sent: ok });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── SUPPORT MESSAGES ───────────────────────────────────────────────────────

router.get('/support', requireAuth, async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const query = status ? { status } : {};
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [messages, total] = await Promise.all([
            SupportMessage.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit))
                .populate('userId', 'email psid balance'),
            SupportMessage.countDocuments(query)
        ]);
        res.json({ messages, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.patch('/support/:id/reply', requireAuth, async (req, res) => {
    try {
        const { reply } = req.body;
        if (!reply?.trim()) return res.status(400).json({ error: 'Empty reply' });

        const msg = await SupportMessage.findById(req.params.id).populate('userId', 'psid email');
        if (!msg) return res.status(404).json({ error: 'Message not found' });

        // Send via Messenger
        const ok = await sendText(msg.psid,
            `📬 SUPPORT REPLY\n\n` +
            `Your message: "${msg.message.substring(0, 80)}${msg.message.length > 80 ? '...' : ''}"\n\n` +
            `📣 Admin reply:\n${reply.trim()}\n\n` +
            `Type anything to return to the menu.`
        );

        msg.status     = 'REPLIED';
        msg.adminReply = reply.trim();
        msg.repliedAt  = new Date();
        await msg.save();

        res.json({ sent: ok, message: msg });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.patch('/support/:id/status', requireAuth, async (req, res) => {
    try {
        const { status } = req.body;
        const msg = await SupportMessage.findByIdAndUpdate(
            req.params.id, { status }, { new: true }
        );
        if (!msg) return res.status(404).json({ error: 'Not found' });
        res.json(msg);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── TOP-UP REQUESTS ────────────────────────────────────────────────────────

router.get('/topups', requireAuth, async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const query = status ? { status } : {};
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [requests, total] = await Promise.all([
            TopUpRequest.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit))
                .populate('userId', 'email psid balance'),
            TopUpRequest.countDocuments(query)
        ]);
        res.json({ requests, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.patch('/topups/:id/approve', requireAuth, async (req, res) => {
    try {
        const { amount, notes } = req.body;
        const req_ = await TopUpRequest.findById(req.params.id).populate('userId');
        if (!req_) return res.status(404).json({ error: 'Not found' });
        if (req_.status !== 'PENDING') return res.status(400).json({ error: 'Already processed' });

        const approved = parseFloat(amount) || req_.amount;
        req_.status         = 'APPROVED';
        req_.approvedAmount = approved;
        req_.approvedAt     = new Date();
        req_.notes          = notes || '';
        await req_.save();

        // Add balance to user
        const user = req_.userId;
        user.balance = parseFloat(((user.balance || 0) + approved).toFixed(4));
        await user.save();

        // Notify user
        await sendText(user.psid,
            `✅ TOP-UP APPROVED!\n\n` +
            `💰 Amount credited: $${approved.toFixed(2)}\n` +
            `💳 New balance: $${user.balance.toFixed(2)}\n\n` +
            `Type anything to return to the menu.`
        );

        res.json({ ok: true, balance: user.balance });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.patch('/topups/:id/reject', requireAuth, async (req, res) => {
    try {
        const { notes } = req.body;
        const req_ = await TopUpRequest.findById(req.params.id).populate('userId');
        if (!req_) return res.status(404).json({ error: 'Not found' });
        if (req_.status !== 'PENDING') return res.status(400).json({ error: 'Already processed' });

        req_.status = 'REJECTED';
        req_.notes  = notes || '';
        req_.approvedAt = new Date();
        await req_.save();

        await sendText(req_.psid,
            `❌ TOP-UP REJECTED\n\n` +
            `Your request of $${req_.amount.toFixed(2)} was rejected.\n` +
            (notes ? `Reason: ${notes}\n\n` : '\n') +
            `Contact support if you have questions.`
        );

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── PROXIES ────────────────────────────────────────────────────────────────

router.get('/proxies', requireAuth, async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const query = status ? { status } : {};
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [proxies, total] = await Promise.all([
            Proxy.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit))
                .populate('userId', 'email'),
            Proxy.countDocuments(query)
        ]);
        res.json({ proxies, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
