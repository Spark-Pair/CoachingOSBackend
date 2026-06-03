const express = require('express')
const {
  createFeeRecord,
  deleteFeeRecord,
  getStudentUnpaidMonths,
  listFees,
} = require('../controllers/feeController')
const requireAuth = require('../middleware/auth')

const router = express.Router()

router.use(requireAuth)

router.get('/', listFees)
router.post('/', createFeeRecord)
router.get('/students/:studentId/unpaid-months', getStudentUnpaidMonths)
router.delete('/:id', deleteFeeRecord)

module.exports = router
