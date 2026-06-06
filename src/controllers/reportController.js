const ExcelJS = require('exceljs')
const mongoose = require('mongoose')
const AttendanceDay = require('../models/AttendanceDay')
const Class = require('../models/Class')
const FeeRecord = require('../models/FeeRecord')
const Student = require('../models/Student')

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MONTH_PATTERN = /^\d{4}-\d{2}$/

function isValidDateInput(value) {
  if (!DATE_PATTERN.test(String(value || ''))) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10)
}

function currentMonthValue() {
  return todayInputValue().slice(0, 7)
}

function isValidMonth(value) {
  if (!MONTH_PATTERN.test(String(value || ''))) return false
  const date = new Date(`${value}-01T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 7) === value
}

function buildDate(value, endOfDay = false) {
  if (!value) return undefined
  const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'
  const date = new Date(`${String(value).slice(0, 10)}${suffix}`)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function toInputDate(value) {
  if (!value) return ''
  return new Date(value).toISOString().slice(0, 10)
}

function parseClassIds(value) {
  return String(value || '')
    .split(',')
    .map((classId) => classId.trim())
    .filter((classId) => mongoose.isValidObjectId(classId))
}

function monthValuesBetween(startMonth, endMonth) {
  const values = []
  const cursor = new Date(`${startMonth}-01T00:00:00.000Z`)
  const end = new Date(`${endMonth}-01T00:00:00.000Z`)
  while (cursor <= end) {
    values.push(cursor.toISOString().slice(0, 7))
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return values
}

function buildStatusFilter(status) {
  return ['Active', 'Inactive'].includes(status) ? status : undefined
}

function styleWorkbook(workbook) {
  workbook.creator = 'CoachingOS'
  workbook.created = new Date()
  workbook.modified = new Date()
}

function addTitle(worksheet, title, columnCount) {
  worksheet.addRow([title])
  worksheet.mergeCells(1, 1, 1, columnCount)
  const titleCell = worksheet.getCell(1, 1)
  titleCell.font = { bold: true, size: 15, color: { argb: 'FF0F172A' } }
  titleCell.alignment = { vertical: 'middle' }
  worksheet.addRow([])
}

function addHeader(worksheet, values) {
  const header = worksheet.addRow(values)
  header.font = { bold: true, color: { argb: 'FF0F172A' } }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7F6F3' } }
  header.eachCell((cell) => {
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } }
  })
}

function finishWorksheet(worksheet, widths) {
  worksheet.columns = widths.map((width) => ({ width }))
  worksheet.views = [{ state: 'frozen', ySplit: 3 }]
  worksheet.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3, column: widths.length },
  }
}

async function buildStudentWorkbook(query) {
  const workbook = new ExcelJS.Workbook()
  styleWorkbook(workbook)
  const worksheet = workbook.addWorksheet('Students')

  const status = buildStatusFilter(query.status)
  const dateFrom = buildDate(query.dateFrom)
  const dateTo = buildDate(query.dateTo, true)
  const classIds = parseClassIds(query.classIds)
  const joiningDate = {}
  if (dateFrom) joiningDate.$gte = dateFrom
  if (dateTo) joiningDate.$lte = dateTo

  const students = await Student.find({
    ...(status ? { status } : {}),
    ...(classIds.length ? { classId: { $in: classIds } } : {}),
    ...(Object.keys(joiningDate).length ? { joiningDate } : {}),
  }).sort({ className: 1, name: 1 }).lean()

  addTitle(worksheet, 'Student Directory Report', 8)
  addHeader(worksheet, ['Roll No', 'Student Name', 'Parent Name', 'Phone', 'Class', 'Monthly Fee', 'Joining Date', 'Status'])
  students.forEach((student) => {
    worksheet.addRow([
      student.rollNo,
      student.name,
      student.parentName,
      student.phone || '',
      student.className,
      Number(student.monthlyFee || 0),
      toInputDate(student.joiningDate),
      student.status,
    ])
  })
  finishWorksheet(worksheet, [16, 26, 26, 18, 18, 14, 16, 14])
  return workbook
}

async function buildDailyAttendanceWorkbook(type, query) {
  const date = String(query.date || todayInputValue())
  if (!isValidDateInput(date) || date > todayInputValue()) {
    const error = new Error('A valid attendance date up to today is required.')
    error.status = 400
    throw error
  }

  const classIds = parseClassIds(query.classIds)
  const classFilter = classIds.length ? { classId: { $in: classIds } } : {}
  const [students, attendanceDays] = await Promise.all([
    Student.find({
      status: 'Active',
      joiningDate: { $lte: buildDate(date, true) },
      ...classFilter,
    }).sort({ className: 1, name: 1 }).lean(),
    AttendanceDay.find({ date, ...classFilter }).lean(),
  ])

  const daysByClass = new Map(attendanceDays.map((day) => [day.classId.toString(), day]))
  const wantedStatus = type === 'present' ? 'Present' : 'Absent'
  const rows = students.filter((student) => {
    const day = daysByClass.get(student.classId.toString())
    if (day?.dayOff) return false
    const record = day?.records.find((item) => item.studentId.toString() === student._id.toString())
    const status = record?.status || 'Absent'
    return status === wantedStatus
  })

  const workbook = new ExcelJS.Workbook()
  styleWorkbook(workbook)
  const worksheet = workbook.addWorksheet(type === 'present' ? 'Present Students' : 'Absentees')
  addTitle(worksheet, `${type === 'present' ? 'Present Students' : 'Absentees'} - ${date}`, 5)
  addHeader(worksheet, ['Student Name', 'Parent Name', 'Roll No', 'Class', 'Phone'])
  rows.forEach((student) => {
    worksheet.addRow([student.name, student.parentName, student.rollNo, student.className, student.phone || ''])
  })
  finishWorksheet(worksheet, [26, 26, 16, 18, 18])
  return workbook
}

function dateValuesBetween(dateFrom, dateTo) {
  const values = []
  const cursor = buildDate(dateFrom)
  const end = buildDate(dateTo)
  while (cursor <= end) {
    values.push(toInputDate(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return values
}

async function buildStudentAttendanceWorkbook(query) {
  const studentId = String(query.studentId || '')
  const dateFrom = String(query.dateFrom || '')
  const dateTo = String(query.dateTo || '')
  if (!mongoose.isValidObjectId(studentId)) {
    const error = new Error('A student is required.')
    error.status = 400
    throw error
  }
  if (!isValidDateInput(dateFrom) || !isValidDateInput(dateTo) || dateFrom > dateTo || dateTo > todayInputValue()) {
    const error = new Error('A valid date range up to today is required.')
    error.status = 400
    throw error
  }

  const student = await Student.findById(studentId).lean()
  if (!student) {
    const error = new Error('Student not found.')
    error.status = 404
    throw error
  }

  const effectiveFrom = dateFrom < toInputDate(student.joiningDate) ? toInputDate(student.joiningDate) : dateFrom
  const dates = effectiveFrom > dateTo ? [] : dateValuesBetween(effectiveFrom, dateTo)
  const attendanceDays = await AttendanceDay.find({
    classId: student.classId,
    date: { $gte: effectiveFrom, $lte: dateTo },
  }).lean()
  const daysByDate = new Map(attendanceDays.map((day) => [day.date, day]))

  const workbook = new ExcelJS.Workbook()
  styleWorkbook(workbook)
  const worksheet = workbook.addWorksheet('Student Attendance')
  addTitle(worksheet, `${student.name} Attendance Report`, 3)
  addHeader(worksheet, ['Date', 'Status', 'Class'])
  dates.forEach((date) => {
    const day = daysByDate.get(date)
    const record = day?.records.find((item) => item.studentId.toString() === student._id.toString())
    worksheet.addRow([date, day?.dayOff ? 'Day Off' : record?.status || 'Absent', student.className])
  })
  finishWorksheet(worksheet, [16, 16, 20])
  return workbook
}

async function buildClassesWorkbook() {
  const [classes, studentCounts] = await Promise.all([
    Class.find({}).sort({ name: 1 }).lean(),
    Student.aggregate([
      {
        $group: {
          _id: '$classId',
          totalStudents: { $sum: 1 },
          activeStudents: { $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] } },
          inactiveStudents: { $sum: { $cond: [{ $eq: ['$status', 'Inactive'] }, 1, 0] } },
        },
      },
    ]),
  ])
  const countsByClass = new Map(studentCounts.map((item) => [item._id.toString(), item]))

  const workbook = new ExcelJS.Workbook()
  styleWorkbook(workbook)
  const worksheet = workbook.addWorksheet('Classes')
  addTitle(worksheet, 'Classes Report', 5)
  addHeader(worksheet, ['Class', 'Status', 'Total Students', 'Active Students', 'Inactive Students'])
  classes.forEach((classItem) => {
    const counts = countsByClass.get(classItem._id.toString())
    worksheet.addRow([
      classItem.name,
      classItem.status,
      counts?.totalStudents || 0,
      counts?.activeStudents || 0,
      counts?.inactiveStudents || 0,
    ])
  })
  finishWorksheet(worksheet, [24, 14, 16, 16, 18])
  return workbook
}

async function getStudentOrFail(studentId) {
  if (!mongoose.isValidObjectId(studentId)) {
    const error = new Error('A student is required.')
    error.status = 400
    throw error
  }
  const student = await Student.findById(studentId).lean()
  if (!student) {
    const error = new Error('Student not found.')
    error.status = 404
    throw error
  }
  return student
}

async function buildStudentFeeLedgerWorkbook(query) {
  const student = await getStudentOrFail(String(query.studentId || ''))
  const joiningMonth = toInputDate(student.joiningDate).slice(0, 7)
  const monthFrom = String(query.monthFrom || joiningMonth)
  const monthTo = String(query.monthTo || currentMonthValue())
  if (!isValidMonth(monthFrom) || !isValidMonth(monthTo) || monthFrom > monthTo || monthTo > currentMonthValue()) {
    const error = new Error('A valid month range up to the current month is required.')
    error.status = 400
    throw error
  }

  const effectiveFrom = monthFrom < joiningMonth ? joiningMonth : monthFrom
  const months = effectiveFrom > monthTo ? [] : monthValuesBetween(effectiveFrom, monthTo)
  const records = await FeeRecord.find({
    studentId: student._id,
    month: { $gte: effectiveFrom, $lte: monthTo },
  }).lean()
  const recordsByMonth = new Map(records.map((record) => [record.month, record]))

  const workbook = new ExcelJS.Workbook()
  styleWorkbook(workbook)
  const worksheet = workbook.addWorksheet('Fee Ledger')
  addTitle(worksheet, `${student.name} Fee Ledger`, 5)
  addHeader(worksheet, ['Month', 'Status', 'Amount', 'Paid Date', 'Class'])
  months.forEach((month) => {
    const record = recordsByMonth.get(month)
    worksheet.addRow([
      month,
      record ? 'Paid' : 'Unpaid',
      Number(record?.amount ?? student.monthlyFee ?? 0),
      record ? toInputDate(record.paidDate) : '',
      record?.className || student.className,
    ])
  })
  finishWorksheet(worksheet, [16, 14, 14, 16, 20])
  return workbook
}

async function buildMonthlyFeeWorkbook(query) {
  const month = String(query.month || currentMonthValue())
  if (!isValidMonth(month) || month > currentMonthValue()) {
    const error = new Error('A valid month up to the current month is required.')
    error.status = 400
    throw error
  }

  const classIds = parseClassIds(query.classIds)
  const monthEnd = new Date(`${month}-01T00:00:00.000Z`)
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1)
  monthEnd.setUTCMilliseconds(-1)
  const studentFilter = {
    joiningDate: { $lte: monthEnd },
    ...(classIds.length ? { classId: { $in: classIds } } : {}),
  }
  const [students, records] = await Promise.all([
    Student.find(studentFilter).sort({ className: 1, name: 1 }).lean(),
    FeeRecord.find({
      month,
      ...(classIds.length ? { classId: { $in: classIds } } : {}),
    }).lean(),
  ])
  const recordsByStudent = new Map(records.map((record) => [record.studentId.toString(), record]))

  const workbook = new ExcelJS.Workbook()
  styleWorkbook(workbook)
  const worksheet = workbook.addWorksheet('Monthly Fees')
  addTitle(worksheet, `Fee Report - ${month}`, 8)
  addHeader(worksheet, ['Student Name', 'Parent Name', 'Phone', 'Roll No', 'Class', 'Status', 'Amount', 'Paid Date'])
  students.forEach((student) => {
    const record = recordsByStudent.get(student._id.toString())
    worksheet.addRow([
      student.name,
      student.parentName,
      student.phone || '',
      student.rollNo,
      student.className,
      record ? 'Paid' : 'Unpaid',
      Number(record?.amount ?? student.monthlyFee ?? 0),
      record ? toInputDate(record.paidDate) : '',
    ])
  })
  finishWorksheet(worksheet, [26, 26, 18, 16, 18, 14, 14, 16])
  return workbook
}

async function buildUnpaidInstallmentsWorkbook() {
  const students = await Student.find({}).sort({ className: 1, name: 1 }).lean()
  const records = await FeeRecord.find({ month: { $lte: currentMonthValue() } }).select('studentId month').lean()
  const paidKeys = new Set(records.map((record) => `${record.studentId}:${record.month}`))

  const workbook = new ExcelJS.Workbook()
  styleWorkbook(workbook)
  const worksheet = workbook.addWorksheet('Unpaid Installments')
  addTitle(worksheet, 'All Unpaid Installments Report', 8)
  addHeader(worksheet, ['Student Name', 'Parent Name', 'Phone', 'Roll No', 'Class', 'Month', 'Amount Due', 'Student Status'])
  students.forEach((student) => {
    const joiningMonth = toInputDate(student.joiningDate).slice(0, 7)
    monthValuesBetween(joiningMonth, currentMonthValue()).forEach((month) => {
      if (!paidKeys.has(`${student._id}:${month}`)) {
        worksheet.addRow([
          student.name,
          student.parentName,
          student.phone || '',
          student.rollNo,
          student.className,
          month,
          Number(student.monthlyFee || 0),
          student.status,
        ])
      }
    })
  })
  finishWorksheet(worksheet, [26, 26, 18, 16, 18, 16, 14, 16])
  return workbook
}

async function sendWorkbook(res, workbook, fileName) {
  const buffer = await workbook.xlsx.writeBuffer()
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
  return res.send(Buffer.from(buffer))
}

async function downloadStudentReport(req, res) {
  const type = String(req.params.type || '').trim()
  if (type !== 'student-directory') {
    return res.status(404).json({ message: 'Report not found.' })
  }
  const workbook = await buildStudentWorkbook(req.query)
  return sendWorkbook(res, workbook, `${type}-${todayInputValue()}.xlsx`)
}

async function downloadAttendanceReport(req, res) {
  const type = String(req.params.type || '').trim()
  if (!['absentees', 'present', 'student-attendance'].includes(type)) {
    return res.status(404).json({ message: 'Report not found.' })
  }

  try {
    const workbook = type === 'student-attendance'
      ? await buildStudentAttendanceWorkbook(req.query)
      : await buildDailyAttendanceWorkbook(type, req.query)
    return sendWorkbook(res, workbook, `${type}-${todayInputValue()}.xlsx`)
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message })
    throw error
  }
}

async function downloadClassesReport(req, res) {
  const workbook = await buildClassesWorkbook()
  return sendWorkbook(res, workbook, `classes-${todayInputValue()}.xlsx`)
}

async function downloadFeeReport(req, res) {
  const type = String(req.params.type || '').trim()
  if (!['student-ledger', 'monthly-fees', 'unpaid-installments'].includes(type)) {
    return res.status(404).json({ message: 'Report not found.' })
  }

  try {
    let workbook
    if (type === 'student-ledger') workbook = await buildStudentFeeLedgerWorkbook(req.query)
    if (type === 'monthly-fees') workbook = await buildMonthlyFeeWorkbook(req.query)
    if (type === 'unpaid-installments') workbook = await buildUnpaidInstallmentsWorkbook()
    return sendWorkbook(res, workbook, `${type}-${todayInputValue()}.xlsx`)
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message })
    throw error
  }
}

module.exports = {
  downloadAttendanceReport,
  downloadClassesReport,
  downloadFeeReport,
  downloadStudentReport,
}
