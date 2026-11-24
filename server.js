require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const sanitize = require('./middleware/sanitize');
const { auth, requireRole } = require('./middleware/auth');
const { detectTransactionSupport, isSupported } = require('./utils/transaction');
const AuditLog = require('./models/AuditLog');

const app = express();
app.use(express.json());
app.use(sanitize); // injection prevention on every request
app.use(express.static(path.join(__dirname, 'public')));

// Express 4 does not catch errors from async handlers -> small wrapper
const wrap = (router) => {
  router.stack.forEach((layer) => {
    (layer.route?.stack || []).forEach((s) => {
      const fn = s.handle;
      if (fn.length <= 3) s.handle = (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
    });
  });
  return router;
};

app.use('/api/auth', wrap(require('./routes/auth')));
app.use('/api/books', auth, wrap(require('./routes/books')));
app.use('/api/members', auth, requireRole('admin'), wrap(require('./routes/members')));
app.use('/api/issues', auth, wrap(require('./routes/issues')));
app.use('/api/reports', auth, wrap(require('./routes/reports')));
app.get('/api/audit', auth, requireRole('admin'), async (req, res, next) => {
  try { res.json(await AuditLog.find().sort({ at: -1 }).limit(50)); } catch (e) { next(e); }
});
app.get('/api/system/info', (req, res) =>
  res.json({ database: mongoose.connection.name, transactionsSupported: isSupported() }));

// Central error handler - turns DB errors into friendly messages
app.use((err, req, res, next) => {
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: Object.values(err.errors).map((e) => e.message).join(', ') });
  }
  if (err.code === 11000) {
    return res.status(409).json({ error: `Duplicate value: ${Object.keys(err.keyValue || {}).join(', ')} already exists` });
  }
  if (err.name === 'VersionError') {
    return res.status(409).json({ error: 'Record was updated by someone else (optimistic lock). Please retry.' });
  }
  if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid id' });
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

// DBMS CONCEPT: VIEW - a saved query, no data stored. Re-created on every start.
async function createOverdueView() {
  const db = mongoose.connection.db;
  const exists = await db.listCollections({ name: 'overdue_issues' }).toArray();
  if (exists.length) await db.collection('overdue_issues').drop();
  await db.createCollection('overdue_issues', {
    viewOn: 'issues',
    pipeline: [
      { $match: { status: 'ISSUED', $expr: { $lt: ['$dueDate', '$$NOW'] } } },
      { $lookup: { from: 'books', localField: 'book', foreignField: '_id', as: 'b' } },
      { $lookup: { from: 'members', localField: 'member', foreignField: '_id', as: 'm' } },
      { $unwind: '$b' },
      { $unwind: '$m' },
      {
        $project: {
          _id: 0, title: '$b.title', member: '$m.name', email: '$m.email', dueDate: 1,
          daysLate: { $dateDiff: { startDate: '$dueDate', endDate: '$$NOW', unit: 'day' } }
        }
      }
    ]
  });
}

async function start() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/librarydb';
  await mongoose.connect(uri);
  await detectTransactionSupport();
  await createOverdueView();
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Library app running at http://localhost:${port}`);
    console.log(`Transactions: ${isSupported() ? 'ENABLED (replica set)' : 'DISABLED (standalone MongoDB - use Atlas for real ACID)'}`);
  });
}

if (require.main === module) {
  start().catch((e) => {
    console.error('Could not start:', e.message);
    process.exit(1);
  });
}

module.exports = { app, start };
