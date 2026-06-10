const express = require('express')
const {
  getUpdateStatus,
  installUpdate,
} = require('../controllers/updateController')
const requireAuth = require('../middleware/auth')

const router = express.Router()

router.use(requireAuth)
router.get('/status', getUpdateStatus)
router.post('/install', installUpdate)

module.exports = router
