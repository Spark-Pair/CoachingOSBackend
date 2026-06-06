const express = require('express')
const {
  downloadAttendanceReport,
  downloadClassesReport,
  downloadFeeReport,
  downloadStudentReport,
} = require('../controllers/reportController')
const requireAuth = require('../middleware/auth')

const router = express.Router()

router.use(requireAuth)

router.get('/students/:type.xlsx', downloadStudentReport)
router.get('/attendance/:type.xlsx', downloadAttendanceReport)
router.get('/fees/:type.xlsx', downloadFeeReport)
router.get('/classes.xlsx', downloadClassesReport)

module.exports = router
