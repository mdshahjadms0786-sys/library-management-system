const router = require('express').Router();
const Member = require('../models/Member');
const Issue = require('../models/Issue');

// LIST members + their active issue count
// DBMS CONCEPT: JOIN with $lookup (like LEFT JOIN + GROUP BY / correlated subquery COUNT)
router.get('/', async (req, res) => {
  const members = await Member.aggregate([
    {
      $lookup: {
        from: 'issues',
        let: { memberId: '$_id' },
        pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$member', '$$memberId'] }, { $eq: ['$status', 'ISSUED'] }] } } }],
        as: 'activeIssues'
      }
    },
    { $project: { name: 1, email: 1, phone: 1, role: 1, createdAt: 1, activeBooks: { $size: '$activeIssues' } } },
    { $sort: { role: 1, name: 1 } }
  ]);
  res.json(members);
});

router.post('/', async (req, res) => {
  const { name, email, phone, password, role } = req.body;
  const m = await Member.create({ name, email, phone: phone || undefined, password: password || 'student123', role });
  res.status(201).json({ id: m._id, name: m.name, email: m.email, role: m.role });
});

// REFERENTIAL INTEGRITY: cannot delete a member who still has books
router.delete('/:id', async (req, res) => {
  if (String(req.user._id) === req.params.id) return res.status(400).json({ error: 'You cannot delete yourself' });
  const active = await Issue.countDocuments({ member: req.params.id, status: 'ISSUED' });
  if (active > 0) return res.status(400).json({ error: `Cannot delete: member has ${active} book(s)` });
  const m = await Member.findByIdAndDelete(req.params.id);
  if (!m) return res.status(404).json({ error: 'Member not found' });
  res.json({ message: 'Member deleted' });
});

module.exports = router;
