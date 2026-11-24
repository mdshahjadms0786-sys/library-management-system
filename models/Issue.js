const mongoose = require('mongoose');
const Book = require('./Book');
const Member = require('./Member');
const AuditLog = require('./AuditLog');
const { runTransaction } = require('../utils/transaction');

const FINE_PER_DAY = Number(process.env.FINE_PER_DAY || 5);
const LOAN_DAYS = Number(process.env.LOAN_DAYS || 14);
const MAX_BOOKS = Number(process.env.MAX_BOOKS_PER_MEMBER || 3);

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// DBMS CONCEPT: RELATIONSHIP "Member BORROWS Book" (many-to-many) stored as its own collection.
// This is NORMALIZATION (3NF): book details and member details are NOT repeated here, only their ids.
const issueSchema = new mongoose.Schema(
  {
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },     // FOREIGN KEY
    member: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true }, // FOREIGN KEY
    issueDate: { type: Date, default: Date.now },
    dueDate: { type: Date, required: true },
    returnDate: { type: Date, default: null },
    fine: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['ISSUED', 'RETURNED'], default: 'ISSUED' }
  },
  { timestamps: true }
);

// DBMS CONCEPT: INDEXES (composite) for fast lookups
issueSchema.index({ member: 1, status: 1 });
issueSchema.index({ book: 1, status: 1 });
// COMPOSITE UNIQUE KEY (partial): a member cannot hold the SAME book twice at the same time
issueSchema.index({ book: 1, member: 1 }, { unique: true, partialFilterExpression: { status: 'ISSUED' } });

// TRIGGER (hook): after every issue/return, write an audit log inside the SAME transaction
issueSchema.pre('save', function () { this.$locals.wasNew = this.isNew; });
issueSchema.post('save', async function (doc) {
  const action = doc.$locals.wasNew ? 'BOOK_ISSUED' : doc.status === 'RETURNED' ? 'BOOK_RETURNED' : null;
  if (!action) return;
  const extra = action === 'BOOK_RETURNED' ? `, fine ₹${doc.fine}` : '';
  await AuditLog.create([{ action, details: `Issue ${doc._id}: book ${doc.book} / member ${doc.member}${extra}` }],
    { session: doc.$session() });
});

// DBMS CONCEPT: STORED PROCEDURE (Unit 3 Session 29) -> reusable model method
// DBMS CONCEPT: TRANSACTION (Unit 3 Session 25): decrease copies + create issue = ONE atomic unit
issueSchema.statics.issueBook = function (bookId, memberId) {
  return runTransaction(async (session) => {
    const member = await Member.findById(memberId).session(session);
    if (!member) throw httpError(404, 'Member not found');

    const active = await this.countDocuments({ member: memberId, status: 'ISSUED' }).session(session);
    if (active >= MAX_BOOKS) throw httpError(400, `Member already has ${MAX_BOOKS} books (limit)`);

    const book = await Book.findById(bookId).session(session);
    if (!book) throw httpError(404, 'Book not found');
    if (book.availableCopies < 1) throw httpError(400, 'No copies available');

    book.availableCopies -= 1;        // step 1
    await book.save({ session });     // optimistic lock checks __v here

    const dueDate = new Date(Date.now() + LOAN_DAYS * 24 * 60 * 60 * 1000);
    const [issue] = await this.create([{ book: book._id, member: member._id, dueDate }], { session }); // step 2
    return issue;                     // both steps succeed -> COMMIT
  });
};

issueSchema.statics.returnBook = function (issueId) {
  return runTransaction(async (session) => {
    const issue = await this.findById(issueId).session(session);
    if (!issue) throw httpError(404, 'Issue record not found');
    if (issue.status === 'RETURNED') throw httpError(400, 'Book already returned');

    const now = new Date();
    const daysLate = Math.ceil((now - issue.dueDate) / (24 * 60 * 60 * 1000));
    issue.fine = daysLate > 0 ? daysLate * FINE_PER_DAY : 0;
    issue.returnDate = now;
    issue.status = 'RETURNED';
    await issue.save({ session });

    const book = await Book.findById(issue.book).session(session);
    if (book) {
      book.availableCopies += 1;
      await book.save({ session });
    }
    return issue;
  });
};

const Issue = mongoose.model('Issue', issueSchema);
Issue.httpError = httpError;
module.exports = Issue;
