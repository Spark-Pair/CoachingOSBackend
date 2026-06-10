const express = require('express')
const {
  downloadBackup,
  getBackupStatus,
  restoreBackup,
} = require('../controllers/backupController')
const requireAuth = require('../middleware/auth')

const router = express.Router()

router.use(requireAuth)
router.get('/status', getBackupStatus)
router.get('/download', downloadBackup)
router.post('/restore', restoreBackup)

module.exports = router
