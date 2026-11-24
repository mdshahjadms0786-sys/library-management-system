const router = require('express').Router();
const Issue = require('../models/Issue');
const { requireRole } = require('../middleware/auth');
const { isSupported } = require('../utils/transaction');

// DBMS CONCEPT: JOIN using populate() -> shows book title + member name instead of only ids
router.get('/', async (req, res) => {
  const filter = {};
  if (req.user.role !== 'admin') filter.member = req.user._id; // students see ONLY their own rows (security)
  if (req.query.status) filter.status = String(req.query.status);
  const issues = await Issue.find(filter)
    .populate('book', 'title isbn')
    .populate('member', 'name email')
    .sort({ issueDate: -1 });
  res.json(issues);
});

// Calls our "stored procedure" Issue.issueBook (runs as a TRANSACTION)
router.post('/issue', requireRole('admin'), async (req, res) => {
  const issue = await Issue.issueBook(req.body.bookId, req.body.memberId);
  res.status(201).json({ issue, transaction: isSupported() ? 'COMMITTED' : 'NO_REPLICA_SET (ran without transaction)' });
});

router.post('/:id/return', requireRole('admin'), async (req, res) => {
  const issue = await Issue.returnBook(req.params.id);
  res.json({ issue, transaction: isSupported() ? 'COMMITTED' : 'NO_REPLICA_SET (ran without transaction)' });
});

module.exports = router;
