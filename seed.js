// Fills the database with sample data:  npm run seed
require('dotenv').config();
const mongoose = require('mongoose');
const Book = require('./models/Book');
const Member = require('./models/Member');
const Issue = require('./models/Issue');
const AuditLog = require('./models/AuditLog');

const DAY = 24 * 60 * 60 * 1000;

async function seed() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/librarydb');
  await Promise.all([Book.deleteMany(), Member.deleteMany(), Issue.deleteMany(), AuditLog.deleteMany()]);
  await Promise.all([Book.syncIndexes(), Member.syncIndexes(), Issue.syncIndexes()]); // DDL: create indexes

  // Members (create one by one so the password-hash hook runs)
  const admin = await Member.create({ name: 'Library Admin', email: 'admin@lib.com', password: 'admin123', role: 'admin' });
  const s1 = await Member.create({ name: 'Md Shahjad', email: 'shahjad@student.com', phone: '9876543210', password: 'student123' });
  const s2 = await Member.create({ name: 'Riya Sharma', email: 'riya@student.com', phone: '9123456780', password: 'student123' });
  const s3 = await Member.create({ name: 'Aman Verma', email: 'aman@student.com', password: 'student123' });

  const data = [
    ['978-0133970777', 'Database System Concepts', 'Silberschatz', 'Database', 4],
    ['978-0133970778', 'Fundamentals of Database Systems', 'Elmasri & Navathe', 'Database', 3],
    ['978-1491954461', 'MongoDB: The Definitive Guide', 'Shannon Bradshaw', 'Database', 2],
    ['978-0132350884', 'Clean Code', 'Robert C. Martin', 'Programming', 3],
    ['978-1593279509', 'Eloquent JavaScript', 'Marijn Haverbeke', 'Programming', 2],
    ['978-0735211292', 'Atomic Habits', 'James Clear', 'Self-Help', 5],
    ['978-0553380163', 'A Brief History of Time', 'Stephen Hawking', 'Science', 2],
    ['978-0061120084', 'To Kill a Mockingbird', 'Harper Lee', 'Fiction', 1]
  ];
  const books = [];
  for (const [isbn, title, author, category, n] of data) {
    books.push(await Book.create({ isbn, title, author, category, totalCopies: n, availableCopies: n }));
  }

  // Issue some books using the same "stored procedure" the app uses
  await Issue.issueBook(books[0]._id, s1._id);
  await Issue.issueBook(books[5]._id, s1._id);
  await Issue.issueBook(books[0]._id, s2._id);
  await Issue.issueBook(books[3]._id, s2._id);
  const old = await Issue.issueBook(books[2]._id, s3._id);

  // Make one issue OVERDUE (due 5 days ago) for the overdue view / fine demo
  await Issue.updateOne({ _id: old._id }, { issueDate: new Date(Date.now() - 19 * DAY), dueDate: new Date(Date.now() - 5 * DAY) });

  // One returned-late record so the Fines report has data
  const late = await Issue.issueBook(books[6]._id, s3._id);
  await Issue.updateOne({ _id: late._id }, { dueDate: new Date(Date.now() - 3 * DAY) });
  await Issue.returnBook(late._id);

  console.log('Seed done ✔');
  console.log('Admin   -> admin@lib.com / admin123');
  console.log('Student -> shahjad@student.com / student123');
  console.log(`(admin id ${admin._id})`);
  await mongoose.disconnect();
}

seed().catch(async (e) => {
  console.error('Seed failed:', e.message);
  await mongoose.disconnect();
  process.exit(1);
});
