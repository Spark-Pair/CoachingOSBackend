const express = require('express')
const {
  getSession,
  getSetupStatus,
  login,
  registerPin,
  resetPin,
} = require('../controllers/authController')
const requireAuth = require('../middleware/auth')

const router = express.Router()

router.get('/setup-status', getSetupStatus)
router.post('/register', registerPin)
router.post('/login', login)
router.get('/session', requireAuth, getSession)
router.post('/reset-pin', requireAuth, resetPin)

module.exports = router
