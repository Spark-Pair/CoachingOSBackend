const mongoose = require('mongoose')
const Class = require('../models/Class')
const Student = require('../models/Student')

const CLASS_PAGE_SIZE = 30
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

async function studentCountForClass(classItem) {
  return Student.countDocuments({
    $or: [{ classId: classItem._id }, { classId: null, className: classItem.name }],
  })
}

async function listClasses(req, res) {
  const page = getPage(req.query.page)
  const status = buildStatusFilter(req.query.status)
  const search = String(req.query.search || '').trim()
  const filter = {
    ...(status ? { status } : {}),
    ...(search ? { name: { $regex: escapeRegex(search), $options: 'i' } } : {}),
  }

  const [total, classes, activeCount, inactiveCount, allClasses] = await Promise.all([
    Class.countDocuments(filter),
    Class.find(filter).sort({ sortOrder: 1, name: 1 }).skip((page - 1) * CLASS_PAGE_SIZE).limit(CLASS_PAGE_SIZE).lean(),
    Class.countDocuments({ status: 'Active' }),
    Class.countDocuments({ status: 'Inactive' }),
    Class.find({}).select('_id name').lean(),
  ])

  const [studentCounts, assignedStudentCounts] = await Promise.all([
    Promise.all(classes.map(studentCountForClass)),
    Promise.all(allClasses.map(studentCountForClass)),
  ])

  return res.json({
    data: classes.map((classItem, index) => ({
      ...classItem,
      id: classItem._id,
      studentCount: studentCounts[index],
    })),
    pagination: {
      page,
      pageSize: CLASS_PAGE_SIZE,
      total,
      pages: Math.max(1, Math.ceil(total / CLASS_PAGE_SIZE)),
    },
    summary: {
      total: activeCount + inactiveCount,
      active: activeCount,
      inactive: inactiveCount,
      assignedStudents: assignedStudentCounts.reduce((sum, count) => sum + count, 0),
    },
  })
}

async function createClass(req, res) {
  const name = String(req.body.name || '').trim()
  const sortOrder = Number(req.body.sortOrder)
  const status = buildStatusFilter(req.body.status) || 'Active'

  if (!name || !Number.isInteger(sortOrder) || sortOrder < 1) {
    return res.status(400).json({ message: 'Class name and a valid sort order are required.' })
  }

  try {
    const classItem = await Class.create({ name, sortOrder, status })
    return res.status(201).json({ ...classItem.toObject(), id: classItem._id, studentCount: 0 })
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'A class with this name already exists.' })
    }
    throw error
  }
}

async function updateClass(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: 'Class not found.' })
  }

  const name = String(req.body.name || '').trim()
  const sortOrder = Number(req.body.sortOrder)
  const status = buildStatusFilter(req.body.status)

  if (!name || !Number.isInteger(sortOrder) || sortOrder < 1 || !status) {
    return res.status(400).json({ message: 'Class name, sort order, and status are required.' })
  }

  try {
    const classItem = await Class.findByIdAndUpdate(
      req.params.id,
      { name, sortOrder, status },
      { new: true, runValidators: true },
    )
    if (!classItem) {
      return res.status(404).json({ message: 'Class not found.' })
    }

    const studentCount = await studentCountForClass(classItem)
    return res.json({ ...classItem.toObject(), id: classItem._id, studentCount })
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'A class with this name already exists.' })
    }
    if (error instanceof mongoose.Error.CastError) {
      return res.status(404).json({ message: 'Class not found.' })
    }
    throw error
  }
}

async function updateClassStatus(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: 'Class not found.' })
  }

  const status = buildStatusFilter(req.body.status)
  if (!status) {
    return res.status(400).json({ message: 'Status must be Active or Inactive.' })
  }

  const classItem = await Class.findByIdAndUpdate(req.params.id, { status }, { new: true, runValidators: true })
  if (!classItem) {
    return res.status(404).json({ message: 'Class not found.' })
  }

  return res.json({ ...classItem.toObject(), id: classItem._id })
}

async function listClassStudents(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: 'Class not found.' })
  }

  const classItem = await Class.findById(req.params.id).lean()
  if (!classItem) {
    return res.status(404).json({ message: 'Class not found.' })
  }

  const page = getPage(req.query.page)
  const status = buildStatusFilter(req.query.status)
  const search = String(req.query.search || '').trim()
  const filter = {
    $and: [
      { $or: [{ classId: classItem._id }, { classId: null, className: classItem.name }] },
      ...(status ? [{ status }] : []),
      ...(search ? [{
        $or: [
          { name: { $regex: escapeRegex(search), $options: 'i' } },
          { rollNo: { $regex: escapeRegex(search), $options: 'i' } },
          { parentName: { $regex: escapeRegex(search), $options: 'i' } },
        ],
      }] : []),
    ],
  }

  const [total, students] = await Promise.all([
    Student.countDocuments(filter),
    Student.find(filter).sort({ name: 1 }).skip((page - 1) * STUDENT_PAGE_SIZE).limit(STUDENT_PAGE_SIZE).lean(),
  ])

  return res.json({
    class: { id: classItem._id, name: classItem.name },
    data: students.map((student) => ({ ...student, id: student._id })),
    pagination: {
      page,
      pageSize: STUDENT_PAGE_SIZE,
      total,
      pages: Math.max(1, Math.ceil(total / STUDENT_PAGE_SIZE)),
    },
  })
}

module.exports = {
  createClass,
  listClasses,
  listClassStudents,
  updateClass,
  updateClassStatus,
}
