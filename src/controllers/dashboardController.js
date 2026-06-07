const AttendanceDay = require('../models/AttendanceDay')
const Class = require('../models/Class')
const FeeRecord = require('../models/FeeRecord')
const Student = require('../models/Student')

function todayInputValue() {
  return new Date().toISOString().slice(0, 10)
}

function currentMonthValue() {
  return todayInputValue().slice(0, 7)
}

async function getDashboard(req, res) {
  const today = todayInputValue()
  const month = currentMonthValue()
  const monthStart = new Date(`${month}-01T00:00:00.000Z`)
  const nextMonth = new Date(monthStart)
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1)

  const [students, classes, attendanceDays, monthFees, recentFees, recentStudents, recentAttendanceDays] = await Promise.all([
    Student.find({}).select('_id name rollNo classId className monthlyFee joiningDate status createdAt').lean(),
    Class.find({}).sort({ name: 1 }).lean(),
    AttendanceDay.find({ date: today }).lean(),
    FeeRecord.find({ month }).lean(),
    FeeRecord.find({}).sort({ createdAt: -1 }).limit(8).lean(),
    Student.find({}).sort({ createdAt: -1 }).limit(6).lean(),
    AttendanceDay.find({}).sort({ updatedAt: -1 }).limit(8).lean(),
  ])

  const activeStudents = students.filter((student) => student.status === 'Active')
  const studentsByClass = new Map()
  activeStudents.forEach((student) => {
    const classId = student.classId.toString()
    const current = studentsByClass.get(classId) || []
    current.push(student)
    studentsByClass.set(classId, current)
  })
  const attendanceByClass = new Map(attendanceDays.map((day) => [day.classId.toString(), day]))

  const classAttendance = classes
    .filter((classItem) => classItem.status === 'Active')
    .map((classItem) => {
      const classStudents = studentsByClass.get(classItem._id.toString()) || []
      const day = attendanceByClass.get(classItem._id.toString())
      const statusByStudent = new Map((day?.records || []).map((record) => [record.studentId.toString(), record.status]))
      const present = day?.dayOff ? 0 : classStudents.filter((student) => statusByStudent.get(student._id.toString()) === 'Present').length
      const leave = day?.dayOff ? 0 : classStudents.filter((student) => statusByStudent.get(student._id.toString()) === 'Leave').length
      const total = day?.dayOff ? 0 : classStudents.length
      return {
        id: classItem._id,
        name: classItem.name,
        present,
        absent: Math.max(0, total - present - leave),
        leave,
        total,
        percentage: total ? Math.round((present / total) * 100) : 0,
        dayOff: Boolean(day?.dayOff),
        marked: Boolean(day?.dayOff || day?.records?.length),
      }
    })

  const attendanceTotals = classAttendance.reduce((summary, item) => ({
    present: summary.present + item.present,
    total: summary.total + item.total,
  }), { present: 0, total: 0 })

  const monthFeeByStudent = new Map(monthFees.map((record) => [record.studentId.toString(), record]))
  const dueStudents = students.filter((student) => (
    student.status === 'Active'
    && new Date(student.joiningDate) < nextMonth
  ))
  const feesCollected = monthFees.reduce((sum, record) => sum + Number(record.amount || 0), 0)
  const pendingFees = dueStudents.reduce((sum, student) => (
    monthFeeByStudent.has(student._id.toString()) ? sum : sum + Number(student.monthlyFee || 0)
  ), 0)

  const studentLookup = new Map(students.map((student) => [student._id.toString(), student]))
  const activities = [
    ...recentFees.map((record) => ({
      id: `fee-${record._id}`,
      type: 'fee',
      title: `${record.studentName} paid ${record.month} fees`,
      detail: `${record.className} / Rs ${Number(record.amount || 0).toLocaleString()}`,
      occurredAt: record.createdAt || record.paidDate,
    })),
    ...recentStudents.map((student) => ({
      id: `student-${student._id}`,
      type: 'student',
      title: `${student.name} joined ${student.className}`,
      detail: `Roll no ${student.rollNo}`,
      occurredAt: student.createdAt,
    })),
    ...recentAttendanceDays.flatMap((day) => {
      const entries = []
      if (day.dayOff) {
        entries.push({
          id: `dayoff-${day._id}`,
          type: 'day-off',
          title: `${day.className} marked as day off`,
          detail: day.date,
          occurredAt: day.updatedAt,
        })
      }
      day.records.slice(-4).forEach((record) => {
        const student = studentLookup.get(record.studentId.toString())
        if (!student) return
        entries.push({
          id: `attendance-${day._id}-${record.studentId}`,
          type: 'attendance',
          title: `${student.name} marked ${record.status.toLowerCase()}`,
          detail: `${day.className} / ${record.markedBy === 'teacher' ? 'Teacher scan' : 'Admin'}`,
          occurredAt: record.markedAt,
        })
      })
      return entries
    }),
  ]
    .filter((item) => item.occurredAt)
    .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))
    .slice(0, 8)

  return res.json({
    date: today,
    month,
    metrics: {
      totalStudents: students.length,
      activeStudents: activeStudents.length,
      activeClasses: classes.filter((classItem) => classItem.status === 'Active').length,
      attendancePercentage: attendanceTotals.total
        ? Math.round((attendanceTotals.present / attendanceTotals.total) * 100)
        : 0,
      attendancePresent: attendanceTotals.present,
      attendanceTotal: attendanceTotals.total,
      feesCollected,
      pendingFees,
      paidInstallments: monthFees.length,
      pendingInstallments: Math.max(0, dueStudents.length - monthFees.length),
    },
    classAttendance,
    activities,
  })
}

module.exports = { getDashboard }
