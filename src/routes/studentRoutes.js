const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const {
  createStudent,
  listStudents,
  updateStudent,
  updateStudentStatus,
} = require('../controllers/studentController')
const requireAuth = require('../middleware/auth')

const router = express.Router()

const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'students')
fs.mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, uploadDir)
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname || '').slice(0, 10)
    const safeExt = ext && ext.length <= 10 ? ext : ''
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    cb(null, `${unique}${safeExt}`)
  },
})

function fileFilter(_req, file, cb) {
  if (file.mimetype && file.mimetype.startsWith('image/')) {
    cb(null, true)
    return
  }
  cb(new Error('Only image uploads are allowed.'))
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
})

router.use(requireAuth)

router.get('/', listStudents)
router.post('/', upload.single('photo'), createStudent)
router.put('/:id', upload.single('photo'), updateStudent)
router.patch('/:id/status', updateStudentStatus)

module.exports = router

