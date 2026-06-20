const crypto = require('crypto')

function generateAttendanceToken() {
  return crypto.randomBytes(24).toString('base64url')
}

module.exports = {
  generateAttendanceToken,
}
