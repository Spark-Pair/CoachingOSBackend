const mongoose = require('mongoose')

const adminAuthSchema = new mongoose.Schema(
  {
    pinHash: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
)

module.exports = mongoose.model('AdminAuth', adminAuthSchema)
