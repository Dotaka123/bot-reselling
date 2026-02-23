const express = require('express');
const router  = express.Router();
const User    = require('../models/User');
const Proxy   = require('../models/Proxy');
const Support = require('../models/SupportMessage');
const proxyApiService = require('../services/proxyApiService');

// ── Middleware auth par token secret ──────────────────────────────
function requireAdminToken(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (!token || token !== process.env.ADMIN_SECRET_TOKEN) {
    return res.status(401).json({ error: 'Non autorisé' });
  }
  next();
}

router.use(requireAdminToken);

// ── GET /admin/api/stats ──────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [
      totalUsers,
      registeredUsers,
      activeUsers,
      totalProxies,
      activeProxies,
      expiredProxies,
      openTickets,
      allProxies,
      apiBalance
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isRegistered: true }),
      User.countDocuments({ isLoggedIn: true }),
      Proxy.countDocuments(),
      Proxy.countDocuments({ status: 'ACTIF' }),
      Proxy.countDocuments({ status: 'EXPIRÉ' }),
      Support.countDocuments({ status: 'OPEN' }),
      Proxy.find({}, 'price purchasedAt status').lean(),
      proxyApiService.getBalance().catch(() => ({ balance: 'N/A' }))
    ]);

    const totalRevenue = allProxies.reduce((sum, p) => sum + (p.price || 0), 0);
    const monthStart   = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
    const monthRevenue = allProxies
      .filter(p => new Date(p.purchasedAt) >= monthStart)
      .reduce((sum, p) => sum + (p.price || 0), 0);

    res.json({
      users:        { total: totalUsers, registered: registeredUsers, active: activeUsers },
      proxies:      { total: totalProxies, active: activeProxies, expired: expiredProxies },
      revenue:      { total: +totalRevenue.toFixed(2), thisMonth: +monthRevenue.toFixed(2) },
      support:      { openTickets },
      apiBalance:   apiBalance.balance
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /admin/api/users ──────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const page  = parseInt(req.query.page  || 1);
    const limit = parseInt(req.query.limit || 20);
    const search = req.query.search || '';

    const filter = search
      ? { $or: [{ email: { $regex: search, $options: 'i' } }, { facebookName: { $regex: search, $options: 'i' } }] }
      : {};

    const [users, total] = await Promise.all([
      User.find(filter, '-password -stateData')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter)
    ]);

    // Enrichir avec nb proxies et dépenses
    const userIds = users.map(u => u._id);
    const proxiesByUser = await Proxy.aggregate([
      { $match: { userId: { $in: userIds } } },
      { $group: { _id: '$userId', count: { $sum: 1 }, spent: { $sum: '$price' } } }
    ]);
    const proxyMap = {};
    proxiesByUser.forEach(p => { proxyMap[p._id.toString()] = p; });

    const enriched = users.map(u => ({
      ...u,
      proxiesCount: proxyMap[u._id.toString()]?.count || 0,
      totalSpent:   +(proxyMap[u._id.toString()]?.spent || 0).toFixed(2)
    }));

    res.json({ users: enriched, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /admin/api/proxies ────────────────────────────────────────
router.get('/proxies', async (req, res) => {
  try {
    const page   = parseInt(req.query.page  || 1);
    const limit  = parseInt(req.query.limit || 20);
    const status = req.query.status || '';

    const filter = status ? { status } : {};

    const [proxies, total] = await Promise.all([
      Proxy.find(filter)
        .populate('userId', 'email facebookName psid')
        .sort({ purchasedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Proxy.countDocuments(filter)
    ]);

    res.json({ proxies, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /admin/api/support ────────────────────────────────────────
router.get('/support', async (req, res) => {
  try {
    const page   = parseInt(req.query.page  || 1);
    const limit  = parseInt(req.query.limit || 20);
    const status = req.query.status || '';

    const filter = status ? { status } : {};

    const [messages, total] = await Promise.all([
      Support.find(filter).sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit).lean(),
      Support.countDocuments(filter)
    ]);

    res.json({ messages, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /admin/api/support/:id ─────────────────────────────────
router.patch('/support/:id', async (req, res) => {
  try {
    const msg = await Support.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    );
    res.json(msg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /admin/api/revenue-chart ─────────────────────────────────
router.get('/revenue-chart', async (req, res) => {
  try {
    const days = parseInt(req.query.days || 30);
    const from = new Date();
    from.setDate(from.getDate() - days);

    const data = await Proxy.aggregate([
      { $match: { purchasedAt: { $gte: from } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$purchasedAt' } },
        revenue: { $sum: '$price' },
        count:   { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /admin/api/activity ───────────────────────────────────────
router.get('/activity', async (req, res) => {
  try {
    const [recentProxies, recentUsers, recentTickets] = await Promise.all([
      Proxy.find().sort({ purchasedAt: -1 }).limit(10)
        .populate('userId', 'email facebookName').lean(),
      User.find({ isRegistered: true }).sort({ createdAt: -1 }).limit(5)
        .select('email facebookName createdAt').lean(),
      Support.find().sort({ createdAt: -1 }).limit(5).lean()
    ]);

    const activity = [
      ...recentProxies.map(p => ({
        type: 'purchase', date: p.purchasedAt,
        label: `Achat proxy ${p.country || ''} — ${p.price || 0}$`,
        user: p.userId?.email || p.psid
      })),
      ...recentUsers.map(u => ({
        type: 'register', date: u.createdAt,
        label: `Nouvel inscrit`,
        user: u.email || u.facebookName
      })),
      ...recentTickets.map(t => ({
        type: 'support', date: t.createdAt,
        label: `Ticket support: ${t.message.slice(0, 40)}...`,
        user: t.email || t.psid
      }))
    ];

    activity.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json(activity.slice(0, 20));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
