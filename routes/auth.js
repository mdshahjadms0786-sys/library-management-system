const router = require('express').Router();
const Member = require('../models/Member');
const { auth, createToken, destroyToken } = require('../middleware/auth');

const publicUser = (m) => ({ id: m._id, name: m.name, email: m.email, role: m.role });

// LOGIN (Authentication)
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password required' });
  }
  const user = await Member.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ error: 'Wrong email or password' });
  }
  res.json({ token: createToken(user._id), user: publicUser(user) });
});

// REGISTER (students only - nobody can make themselves admin)
router.post('/register', async (req, res) => {
  const { name, email, phone, password } = req.body;
  const user = await Member.create({ name, email, phone: phone || undefined, password, role: 'student' });
  res.status(201).json({ token: createToken(user._id), user: publicUser(user) });
});

router.get('/me', auth, (req, res) => res.json(publicUser(req.user)));

router.post('/logout', auth, (req, res) => {
  destroyToken(req.token);
  res.json({ message: 'Logged out' });
});

module.exports = router;
