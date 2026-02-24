const express      = require('express');
const router       = express.Router();
const User         = require('../models/User');
const Proxy        = require('../models/Proxy');
const Support      = require('../models/SupportMessage');
const TopUpRequest = require('../models/TopUpRequest');
const proxyApiService = require('../services/proxyApiService');
const { sendText } = require('../utils/messenger');
const M            = require('../utils/messages');

function requireAdminToken(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (!token || token !== process.env.ADMIN_SECRET_TOKEN) return res.status(401).json({ error: 'Non autorisé' });
  next();
}
router.use(requireAdminToken);

// Stats globales
router.get('/stats', async (req, res) => {
  try {
    const [totalUsers, registeredUsers, activeUsers, totalProxies, activeProxies,
           expiredProxies, openTickets, pendingTopUps, allProxies, apiBalance] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isRegistered: true }),
      User.countDocuments({ isLoggedIn: true }),
      Proxy.countDocuments(),
      Proxy.countDocuments({ status: 'ACTIF' }),
      Proxy.countDocuments({ status: 'EXPIRÉ' }),
      Support.countDocuments({ status: 'OPEN' }),
      TopUpRequest.countDocuments({ status: 'PENDING' }),
      Proxy.find({}, 'price purchasedAt').lean(),
      proxyApiService.getBalance().catch(() => ({ balance: null }))
    ]);

    const totalRevenue = allProxies.reduce((s, p) => s + (p.price || 0), 0);
    const mStart = new Date(); mStart.setDate(1); mStart.setHours(0, 0, 0, 0);
    const monthRevenue = allProxies.filter(p => new Date(p.purchasedAt) >= mStart)
                                   .reduce((s, p) => s + (p.price || 0), 0);

    res.json({
      users:        { total: totalUsers, registered: registeredUsers, active: activeUsers },
      proxies:      { total: totalProxies, active: activeProxies, expired: expiredProxies },
      revenue:      { total: +totalRevenue.toFixed(2), thisMonth: +monthRevenue.toFixed(2) },
      support:      { openTickets },
      topups:       { pending: pendingTopUps },
      apiBalance:   apiBalance.balance
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Users
router.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page || 1);
    const limit = parseInt(req.query.limit || 20);
    const search = req.query.search || '';
    const filter = search
      ? { $or: [{ email: { $regex: search, $options: 'i' } }, { facebookName: { $regex: search, $options: 'i' } }] }
      : {};
    const [users, total] = await Promise.all([
      User.find(filter, '-password -stateData').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      User.countDocuments(filter)
    ]);
    const userIds = users.map(u => u._id);
    const proxiesByUser = await Proxy.aggregate([
      { $match: { userId: { $in: userIds } } },
      { $group: { _id: '$userId', count: { $sum: 1 }, spent: { $sum: '$price' } } }
    ]);
    const pm = {};
    proxiesByUser.forEach(p => { pm[p._id.toString()] = p; });
    const enriched = users.map(u => ({
      ...u,
      proxiesCount: pm[u._id.toString()]?.count || 0,
      totalSpent: +(pm[u._id.toString()]?.spent || 0).toFixed(2)
    }));
    res.json({ users: enriched, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Proxies
router.get('/proxies', async (req, res) => {
  try {
    const page = parseInt(req.query.page || 1);
    const limit = parseInt(req.query.limit || 20);
    const status = req.query.status || '';
    const filter = status ? { status } : {};
    const [proxies, total] = await Promise.all([
      Proxy.find(filter).populate('userId', 'email facebookName psid').sort({ purchasedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Proxy.countDocuments(filter)
    ]);
    res.json({ proxies, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Support
router.get('/support', async (req, res) => {
  try {
    const page = parseInt(req.query.page || 1);
    const limit = parseInt(req.query.limit || 20);
    const status = req.query.status || '';
    const filter = status ? { status } : {};
    const [messages, total] = await Promise.all([
      Support.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Support.countDocuments(filter)
    ]);
    res.json({ messages, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/support/:id', async (req, res) => {
  try {
    const msg = await Support.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.json(msg);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Top-ups
router.get('/topups', async (req, res) => {
  try {
    const page = parseInt(req.query.page || 1);
    const limit = parseInt(req.query.limit || 20);
    const status = req.query.status || 'PENDING';
    const filter = status ? { status } : {};
    const [topups, total] = await Promise.all([
      TopUpRequest.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
        .populate('userId', 'email facebookName balance').lean(),
      TopUpRequest.countDocuments(filter)
    ]);
    res.json({ topups, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Approuver / Rejeter un top-up
router.patch('/topups/:id', async (req, res) => {
  try {
    const { status } = req.body; // APPROVED ou REJECTED
    const topup = await TopUpRequest.findById(req.params.id).populate('userId');
    if (!topup) return res.status(404).json({ error: 'Introuvable' });
    if (topup.status !== 'PENDING') return res.status(400).json({ error: 'Demande déjà traitée' });

    topup.status      = status;
    topup.processedAt = new Date();
    await topup.save();

    if (status === 'APPROVED') {
      // Crédite le wallet de l'utilisateur
      const user = topup.userId;
      user.balance = (user.balance || 0) + topup.amount;
      await user.save();

      // Notifie l'utilisateur via Messenger
      try {
        await sendText(user.psid, M.TOPUP_APPROVED(topup.amount, user.balance));
      } catch (e) { console.warn('Notif Messenger échouée:', e.message); }
    }

    res.json({ ok: true, status });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Revenue chart
router.get('/revenue-chart', async (req, res) => {
  try {
    const days = parseInt(req.query.days || 30);
    const from = new Date(); from.setDate(from.getDate() - days);
    const data = await Proxy.aggregate([
      { $match: { purchasedAt: { $gte: from } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$purchasedAt' } }, revenue: { $sum: '$price' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Activity feed
router.get('/activity', async (req, res) => {
  try {
    const [recentProxies, recentUsers, recentTickets, recentTopups] = await Promise.all([
      Proxy.find().sort({ purchasedAt: -1 }).limit(8).populate('userId', 'email').lean(),
      User.find({ isRegistered: true }).sort({ createdAt: -1 }).limit(4).lean(),
      Support.find().sort({ createdAt: -1 }).limit(4).lean(),
      TopUpRequest.find().sort({ createdAt: -1 }).limit(4).populate('userId', 'email').lean()
    ]);
    const activity = [
      ...recentProxies.map(p => ({ type: 'purchase', date: p.purchasedAt, label: `Achat proxy ${p.country || ''} — $${p.price || 0}`, user: p.userId?.email || p.psid })),
      ...recentUsers.map(u => ({ type: 'register', date: u.createdAt, label: 'Nouvel inscrit', user: u.email || u.facebookName })),
      ...recentTickets.map(t => ({ type: 'support', date: t.createdAt, label: `Ticket: ${t.message.slice(0, 40)}...`, user: t.email || t.psid })),
      ...recentTopups.map(t => ({ type: 'topup', date: t.createdAt, label: `Recharge $${t.amount} — ${t.status}`, user: t.userId?.email || t.psid }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20);
    res.json(activity);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
