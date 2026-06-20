const mongoose = require('mongoose')
const AttendanceDay = require('../models/AttendanceDay')
const Class = require('../models/Class')
const Student = require('../models/Student')
const { getPakistanDateKey, isValidDateKey } = require('../utils/date')

const validStatuses = ['Present', 'Absent', 'Leave']

function isValidDateInput(value) {
  return isValidDateKey(value)
}

function todayInputValue() {
  return getPakistanDateKey()
}

function parseScanPayload(value) {
  const raw = String(value || '').trim()
  if (!raw) return { token: '', legacyCode: '' }

  try {
    const payload = JSON.parse(raw)
    if (payload?.type === 'coachingos_attendance') {
      return { token: String(payload.token || '').trim(), legacyCode: '' }
    }
    if (payload?.token) {
      return { token: String(payload.token || '').trim(), legacyCode: '' }
    }
  } catch {
    // Plain tokens are also accepted for scanner compatibility.
  }

  return { token: raw, legacyCode: raw }
}

function getRequestAudit(req) {
  return {
    source: req.auth ? 'admin_scan' : 'public_scan',
    ip: String(req.ip || req.socket?.remoteAddress || '').slice(0, 120),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
    scannedAt: new Date(),
  }
}

function validateAttendanceQuery(date, classId) {
  if (!isValidDateInput(date)) {
    return 'A valid attendance date is required.'
  }
  if (date > todayInputValue()) {
    return 'Future dates cannot be selected for attendance.'
  }
  if (!mongoose.isValidObjectId(classId)) {
    return 'A valid class is required.'
  }
  return ''
}

async function getClassOrFail(classId, res) {
  const classItem = await Class.findById(classId).select('name status').lean()
  if (!classItem) {
    res.status(404).json({ message: 'Class not found.' })
    return null
  }
  return classItem
}

async function getOrCreateAttendanceDay(date, classItem) {
  return AttendanceDay.findOneAndUpdate(
    { date, classId: classItem._id },
    { $setOnInsert: { date, classId: classItem._id, className: classItem.name, records: [] } },
    { new: true, upsert: true },
  ).lean()
}

function summarize(records, students, dayOff) {
  if (dayOff) {
    return { present: 0, absent: 0, leave: 0, total: 0, marked: false, dayOff: true }
  }

  const statuses = students.map((student) => records.get(student._id.toString()) || 'Absent')
  return {
    present: statuses.filter((status) => status === 'Present').length,
    absent: statuses.filter((status) => status === 'Absent').length,
    leave: statuses.filter((status) => status === 'Leave').length,
    total: students.length,
    marked: records.size > 0,
    dayOff: false,
  }
}

async function getAttendance(req, res) {
  const date = String(req.query.date || '')
  const classId = String(req.query.classId || '')
  const validationMessage = validateAttendanceQuery(date, classId)
  if (validationMessage) {
    return res.status(400).json({ message: validationMessage })
  }

  const classItem = await getClassOrFail(classId, res)
  if (!classItem) return null

  const [attendanceDay, students] = await Promise.all([
    getOrCreateAttendanceDay(date, classItem),
    Student.find({ classId, status: 'Active' }).sort({ name: 1 }).lean(),
  ])
  const recordMap = new Map(attendanceDay.records.map((record) => [record.studentId.toString(), record.status]))

  return res.json({
    date,
    class: { id: classItem._id, name: classItem.name },
    dayOff: attendanceDay.dayOff,
    marked: attendanceDay.dayOff || recordMap.size > 0,
    summary: summarize(recordMap, students, attendanceDay.dayOff),
    students: attendanceDay.dayOff ? [] : students.map((student) => ({
      ...student,
      id: student._id,
      attendanceStatus: recordMap.get(student._id.toString()) || 'Absent',
    })),
  })
}

async function setDayOff(req, res) {
  const date = String(req.body.date || '')
  const classId = String(req.body.classId || '')
  const dayOff = Boolean(req.body.dayOff)
  const validationMessage = validateAttendanceQuery(date, classId)
  if (validationMessage) {
    return res.status(400).json({ message: validationMessage })
  }

  const classItem = await getClassOrFail(classId, res)
  if (!classItem) return null

  const attendanceDay = await AttendanceDay.findOneAndUpdate(
    { date, classId: classItem._id },
    {
      $set: {
        date,
        classId: classItem._id,
        className: classItem.name,
        dayOff,
        ...(dayOff ? { records: [] } : {}),
      },
    },
    { new: true, upsert: true, runValidators: true },
  )

  return res.json({ date, class: { id: classItem._id, name: classItem.name }, dayOff: attendanceDay.dayOff })
}

