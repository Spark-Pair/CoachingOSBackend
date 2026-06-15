const mongoose = require('mongoose')
const AttendanceDay = require('../models/AttendanceDay')
const Class = require('../models/Class')
const FeeRecord = require('../models/FeeRecord')
const Student = require('../models/Student')

const STUDENT_PAGE_SIZE = 30

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getPage(value) {
  const page = Number.parseInt(value, 10)
  return Number.isInteger(page) && page > 0 ? page : 1
}

function buildStatusFilter(status) {
  return ['Active', 'Inactive'].includes(status) ? status : undefined
}

function buildDate(value) {
  if (!value) return undefined
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? undefined : date
}

async function listStudents(req, res) {
  const page = getPage(req.query.page)
  const status = buildStatusFilter(req.query.status)
  const search = String(req.query.search || '').trim()
  const classId = String(req.query.classId || '').trim()
  const dateFrom = buildDate(req.query.dateFrom)
  const dateTo = buildDate(req.query.dateTo)

  const joiningDate = {}
  if (dateFrom) joiningDate.$gte = dateFrom
  if (dateTo) joiningDate.$lte = dateTo

  const filter = {
    ...(status ? { status } : {}),
    ...(search ? {
      $or: [
        { name: { $regex: escapeRegex(search), $options: 'i' } },
        { rollNo: { $regex: escapeRegex(search), $options: 'i' } },
        { parentName: { $regex: escapeRegex(search), $options: 'i' } },
        { phone: { $regex: escapeRegex(search), $options: 'i' } },
        { group: { $regex: escapeRegex(search), $options: 'i' } },
      ],
    } : {}),
    ...(classId && mongoose.isValidObjectId(classId) ? { classId } : {}),
    ...(Object.keys(joiningDate).length ? { joiningDate } : {}),
  }

  const [total, students, activeCount, inactiveCount] = await Promise.all([
    Student.countDocuments(filter),
    Student.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * STUDENT_PAGE_SIZE)
      .limit(STUDENT_PAGE_SIZE)
      .lean(),
    Student.countDocuments({ status: 'Active' }),
    Student.countDocuments({ status: 'Inactive' }),
  ])

  return res.json({
    data: students.map((student) => ({ ...student, id: student._id })),
    pagination: {
      page,
      pageSize: STUDENT_PAGE_SIZE,
      total,
      pages: Math.max(1, Math.ceil(total / STUDENT_PAGE_SIZE)),
    },
    summary: {
      total: activeCount + inactiveCount,
      active: activeCount,
      inactive: inactiveCount,
    },
  })
}

async function listStudentOptions(_req, res) {
  const students = await Student.find({})
    .sort({ name: 1 })
    .select('_id name parentName phone dateOfBirth group rollNo classId className monthlyFee joiningDate status')
    .lean()

  return res.json({
    data: students.map((student) => ({ ...student, id: student._id })),
  })
}

async function createStudent(req, res) {
  const name = String(req.body.name || '').trim()
  const parentName = String(req.body.parentName || '').trim()
  const phone = String(req.body.phone || '').trim()
  const dateOfBirth = buildDate(req.body.dateOfBirth)
  const group = String(req.body.group || '').trim()
  const rollNo = String(req.body.rollNo || '').trim()
  const classId = String(req.body.classId || '').trim()
  const monthlyFee = Number(req.body.monthlyFee)
  const joiningDate = buildDate(req.body.joiningDate)

  if (!name || !parentName || !phone || !dateOfBirth || dateOfBirth > new Date() || !group || !rollNo || !classId || !mongoose.isValidObjectId(classId) || !joiningDate || !Number.isFinite(monthlyFee)) {
    return res.status(400).json({ message: 'All fields are required.' })
  }

  const classItem = await Class.findById(classId).select('name status').lean()
  if (!classItem) {
    return res.status(400).json({ message: 'Selected class does not exist.' })
  }
  if (classItem.status !== 'Active') {
    return res.status(400).json({ message: 'Selected class is inactive.' })
  }

  try {
    const student = await Student.create({
      name,
      parentName,
      phone,
      dateOfBirth,
      group,
      rollNo,
      classId: classItem._id,
      className: classItem.name,
      monthlyFee,
      joiningDate,
      status: 'Active',
    })
    return res.status(201).json({ ...student.toObject(), id: student._id })
  } catch (error) {
    if (error.code === 11000) {
      if (error.keyPattern?.rollNo) {
        return res.status(409).json({ message: 'A student with this roll number already exists.' })
      }
      return res.status(409).json({ message: 'A student with these details already exists.' })
    }
    throw error
  }
}

