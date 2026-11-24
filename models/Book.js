const mongoose = require('mongoose');
const AuditLog = require('./AuditLog');

const CATEGORIES = ['Programming', 'Database', 'Science', 'Fiction', 'Self-Help', 'Other'];

// DBMS CONCEPT: DDL (structure of the "table") + INTEGRITY CONSTRAINTS (Unit 1 Session 8, Unit 2 Session 13)
const bookSchema = new mongoose.Schema(
  {
    // CANDIDATE KEY: isbn is unique (could have been the primary key). _id is the PRIMARY KEY.
    isbn: {
      type: String, required: [true, 'ISBN is required'], unique: true, trim: true,
      match: [/^[0-9-]{10,17}$/, 'ISBN must be 10-17 digits'] // DOMAIN CONSTRAINT
    },
    title: { type: String, required: [true, 'Title is required'], trim: true },
    author: { type: String, required: [true, 'Author is required'], trim: true },
    category: { type: String, required: true, enum: CATEGORIES }, // DOMAIN CONSTRAINT (allowed values)
    totalCopies: { type: Number, required: true, min: [1, 'At least 1 copy'] },
    availableCopies: { type: Number, required: true, min: [0, 'No copies available'] } // CHECK constraint
  },
  {
    timestamps: true,
    // DBMS CONCEPT: OPTIMISTIC LOCKING (Unit 3 Session 28) - uses version key __v.
    // If two admins update the same book at the same time, the second save fails (VersionError).
    optimisticConcurrency: true
  }
);

// CHECK constraint across two fields
bookSchema.path('availableCopies').validate(function (v) {
  return v <= this.totalCopies;
}, 'Available copies cannot be more than total copies');

// DBMS CONCEPT: INDEXING (Unit 2 Session 21, Unit 4 Session 35)
bookSchema.index({ title: 'text', author: 'text' }); // text index -> fast search
bookSchema.index({ category: 1 });                   // B-tree index on category

// DBMS CONCEPT: TRIGGERS (Unit 3 Session 31) -> Mongoose middleware (hooks)
bookSchema.pre('save', function () { this.$locals.wasNew = this.isNew; });
bookSchema.post('save', async function (doc) {
  if (doc.$locals.wasNew) {
    await AuditLog.create([{ action: 'BOOK_ADDED', details: `"${doc.title}" (${doc.isbn}) added` }],
      { session: doc.$session() });
  }
});
bookSchema.post('findOneAndDelete', async function (doc) {
  if (doc) await AuditLog.create({ action: 'BOOK_DELETED', details: `"${doc.title}" (${doc.isbn}) deleted` });
});

const Book = mongoose.model('Book', bookSchema);
Book.CATEGORIES = CATEGORIES;
module.exports = Book;
