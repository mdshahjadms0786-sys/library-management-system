# 📚 Library Management System — DBMS Capstone Project

**Student:** MD SHAHJAD (2501010169) · **Course:** Database Management System (ETCCMS304), Units 1–4
**Tech:** HTML + CSS + JavaScript (frontend) · Node.js + Express (backend) · MongoDB + Mongoose (database)

---

## 1. How to run (setup)

1. Install **Node.js** (v18+) → https://nodejs.org
2. Get MongoDB — choose ONE:
   - **MongoDB Atlas (recommended, free):** create a free cluster → copy the connection string.
     Real ACID transactions work here (Atlas runs a replica set).
   - **Local MongoDB Community Server:** `mongodb://127.0.0.1:27017/librarydb`
     (app works fully, but issue/return run without a real transaction — the dashboard shows this.)
3. In this folder, copy `.env.example` to `.env` and put your `MONGO_URI`.
4. Open terminal in this folder and run:
   ```bash
   npm install
   npm run seed      # fills sample books, members, issues
   npm start
   ```
5. Open **http://localhost:3000**

| Login | Email | Password |
|---|---|---|
| Admin | admin@lib.com | admin123 |
| Student | shahjad@student.com | student123 |

---

## 2. Project structure

```
Library-Management-System/
├── server.js              → Express app, DB connection, VIEW creation, error handler
├── seed.js                → sample data
├── models/                → DATABASE SCHEMA (like CREATE TABLE)
│   ├── Book.js            → constraints, indexes, optimistic locking, triggers
│   ├── Member.js          → unique email, password hashing, roles
│   ├── Issue.js           → foreign keys, composite key, STORED PROCEDURES + TRANSACTIONS
│   └── AuditLog.js        → filled automatically by triggers
├── routes/                → API (CRUD, joins, reports)
├── middleware/            → auth.js (RBAC), sanitize.js (injection prevention)
├── utils/transaction.js   → BEGIN / COMMIT / ROLLBACK helper
└── public/                → index.html, style.css, app.js (frontend)
```

### ER Diagram (text form)

```
 MEMBER (1) ─────< ISSUE >───── (1) BOOK
 _id (PK)          _id (PK)          _id (PK)
 name              member (FK)       isbn (Candidate Key, UNIQUE)
 email (UNIQUE)    book   (FK)       title, author
 phone             issueDate         category
 password          dueDate           totalCopies
 role              returnDate        availableCopies
                   fine, status
 Member ↔ Book is MANY-TO-MANY, resolved by the ISSUE collection.
 AUDITLOG (_id, action, details, at) — written by triggers.
```

---

## 3. Where each DBMS concept is used (viva map)

| Unit | Concept | Where in project | How to show in demo |
|---|---|---|---|
| 1 | File system vs DBMS | Whole project uses a DBMS (no files) | — |
| 1 | ER model, entities, relationship, cardinality | Book, Member, Issue (M:N via Issue) | Show ER diagram above |
| 1 | Keys: Primary, Candidate, Foreign, Composite | `_id`, `isbn`/`email` unique, `Issue.book/member` refs, partial unique index `{book, member}` | Issue same book to same student twice → error |
| 1 | Integrity constraints (domain, key, entity, referential) | `required`, `enum`, `min`, `match`, `unique`; delete blocked if book issued | Add book with wrong ISBN; delete an issued book |
| 1 | Normalization (3NF) | Book/Member details not repeated in Issue — only ids | Explain Issue collection |
| 2 | DDL | Mongoose schemas + `syncIndexes()` in seed.js | — |
| 2 | DML (INSERT/UPDATE/DELETE/SELECT) | Books & Members CRUD | Add / Edit / Delete book |
| 2 | DCL (GRANT/REVOKE) | Admin vs Student role (`requireRole`) | Login as student — no admin tabs, API returns 403 |
| 2 | TCL (COMMIT/ROLLBACK) | `utils/transaction.js` | Issue a book → toast "COMMITTED" |
| 2 | Joins | `populate()` in issues, `$lookup` in members & reports | Issue/Return table shows names |
| 2 | Subqueries (correlated) | Members list: `$lookup` with `let` + `$expr` (count per member) | Members "Books Holding" column |
| 2 | Set operation (EXCEPT / NOT EXISTS) | Report "Never Issued" | Reports tab |
| 2 | Views | `overdue_issues` view (server.js) | Reports → Overdue |
| 2 | Indexing | Text index on title/author, composite indexes on Issue | Reports → Query Plan |
| 2 | Window functions | `$setWindowFields` + `$denseRank` | Reports → Rank in Category |
| 2 | GROUP BY / HAVING / aggregates | Top Books, Fines reports, dashboard | Reports tab |
| 2 | CTE (idea) | Aggregation pipeline = step-by-step named stages | Explain any pipeline |
| 3 | Transaction + ACID | `Issue.issueBook` / `returnBook` | Issue / Return book |
| 3 | Transaction states | active → partially committed → committed / aborted (`withTransaction`) | Issue when 0 copies → rolled back |
| 3 | Concurrency control / Optimistic locking | `optimisticConcurrency: true` on Book (`__v`) | VersionError → 409 message |
| 3 | Stored procedures | `Issue.issueBook()`, `Issue.returnBook()` (model statics) | — |
| 3 | Cursors | CSV export reads books row-by-row with `.cursor()` | Reports → Export CSV |
| 3 | Triggers | Mongoose `post('save')` hooks write AuditLog | Audit Log tab after any action |
| 3 | Security: authentication, privileges, RBAC | bcrypt password hash, login token, roles | Login as admin vs student |
| 3 | SQL injection → NoSQL injection | `middleware/sanitize.js` removes `$` keys | Explain `{ "$ne": null }` attack |
| 4 | Query optimization, execution plan | `/api/books/explain` → IXSCAN vs COLLSCAN | Reports → Query Plan |
| 4 | B-tree index | MongoDB indexes are B-tree based | — |
| 4 | NoSQL, document model | MongoDB documents (JSON) | — |
| 4 | CAP / BASE vs ACID | MongoDB = CP by default; we still use ACID transactions for issue/return | Theory |
| 4 | MongoDB CRUD & aggregation | All routes | — |
| 4 | SQL vs NoSQL choice | Flexible docs, but transactions for consistency | Theory |
| 4 | Cloud database | MongoDB Atlas connection | Show `.env` |
| 4 | DB integration with app | Frontend → Express API → Mongoose → MongoDB | Full demo |

