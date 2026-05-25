const mongoose = require('mongoose')

const classSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    sortOrder: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active',
    },
  },
  { timestamps: true },
)

classSchema.index({ sortOrder: 1, name: 1 })

module.exports = mongoose.model('Class', classSchema)
