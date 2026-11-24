// DBMS CONCEPT: TRANSACTION + ACID (Unit 3, Session 25)
// All steps inside `work` either COMMIT together or ROLLBACK together (Atomicity).
// MongoDB needs a replica set for transactions (MongoDB Atlas has one by default).
// On a plain local MongoDB we fall back to running the steps without a transaction,
// so the app still works for practice.
const mongoose = require('mongoose');

let transactionsSupported = false;

async function detectTransactionSupport() {
  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    transactionsSupported = Boolean(hello.setName || hello.msg === 'isdbgrid');
  } catch {
    transactionsSupported = false;
  }
  return transactionsSupported;
}

async function runTransaction(work) {
  if (!transactionsSupported) return work(null); // fallback: no session

  const session = await mongoose.startSession();
  try {
    let result;
    // withTransaction = BEGIN ... COMMIT, and automatic ROLLBACK (abort) on any error
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = { runTransaction, detectTransactionSupport, isSupported: () => transactionsSupported };
