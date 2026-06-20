const fs = require('fs')
const path = require('path')
const mongoose = require('mongoose')
const connectDb = require('../config/db')
const { backfillMissingAttendanceTokens } = require('../services/attendanceTokenBackfillService')

const environmentPath = fs.existsSync(path.join(process.cwd(), '.env'))
  ? path.join(process.cwd(), '.env')
  : path.join(process.cwd(), 'config.env')

require('dotenv').config({ path: environmentPath })

async function main() {
  await connectDb()

  const result = await backfillMissingAttendanceTokens()

  console.log(`Students checked: ${result.checked}`)
  console.log(`Attendance tokens added: ${result.updated}`)
  console.log(`Students still missing attendanceToken: ${result.remainingMissing}`)

  await mongoose.disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await mongoose.disconnect().catch(() => {})
  process.exit(1)
})
