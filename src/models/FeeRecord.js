const mongoose = require('mongoose')

const feeRecordSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', index: true, required: true },
    studentName: { type: String, trim: true, required: true },
    rollNo: { type: String, trim: true, required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', index: true, required: true },
    className: { type: String, trim: true, required: true },
    month: { type: String, match: /^\d{4}-\d{2}$/, required: true },
    amount: { type: Number, min: 0, required: true },
    paidDate: { type: Date, required: true },
  },
  { timestamps: true },
)

feeRecordSchema.index({ studentId: 1, month: 1 }, { unique: true })
feeRecordSchema.index({ paidDate: -1 })

module.exports = mongoose.model('FeeRecord', feeRecordSchema)
