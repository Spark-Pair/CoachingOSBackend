const Student = require('../models/Student')
const { generateAttendanceToken } = require('../utils/attendanceToken')

const missingTokenFilter = {
  $or: [
    { attendanceToken: { $exists: false } },
    { attendanceToken: null },
    { attendanceToken: '' },
  ],
}

async function assignMissingAttendanceToken(studentId) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const result = await Student.updateOne(
        { _id: studentId, ...missingTokenFilter },
        { $set: { attendanceToken: generateAttendanceToken() } },
      )
      return result.modifiedCount
    } catch (error) {
      if (error.code !== 11000 || attempt === 4) throw error
    }
  }

  return 0
}

async function backfillMissingAttendanceTokens() {
  const students = await Student.find(missingTokenFilter).select('_id').lean()
  let updated = 0

  for (const student of students) {
    updated += await assignMissingAttendanceToken(student._id)
  }

  const remainingMissing = await Student.countDocuments(missingTokenFilter)
  const total = await Student.countDocuments({})

  return {
    checked: total,
    updated,
    remainingMissing,
  }
}

module.exports = {
  backfillMissingAttendanceTokens,
  missingTokenFilter,
}
