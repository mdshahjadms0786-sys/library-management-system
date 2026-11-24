const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const AuditLog = require('./AuditLog');

// DBMS CONCEPT: ENTITY "Member" with constraints (Unit 1 Session 5 & 8)
const memberSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true },
    email: {
      type: String, required: [true, 'Email is required'], unique: true, lowercase: true, trim: true, // KEY CONSTRAINT
      match: [/^\S+@\S+\.\S+$/, 'Invalid email']                                                       // DOMAIN CONSTRAINT
    },
    phone: { type: String, match: [/^[0-9]{10}$/, 'Phone must be 10 digits'] },
    password: { type: String, required: true, minlength: [6, 'Password min 6 chars'], select: false },
    // DBMS CONCEPT: ROLE-BASED ACCESS CONTROL (Unit 3 Session 32)
    role: { type: String, enum: ['admin', 'student'], default: 'student' }
  },
  { timestamps: true }
);

// SECURITY: never store plain password - hash it before saving
memberSchema.pre('save', async function () {
  this.$locals.wasNew = this.isNew;
  if (this.isModified('password')) this.password = await bcrypt.hash(this.password, 10);
});

// TRIGGER (hook): log every new member
memberSchema.post('save', async function (doc) {
  if (doc.$locals.wasNew) {
    await AuditLog.create({ action: 'MEMBER_ADDED', details: `${doc.name} (${doc.role}) registered` });
  }
});
memberSchema.post('findOneAndDelete', async function (doc) {
  if (doc) await AuditLog.create({ action: 'MEMBER_DELETED', details: `${doc.name} deleted` });
});

memberSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model('Member', memberSchema);
