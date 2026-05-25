const mongoose = require('mongoose')

const studentSchema = new mongoose.Schema(
  {
    rollNo: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    parentName: { type: String, trim: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', index: true },
    className: { type: String, trim: true },
    monthlyFee: { type: Number, min: 0, default: 0 },
    joiningDate: { type: Date },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active',
    },
  },
  { timestamps: true },
)

studentSchema.index({ classId: 1, name: 1 })

module.exports = mongoose.model('Student', studentSchema)
