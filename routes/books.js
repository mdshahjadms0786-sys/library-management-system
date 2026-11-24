const router = require('express').Router();
const Book = require('../models/Book');
const Issue = require('../models/Issue');
const { requireRole } = require('../middleware/auth');

// READ (DML: SELECT ... WHERE) - search uses the TEXT INDEX
router.get('/', async (req, res) => {
  const filter = {};
  if (req.query.q) filter.$text = { $search: String(req.query.q) };
  if (req.query.category) filter.category = String(req.query.category);
  const books = await Book.find(filter).sort({ title: 1 });
  res.json(books);
});

router.get('/categories', (req, res) => res.json(Book.CATEGORIES));

// DBMS CONCEPT: QUERY OPTIMIZATION + EXECUTION PLAN (Unit 4 Session 34-35)
// Same search, two ways: WITH index (IXSCAN / TEXT) vs WITHOUT index (COLLSCAN = full table scan)
function planStages(plan, out = []) {
  if (!plan) return out;
  out.push(plan.stage);
  planStages(plan.inputStage, out);
  (plan.inputStages || []).forEach((p) => planStages(p, out));
  return out;
}
function summary(exp) {
  const s = exp.executionStats;
  return {
    plan: planStages(exp.queryPlanner.winningPlan).join(' <- '),
    docsExamined: s.totalDocsExamined,
    keysExamined: s.totalKeysExamined,
    returned: s.nReturned,
    timeMs: s.executionTimeMillis
  };
}
router.get('/explain', requireRole('admin'), async (req, res) => {
  const q = String(req.query.q || 'database');
  const withIndex = await Book.find({ $text: { $search: q } }).explain('executionStats');
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const withoutIndex = await Book.find({ title: { $regex: escaped, $options: 'i' } }).explain('executionStats');
  res.json({ query: q, withIndex: summary(withIndex), withoutIndex: summary(withoutIndex) });
});

// CREATE (DML: INSERT)
router.post('/', requireRole('admin'), async (req, res) => {
  const { isbn, title, author, category, totalCopies } = req.body;
  const book = await Book.create({
    isbn, title, author, category, totalCopies, availableCopies: totalCopies
  });
  res.status(201).json(book);
});

// UPDATE (DML: UPDATE) - uses save() so validators + optimistic locking (__v) run
router.put('/:id', requireRole('admin'), async (req, res) => {
  const book = await Book.findById(req.params.id);
  if (!book) return res.status(404).json({ error: 'Book not found' });
  const { title, author, category, totalCopies } = req.body;
  if (totalCopies !== undefined) {
    const issued = book.totalCopies - book.availableCopies;
    if (Number(totalCopies) < issued) return res.status(400).json({ error: `${issued} copies are issued; total can't be less` });
    book.availableCopies = Number(totalCopies) - issued;
    book.totalCopies = Number(totalCopies);
  }
  if (title) book.title = title;
  if (author) book.author = author;
  if (category) book.category = category;
  await book.save();
  res.json(book);
});

// DELETE (DML: DELETE) with REFERENTIAL INTEGRITY: like FOREIGN KEY ... ON DELETE RESTRICT
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const active = await Issue.countDocuments({ book: req.params.id, status: 'ISSUED' });
  if (active > 0) return res.status(400).json({ error: `Cannot delete: ${active} copy(ies) currently issued` });
  const book = await Book.findByIdAndDelete(req.params.id);
  if (!book) return res.status(404).json({ error: 'Book not found' });
  res.json({ message: 'Book deleted' });
});

module.exports = router;
