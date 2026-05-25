const express = require('express')
const { getSettings, updateSettings } = require('../controllers/settingsController')
const requireAuth = require('../middleware/auth')

const router = express.Router()

router.use(requireAuth)
router.get('/', getSettings)
router.patch('/', updateSettings)

module.exports = router
