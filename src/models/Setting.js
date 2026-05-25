const mongoose = require('mongoose')

const settingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: 'general',
    },
    coachingName: {
      type: String,
      trim: true,
      required: true,
      default: 'CoachingOS',
    },
  },
  { timestamps: true },
)

module.exports = mongoose.model('Setting', settingSchema)