async function updateAttendanceRecord(req, res) {
  const date = String(req.body.date || '')
  const classId = String(req.body.classId || '')
  const studentId = String(req.params.studentId || '')
  const status = String(req.body.status || '')
  const validationMessage = validateAttendanceQuery(date, classId)
  if (validationMessage) {
    return res.status(400).json({ message: validationMessage })
  }
  if (!mongoose.isValidObjectId(studentId) || !validStatuses.includes(status)) {
    return res.status(400).json({ message: 'A valid student and attendance status are required.' })
  }

  const classItem = await getClassOrFail(classId, res)
  if (!classItem) return null

  const student = await Student.findOne({ _id: studentId, classId }).select('_id').lean()
  if (!student) {
    return res.status(404).json({ message: 'Student not found in selected class.' })
  }

  const attendanceDay = await AttendanceDay.findOneAndUpdate(
    { date, classId: classItem._id },
    { $setOnInsert: { date, classId: classItem._id, className: classItem.name, records: [] } },
    { new: true, upsert: true },
  )
  if (attendanceDay.dayOff) {
    return res.status(400).json({ message: 'This class is marked as day-off for the selected date.' })
  }

  const existingRecord = attendanceDay.records.find((record) => record.studentId.toString() === studentId)
  if (existingRecord) {
    existingRecord.status = status
    existingRecord.markedAt = new Date()
    existingRecord.markedBy = 'admin'
  } else {
    attendanceDay.records.push({ studentId, status, markedBy: 'admin' })
  }
  await attendanceDay.save()

  return res.json({ studentId, status })
}

async function deleteAttendance(req, res) {
  const date = String(req.query.date || '')
  const classId = String(req.query.classId || '')
  const validationMessage = validateAttendanceQuery(date, classId)
  if (validationMessage) {
    return res.status(400).json({ message: validationMessage })
  }

  const attendanceDay = await AttendanceDay.findOneAndDelete({ date, classId })
  if (!attendanceDay) {
    return res.status(404).json({ message: 'Attendance record not found.' })
  }

  return res.json({ id: attendanceDay._id, date, classId })
}

async function scanAttendance(req, res) {
  const code = String(req.body.code || req.body.token || '').trim()
  const { token, legacyCode } = parseScanPayload(code)
  const date = String(req.body.date || todayInputValue())
  const classId = String(req.body.classId || '').trim()
  const markedBy = req.auth ? 'admin' : 'teacher'
  const effectiveDate = markedBy === 'teacher' ? todayInputValue() : date
  const allowLegacyRollNo = process.env.ALLOW_LEGACY_ROLLNO_SCAN === 'true'

  if (!token) {
    return res.status(400).json({ message: 'Scan code is required.' })
  }
  if (!isValidDateInput(effectiveDate) || effectiveDate > todayInputValue()) {
    return res.status(400).json({ message: 'Future dates cannot be selected for attendance.' })
  }

  const studentFilter = {
    status: 'Active',
    $or: [
      { attendanceToken: token },
      ...(allowLegacyRollNo ? [{ rollNo: legacyCode }, ...(mongoose.isValidObjectId(legacyCode) ? [{ _id: legacyCode }] : [])] : []),
    ],
    ...(classId && mongoose.isValidObjectId(classId) ? { classId } : {}),
  }
  const student = await Student.findOne(studentFilter).lean()
  if (!student) {
    return res.status(404).json({ message: 'Student QR was not found.' })
  }

  const classItem = await Class.findById(student.classId).select('name status')
  if (!classItem) {
    return res.status(404).json({ message: 'Student class was not found.' })
  }

  const attendanceDay = await AttendanceDay.findOneAndUpdate(
    { date: effectiveDate, classId: classItem._id },
    { $setOnInsert: { date: effectiveDate, classId: classItem._id, className: classItem.name, records: [] } },
    { new: true, upsert: true },
  )
  if (attendanceDay.dayOff) {
    return res.status(400).json({ message: `${classItem.name} is marked as day-off today.` })
  }

  const existingRecord = attendanceDay.records.find((record) => record.studentId.toString() === student._id.toString())
  const alreadyMarked = Boolean(existingRecord?.status === 'Present')
  const audit = getRequestAudit(req)
  if (existingRecord) {
    existingRecord.status = 'Present'
    existingRecord.markedAt = new Date()
    existingRecord.markedBy = markedBy
    existingRecord.source = audit.source
    existingRecord.ip = audit.ip
    existingRecord.userAgent = audit.userAgent
    existingRecord.scannedAt = audit.scannedAt
  } else {
    attendanceDay.records.push({
      studentId: student._id,
      status: 'Present',
      markedBy,
      ...audit,
    })
  }
  await attendanceDay.save()

  return res.json({
    student: { id: student._id, name: student.name, rollNo: student.rollNo, className: student.className },
    date: effectiveDate,
    status: 'Present',
    markedBy,
    alreadyMarked,
  })
}

module.exports = {
  deleteAttendance,
  getAttendance,
  scanAttendance,
  setDayOff,
  updateAttendanceRecord,
}
