const express = require('express')
const {
  createStudent,
  listStudents,
  updateStudent,
  updateStudentStatus,
} = require('../controllers/studentController')
const requireAuth = require('../middleware/auth')

const router = express.Router()

router.use(requireAuth)

router.get('/', listStudents)
router.post('/', createStudent)
router.put('/:id', updateStudent)
router.patch('/:id/status', updateStudentStatus)

module.exports = router

