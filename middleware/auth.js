// DBMS CONCEPT: AUTHENTICATION + AUTHORIZATION / RBAC (Unit 3 Session 32)
// Authentication = who are you? (login)   Authorization = what are you allowed to do? (role)
// requireRole('admin') works like GRANT: only admin has write privileges.
const crypto = require('crypto');
const Member = require('../models/Member');

const sessions = new Map(); // token -> memberId (simple in-memory session store)

function createToken(memberId) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, String(memberId));
  return token;
}

function destroyToken(token) {
  sessions.delete(token);
}

async function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const memberId = sessions.get(token);
  if (!memberId) return res.status(401).json({ error: 'Please login first' });
  try {
    const user = await Member.findById(memberId);
    if (!user) return res.status(401).json({ error: 'User no longer exists' });
    req.user = user;
    req.token = token;
    next();
  } catch (e) {
    next(e);
  }
}

const requireRole = (role) => (req, res, next) =>
  req.user.role === role ? next() : res.status(403).json({ error: `Access denied: only ${role} can do this` });

module.exports = { auth, requireRole, createToken, destroyToken };
