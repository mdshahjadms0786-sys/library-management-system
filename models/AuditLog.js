// AuditLog collection - filled automatically by Mongoose hooks (our "TRIGGERS")
const mongoose = require('mongoose');

const auditSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: ['BOOK_ADDED', 'BOOK_DELETED', 'MEMBER_ADDED', 'MEMBER_DELETED', 'BOOK_ISSUED', 'BOOK_RETURNED']
  },
  details: { type: String, required: true },
  at: { type: Date, default: Date.now }
});

auditSchema.index({ at: -1 }); // latest logs first, fast

module.exports = mongoose.model('AuditLog', auditSchema);
