const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const BadgeDesignSchema = new Schema({
  imageUrl: { type: String, required: true },
  originalName: { type: String },
  month: { type: Number, required: true },
  year: { type: Number, required: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  active: { type: Boolean, default: true },
}, { timestamps: true });

BadgeDesignSchema.index({ year: -1, month: -1 });
BadgeDesignSchema.index({ active: 1 });

module.exports = mongoose.models.BadgeDesign || mongoose.model('BadgeDesign', BadgeDesignSchema);
