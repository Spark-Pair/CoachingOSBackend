const jwt = require('jsonwebtoken')
const AdminAuth = require('../models/AdminAuth')
const { validateLicense } = require('../services/licenseService')

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' })
  }

  try {
    req.auth = jwt.verify(token, process.env.JWT_SECRET)
    const admin = await AdminAuth.findById(req.auth.sub)
    if (!admin) {
      return res.status(401).json({ message: 'Invalid session' })
    }

    const access = validateLicense()
    if (!access.allowed) {
      return res.status(403).json({ message: access.message, code: access.code })
    }

    req.admin = admin
    req.subscription = access.subscription
    return next()
  } catch {
    return res.status(401).json({ message: 'Invalid or expired session' })
  }
}

module.exports = requireAuth
