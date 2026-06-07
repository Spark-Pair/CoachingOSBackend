const { validateLicense } = require('../services/licenseService')

function requireLicense(req, res, next) {
  const access = validateLicense()
  if (!access.allowed) {
    return res.status(403).json({ message: access.message, code: access.code })
  }
  req.subscription = access.subscription
  return next()
}

module.exports = requireLicense
