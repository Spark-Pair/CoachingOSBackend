const mongoose = require('mongoose')

const attendanceRecordSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    status: {
      type: String,
      enum: ['Present', 'Absent', 'Leave'],
      required: true,
    },
    markedAt: {
      type: Date,
      default: Date.now,
    },
    markedBy: {
      type: String,
      enum: ['admin', 'teacher'],
      default: 'admin',
    },
  },
  { _id: false },
)

const attendanceDaySchema = new mongoose.Schema(
  {
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: true,
      index: true,
    },
    className: {
      type: String,
      required: true,
      trim: true,
    },
    dayOff: {
      type: Boolean,
      default: false,
    },
    records: [attendanceRecordSchema],
  },
  { timestamps: true },
)

attendanceDaySchema.index({ date: 1, classId: 1 }, { unique: true })

module.exports = mongoose.model('AttendanceDay', attendanceDaySchema)
