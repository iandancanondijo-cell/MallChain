const mongoose = require('mongoose');

const EduInteractionSchema = new mongoose.Schema({
  resourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'EduResource', required: true, index: true },
  userId: { type: String, required: true, index: true },
  type: { type: String, enum: ['view', 'download'], required: true },
  rewardMlpts: { type: Number, required: true },
  authorId: { type: String, required: true, index: true },
}, { timestamps: true });

EduInteractionSchema.index({ resourceId: 1, userId: 1, type: 1 }, { unique: true });
EduInteractionSchema.index({ authorId: 1, createdAt: -1 });

module.exports = mongoose.models.EduInteraction || mongoose.model('EduInteraction', EduInteractionSchema);
