const router = require('express').Router();
const mongoose = require('mongoose');
const Book = require('../models/Book');
const Member = require('../models/Member');
const Issue = require('../models/Issue');
const { requireRole } = require('../middleware/auth');

// Dashboard numbers - simple aggregate functions (COUNT, SUM)
router.get('/summary', async (req, res) => {
  const [books, members, issued, overdue, copies] = await Promise.all([
    Book.countDocuments(),
    Member.countDocuments({ role: 'student' }),
    Issue.countDocuments({ status: 'ISSUED' }),
    Issue.countDocuments({ status: 'ISSUED', dueDate: { $lt: new Date() } }),
    Book.aggregate([{ $group: { _id: null, total: { $sum: '$totalCopies' }, available: { $sum: '$availableCopies' } } }])
  ]);
  res.json({ books, members, issued, overdue, totalCopies: copies[0]?.total || 0, availableCopies: copies[0]?.available || 0 });
});

// Everything below is admin only
router.use(requireRole('admin'));

// DBMS CONCEPT: GROUP BY + JOIN + ORDER BY + LIMIT
// SQL: SELECT b.title, COUNT(*) FROM issues i JOIN books b ... GROUP BY b.title ORDER BY 2 DESC LIMIT 5
router.get('/top-books', async (req, res) => {
  const rows = await Issue.aggregate([
    { $group: { _id: '$book', timesIssued: { $sum: 1 } } },
    { $lookup: { from: 'books', localField: '_id', foreignField: '_id', as: 'book' } },
    { $unwind: '$book' },
    { $sort: { timesIssued: -1 } },
    { $limit: 5 },
    { $project: { _id: 0, title: '$book.title', category: '$book.category', timesIssued: 1 } }
  ]);
  res.json(rows);
});

// DBMS CONCEPT: WINDOW FUNCTION (Unit 2 Session 22) - DENSE_RANK() OVER (PARTITION BY category ORDER BY count DESC)
router.get('/category-rank', async (req, res) => {
  const rows = await Issue.aggregate([
    { $group: { _id: '$book', timesIssued: { $sum: 1 } } },
    { $lookup: { from: 'books', localField: '_id', foreignField: '_id', as: 'book' } },
    { $unwind: '$book' },
    {
      $setWindowFields: {
        partitionBy: '$book.category',
        sortBy: { timesIssued: -1 },
        output: { rankInCategory: { $denseRank: {} } }
      }
    },
    { $project: { _id: 0, category: '$book.category', title: '$book.title', timesIssued: 1, rankInCategory: 1 } },
    { $sort: { category: 1, rankInCategory: 1 } }
  ]);
  res.json(rows);
});

// DBMS CONCEPT: VIEW (Unit 2 Session 20) - reading from the "overdue_issues" view created in server.js
router.get('/overdue', async (req, res) => {
  const rows = await mongoose.connection.db.collection('overdue_issues').find().toArray();
  res.json(rows);
});

// DBMS CONCEPT: SET OPERATION EXCEPT / NOT EXISTS - books that were NEVER issued
// SQL: SELECT * FROM books b WHERE NOT EXISTS (SELECT 1 FROM issues i WHERE i.book_id = b.id)
router.get('/never-issued', async (req, res) => {
  const rows = await Book.aggregate([
    { $lookup: { from: 'issues', localField: '_id', foreignField: 'book', as: 'issues' } },
    { $match: { issues: { $size: 0 } } },
    { $project: { _id: 0, title: 1, author: 1, category: 1 } }
  ]);
  res.json(rows);
});

// DBMS CONCEPT: SUM with GROUP BY + HAVING (fine > 0)
router.get('/fines', async (req, res) => {
  const rows = await Issue.aggregate([
    { $group: { _id: '$member', totalFine: { $sum: '$fine' }, booksTaken: { $sum: 1 } } },
    { $match: { totalFine: { $gt: 0 } } }, // HAVING
    { $lookup: { from: 'members', localField: '_id', foreignField: '_id', as: 'member' } },
    { $unwind: '$member' },
    { $project: { _id: 0, name: '$member.name', email: '$member.email', totalFine: 1, booksTaken: 1 } },
    { $sort: { totalFine: -1 } }
  ]);
  res.json(rows);
});

// DBMS CONCEPT: CURSOR (Unit 3 Session 30) - process records ROW BY ROW instead of loading all at once
router.get('/export-csv', async (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="books.csv"');
  res.write('ISBN,Title,Author,Category,Total,Available\n');
  const cursor = Book.find().sort({ title: 1 }).lean().cursor();
  for await (const b of cursor) {
    const safe = (v) => `"${String(v).replace(/"/g, '""')}"`;
    res.write([b.isbn, b.title, b.author, b.category, b.totalCopies, b.availableCopies].map(safe).join(',') + '\n');
  }
  res.end();
});

module.exports = router;
