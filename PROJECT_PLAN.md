# Library Management System — DBMS Capstone (Plan)

> STATUS: ✅ All parts below are BUILT. See README.md for setup, concept map and viva questions.

Student: MD SHAHJAD | Course: DBMS (ETCCMS304), Units 1–4
Goal: A **moderate, fully working** Library Management System that covers as many DBMS concepts as possible,
easy to explain in viva. Not too fancy. Keep code simple, with `// DBMS CONCEPT:` comments everywhere.

## Stack
- Frontend: plain HTML + CSS + JavaScript (single page with tabs) in `public/`
- Backend: Node.js + Express 4 + MongoDB + Mongoose 8
- Auth: bcryptjs password hashing + simple in-memory token (Authorization: Bearer <token>)

## Already done
- package.json, .env.example
- utils/transaction.js (runTransaction with fallback when no replica set)
- models/AuditLog.js
- models/Book.js (constraints, unique ISBN, text index, optimistic locking, trigger hooks)

## Still to build
1. models/Member.js — name, email (unique, regex), phone (10 digits), password (select:false, hashed in pre('save')),
   role enum ['admin','student']; post('save') hook -> AuditLog MEMBER_ADDED; comparePassword method.
2. models/Issue.js — book (ref Book), member (ref Member), issueDate, dueDate, returnDate, fine (min 0),
   status enum ['ISSUED','RETURNED']. Indexes: {member,status}, {book,status}, and partial unique index
   {book,member} where status='ISSUED' (composite key: same member can't hold same book twice).
   post('save') hook -> AuditLog BOOK_ISSUED / BOOK_RETURNED (pass doc.$session()).
   Statics (= "stored procedures"): issueBook(bookId, memberId) and returnBook(issueId), both inside runTransaction:
   - issue: check member exists, max 3 active books, availableCopies > 0, decrement copies, create Issue.
   - return: set RETURNED + returnDate + fine (₹5/day late), increment copies.
3. middleware/auth.js — auth (token -> member), requireRole('admin')  => RBAC / GRANT-REVOKE idea.
4. middleware/sanitize.js — remove keys starting with `$` or containing `.` from body/query => NoSQL injection prevention.
5. routes:
   - auth: POST /login, POST /register (student), GET /me, POST /logout
   - books: GET / (search via $text, category filter), POST/PUT/DELETE (admin; DELETE blocked if book has active issues
     => referential integrity / ON DELETE RESTRICT), GET /explain?q= (compare IXSCAN vs COLLSCAN using explain()).
   - members (admin): list with active issue count ($lookup), add, delete (blocked if active issues)
   - issues: GET (admin all with populate = JOIN; student only own), POST /issue, POST /:id/return
   - reports: summary (countDocuments), top-books ($group + $lookup + $sort + $limit),
     category-rank ($setWindowFields + $denseRank = window function), overdue (read from MongoDB VIEW
     `overdue_issues` created at startup with viewOn:'issues'), never-issued (EXCEPT / NOT EXISTS via $lookup + size 0),
     fines per member ($group SUM), export-csv (Mongoose cursor, row by row = CURSOR concept)
   - audit (admin): last 50 logs
   - GET /api/system/info -> { transactionsSupported }
6. server.js — connect, detectTransactionSupport, create view, mount routes, error handler
   (ValidationError -> 400, duplicate key 11000 -> 409, VersionError -> 409 "updated by someone else").
7. seed.js — admin@lib.com / admin123, 2 students (password student123), ~8 books, few issues incl. 1 overdue.
8. public/index.html, style.css, app.js — Login/Register, tabs: Dashboard, Books, Members, Issue/Return,
   My Issues, Reports, Audit Log. Each section shows a small "DBMS concept" badge, and a toast after each action
   (e.g. "Transaction committed: book issued").
9. README.md — setup steps (npm install, .env, npm run seed, npm start), and a table mapping
   every DBMS concept (Unit 1–4) to the exact file/feature, plus 15 likely viva questions with short answers.

## DBMS concept coverage checklist
Keys (PK/FK/candidate/composite), integrity constraints, ER + normalization (3NF: Book/Member/Issue separate),
DDL/DML, joins (populate/$lookup), subquery/aggregation, set op (EXCEPT), view, indexing + explain (query optimization),
window function, cursor, transaction + ACID, optimistic locking (concurrency), trigger (hooks), stored procedure (statics),
RBAC/security, injection prevention, NoSQL/CAP/BASE (README theory), cloud DB (MongoDB Atlas).
