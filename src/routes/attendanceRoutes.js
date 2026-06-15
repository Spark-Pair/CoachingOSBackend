const express = require('express')
const {
  deleteAttendance,
  getAttendance,
  scanAttendance,
  setDayOff,
  updateAttendanceRecord,
} = require('../controllers/attendanceController')
const requireAuth = require('../middleware/auth')
const requireLicense = require('../middleware/license')

const router = express.Router()

router.post('/scan-public', requireLicense, scanAttendance)
router.post('/scan', requireAuth, scanAttendance)
router.get('/', requireAuth, getAttendance)
router.delete('/', requireAuth, deleteAttendance)
router.patch('/day-off', requireAuth, setDayOff)
router.patch('/records/:studentId', requireAuth, updateAttendanceRecord)

module.exports = router