async function updateStudent(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: 'Student not found.' })
  }

  const name = String(req.body.name || '').trim()
  const parentName = String(req.body.parentName || '').trim()
  const phone = String(req.body.phone || '').trim()
  const dateOfBirth = buildDate(req.body.dateOfBirth)
  const group = String(req.body.group || '').trim()
  const rollNo = String(req.body.rollNo || '').trim()
  const classId = String(req.body.classId || '').trim()
  const monthlyFee = Number(req.body.monthlyFee)
  const joiningDate = buildDate(req.body.joiningDate)

  if (!name || !parentName || !phone || !dateOfBirth || dateOfBirth > new Date() || !group || !rollNo || !classId || !mongoose.isValidObjectId(classId) || !joiningDate || !Number.isFinite(monthlyFee)) {
    return res.status(400).json({ message: 'All fields are required.' })
  }

  const classItem = await Class.findById(classId).select('name status').lean()
  if (!classItem) {
    return res.status(400).json({ message: 'Selected class does not exist.' })
  }

  try {
    const student = await Student.findByIdAndUpdate(
      req.params.id,
      {
        name,
        parentName,
        phone,
        dateOfBirth,
        group,
        rollNo,
        classId: classItem._id,
        className: classItem.name,
        monthlyFee,
        joiningDate,
      },
      { new: true, runValidators: true },
    )

    if (!student) {
      return res.status(404).json({ message: 'Student not found.' })
    }

    return res.json({ ...student.toObject(), id: student._id })
  } catch (error) {
    if (error.code === 11000) {
      if (error.keyPattern?.rollNo) {
        return res.status(409).json({ message: 'A student with this roll number already exists.' })
      }
      return res.status(409).json({ message: 'A student with these details already exists.' })
    }
    if (error instanceof mongoose.Error.CastError) {
      return res.status(404).json({ message: 'Student not found.' })
    }
    throw error
  }
}

async function updateStudentStatus(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: 'Student not found.' })
  }

  const status = buildStatusFilter(req.body.status)
  if (!status) {
    return res.status(400).json({ message: 'Status must be Active or Inactive.' })
  }

  const student = await Student.findByIdAndUpdate(req.params.id, { status }, { new: true, runValidators: true })
  if (!student) {
    return res.status(404).json({ message: 'Student not found.' })
  }

  return res.json({ ...student.toObject(), id: student._id })
}

async function deleteStudent(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: 'Student not found.' })
  }

  const student = await Student.findById(req.params.id).select('_id').lean()
  if (!student) {
    return res.status(404).json({ message: 'Student not found.' })
  }

  const [feeRecordCount, attendanceRecordCount] = await Promise.all([
    FeeRecord.countDocuments({ studentId: student._id }),
    AttendanceDay.countDocuments({ 'records.studentId': student._id }),
  ])

  if (feeRecordCount || attendanceRecordCount) {
    const dependencies = [
      feeRecordCount ? `${feeRecordCount} fee record${feeRecordCount === 1 ? '' : 's'}` : '',
      attendanceRecordCount ? `${attendanceRecordCount} attendance day${attendanceRecordCount === 1 ? '' : 's'}` : '',
    ].filter(Boolean).join(' and ')

    return res.status(409).json({
      message: `This student cannot be deleted because they have ${dependencies}.`,
    })
  }

  await Student.deleteOne({ _id: student._id })
  return res.json({ id: student._id })
}

module.exports = {
  createStudent,
  deleteStudent,
  listStudentOptions,
  listStudents,
  updateStudent,
  updateStudentStatus,
}

