const mongoose = require('mongoose')
const FeeRecord = require('../models/FeeRecord')
const Student = require('../models/Student')

const FEE_PAGE_SIZE = 30

function getPage(value) {
  const page = Number.parseInt(value, 10)
  return Number.isInteger(page) && page > 0 ? page : 1
}

function buildDate(value) {
  if (!value) return undefined
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? undefined : date
}

function toInputDate(date) {
  return new Date(date).toISOString().slice(0, 10)
}

function toMonthValue(date) {
  return new Date(date).toISOString().slice(0, 7)
}

function isValidMonth(value) {
  if (!/^\d{4}-\d{2}$/.test(String(value || ''))) return false
  const date = new Date(`${value}-01T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 7) === value
}

function monthValuesBetween(startDate, endDate = new Date()) {
  const start = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1))
  const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1))
  const months = []

  while (start <= end) {
    months.push(start.toISOString().slice(0, 7))
    start.setUTCMonth(start.getUTCMonth() + 1)
  }

  return months
}

function serializeRecord(record) {
  return {
    ...record,
    id: record._id,
    studentId: record.studentId,
    classId: record.classId,
    paidDate: toInputDate(record.paidDate),
  }
}

async function listFees(req, res) {
  const page = getPage(req.query.page)
  const studentId = String(req.query.studentId || '').trim()
  const classId = String(req.query.classId || '').trim()
  const dateFrom = buildDate(req.query.dateFrom)
  const dateTo = buildDate(req.query.dateTo)

  const paidDate = {}
  if (dateFrom) paidDate.$gte = dateFrom
  if (dateTo) paidDate.$lte = dateTo

  const filter = {
    ...(studentId && mongoose.isValidObjectId(studentId) ? { studentId } : {}),
    ...(classId && mongoose.isValidObjectId(classId) ? { classId } : {}),
    ...(Object.keys(paidDate).length ? { paidDate } : {}),
  }

  const [total, records, summaryRecords] = await Promise.all([
    FeeRecord.countDocuments(filter),
    FeeRecord.find(filter)
      .sort({ paidDate: -1, createdAt: -1 })
      .skip((page - 1) * FEE_PAGE_SIZE)
      .limit(FEE_PAGE_SIZE)
      .lean(),
    FeeRecord.find(filter).select('amount paidDate').sort({ paidDate: -1 }).lean(),
  ])

  const collected = summaryRecords.reduce((sum, record) => sum + record.amount, 0)
  const latestPaid = summaryRecords[0]?.paidDate ? toInputDate(summaryRecords[0].paidDate) : ''

  return res.json({
    data: records.map(serializeRecord),
    pagination: {
      page,
      pageSize: FEE_PAGE_SIZE,
      total,
      pages: Math.max(1, Math.ceil(total / FEE_PAGE_SIZE)),
    },
    summary: {
      collected,
      paidRecords: summaryRecords.length,
      averagePaid: summaryRecords.length ? Math.round(collected / summaryRecords.length) : 0,
      latestPaid,
    },
  })
}

async function getStudentUnpaidMonths(req, res) {
  const studentId = String(req.params.studentId || '').trim()
  if (!mongoose.isValidObjectId(studentId)) {
    return res.status(404).json({ message: 'Student not found.' })
  }

  const student = await Student.findById(studentId).select('_id name rollNo classId className monthlyFee joiningDate status').lean()
  if (!student) {
    return res.status(404).json({ message: 'Student not found.' })
  }

  const paidRecords = await FeeRecord.find({ studentId: student._id }).select('month').lean()
  const paidMonths = new Set(paidRecords.map((record) => record.month))
  const joiningDate = new Date(student.joiningDate)
  const unpaidMonths = monthValuesBetween(joiningDate).filter((month) => !paidMonths.has(month))

  return res.json({
    student: { ...student, id: student._id },
    amount: student.monthlyFee,
    unpaidMonths,
  })
}

async function createFeeRecord(req, res) {
  const studentId = String(req.body.studentId || '').trim()
  const month = String(req.body.month || '').trim()
  const paidDate = buildDate(req.body.paidDate) || new Date()

  if (!mongoose.isValidObjectId(studentId) || !isValidMonth(month)) {
    return res.status(400).json({ message: 'A valid student and unpaid month are required.' })
  }

  const student = await Student.findById(studentId).select('_id name rollNo classId className monthlyFee joiningDate status').lean()
  if (!student) {
    return res.status(404).json({ message: 'Student not found.' })
  }

  const dueMonths = monthValuesBetween(new Date(student.joiningDate))
  if (!dueMonths.includes(month)) {
    return res.status(400).json({ message: 'Selected month is not due for this student.' })
  }

  try {
    const record = await FeeRecord.create({
      studentId: student._id,
      studentName: student.name,
      rollNo: student.rollNo,
      classId: student.classId,
      className: student.className,
      month,
      amount: student.monthlyFee,
      paidDate,
    })

    return res.status(201).json(serializeRecord(record.toObject()))
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Fees for this month are already paid.' })
    }
    throw error
  }
}

async function deleteFeeRecord(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: 'Fee record not found.' })
  }

  const record = await FeeRecord.findByIdAndDelete(req.params.id)
  if (!record) {
    return res.status(404).json({ message: 'Fee record not found.' })
  }

  return res.json({ id: record._id })
}

module.exports = {
  createFeeRecord,
  deleteFeeRecord,
  getStudentUnpaidMonths,
  listFees,
}
