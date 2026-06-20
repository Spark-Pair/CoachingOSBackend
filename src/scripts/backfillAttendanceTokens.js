const fs = require('fs')
const path = require('path')
const mongoose = require('mongoose')
const connectDb = require('../config/db')
const Student = require('../models/Student')
const { generateAttendanceToken } = require('../utils/attendanceToken')

const environmentPath = fs.existsSync(path.join(process.cwd(), '.env'))
  ? path.join(process.cwd(), '.env')
  : path.join(process.cwd(), 'config.env')

require('dotenv').config({ path: environmentPath })

const missingTokenFilter = {
  $or: [
    { attendanceToken: { $exists: false } },
    { attendanceToken: null },
    { attendanceToken: '' },
  ],
}

async function assignToken(studentId) {
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

async function main() {
  await connectDb()

  const students = await Student.find(missingTokenFilter).select('_id').lean()
  let updated = 0

  for (const student of students) {
    updated += await assignToken(student._id)
  }

  const remainingMissing = await Student.countDocuments(missingTokenFilter)
  const total = await Student.countDocuments({})

  console.log(`Students checked: ${total}`)
  console.log(`Attendance tokens added: ${updated}`)
  console.log(`Students still missing attendanceToken: ${remainingMissing}`)

  await mongoose.disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})