---

## 4. Demo flow (5 minutes)

1. Login **admin** → Dashboard (aggregates).
2. Books → add a book with ISBN `12` → **constraint error**. Add correctly → **INSERT** + check Audit Log (**trigger**).
3. Search "database" → **text index**. Reports → Query Plan → compare **IXSCAN vs COLLSCAN**.
4. Issue / Return → issue a book → **transaction committed**, available copies −1.
   Issue the same book to same student again → **composite key** error (rolled back).
5. Return an overdue book → **fine** calculated.
6. Try deleting a book that is issued → **referential integrity** blocks it.
7. Reports → Top Books, Rank (**window fn**), Overdue (**view**), Never Issued (**EXCEPT**), Fines (**HAVING**), Export CSV (**cursor**).
8. Logout → login **student** → only own books visible (**RBAC**).

---

## 5. Likely viva questions (short answers)

1. **What is a transaction?** A group of DB operations that act as one unit — all succeed (COMMIT) or none (ROLLBACK). Book issue = copies −1 + new issue record.
2. **ACID?** Atomicity (all or nothing), Consistency (rules stay valid, e.g. copies never < 0), Isolation (parallel transactions don't disturb each other), Durability (committed data survives crash).
3. **Why does MongoDB need a replica set for transactions?** Multi-document transactions use the replication oplog; Atlas provides a replica set.
4. **Primary vs Candidate key here?** `_id` is primary; `isbn` (books) and `email` (members) are candidate keys (unique).
5. **Foreign key in MongoDB?** `ref` fields in Issue (`book`, `member`); integrity enforced in code (delete blocked).
6. **Which normal form?** 3NF — no repeating groups, no partial or transitive dependency; book & member details live only in their own collections.
7. **populate vs $lookup?** Both join. `populate` is Mongoose (extra queries); `$lookup` is MongoDB aggregation join (server side).
8. **What is a view?** A saved query that stores no data — `overdue_issues` always shows current overdue books.
9. **What does an index do?** Avoids a full collection scan (COLLSCAN) — uses a B-tree to jump to matching keys (IXSCAN). Trade-off: slower writes, extra space.
10. **Trigger in MongoDB?** Mongoose middleware (`post('save')`) runs automatically after save — we use it for the audit log.
11. **Stored procedure equivalent?** Model static methods `issueBook()` / `returnBook()` — reusable logic in one place.
12. **Optimistic vs pessimistic locking?** Optimistic: no lock, check version (`__v`) at save, fail if changed. Pessimistic: lock first, others wait. We use optimistic.
13. **What is a cursor?** Reads results one document at a time — used in CSV export so memory stays low.
14. **How do you prevent injection?** Sanitize input (remove `$` operators), validate types, hash passwords, role checks.
15. **SQL vs NoSQL — why MongoDB here?** Flexible JSON documents, easy with JavaScript; still gives ACID transactions where needed (issue/return).
16. **CAP theorem?** In a network partition you choose Consistency or Availability; MongoDB (default) prefers consistency (CP).
17. **Window function vs GROUP BY?** GROUP BY collapses rows; window function keeps every row and adds a computed value (rank).
