const mongoose = require('mongoose')

const classSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active',
    },
  },
  { timestamps: true },
)

classSchema.index({ name: 1 })

module.exports = mongoose.model('Class', classSchema)
