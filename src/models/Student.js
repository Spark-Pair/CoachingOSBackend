const mongoose = require('mongoose')

const studentSchema = new mongoose.Schema(
  {
    rollNo: { type: String, trim: true, required: true },
    name: { type: String, required: true, trim: true },
    parentName: { type: String, trim: true, required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', index: true, required: true },
    className: { type: String, trim: true, required: true },
    monthlyFee: { type: Number, min: 0, required: true },
    joiningDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active',
    },
  },
  { timestamps: true },
)

studentSchema.index({ classId: 1, name: 1 })
studentSchema.index({ rollNo: 1 }, { unique: true })

module.exports = mongoose.model('Student', studentSchema)
