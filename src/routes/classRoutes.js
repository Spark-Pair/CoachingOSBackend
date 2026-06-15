const express = require('express')
const {
  createClass,
  deleteClass,
  listClasses,
  listClassOptions,
  listClassStudents,
  updateClass,
  updateClassStatus,
} = require('../controllers/classController')
const requireAuth = require('../middleware/auth')

const router = express.Router()

router.use(requireAuth)
router.get('/', listClasses)
router.get('/options', listClassOptions)
router.post('/', createClass)
router.get('/:id/students', listClassStudents)
router.put('/:id', updateClass)
router.patch('/:id/status', updateClassStatus)
router.delete('/:id', deleteClass)

module.exports = router
