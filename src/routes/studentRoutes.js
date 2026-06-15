const express = require('express')
const {
  createStudent,
  deleteStudent,
  listStudentOptions,
  listStudents,
  updateStudent,
  updateStudentStatus,
} = require('../controllers/studentController')
const requireAuth = require('../middleware/auth')

const router = express.Router()

router.use(requireAuth)

router.get('/', listStudents)
router.get('/options', listStudentOptions)
router.post('/', createStudent)
router.put('/:id', updateStudent)
router.patch('/:id/status', updateStudentStatus)
router.delete('/:id', deleteStudent)

module.exports = router

