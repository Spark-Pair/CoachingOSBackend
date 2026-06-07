const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const AdminAuth = require('../models/AdminAuth')
const { validateLicense } = require('../services/licenseService')

function isValidPin(pin) {
  return /^\d{4}$/.test(String(pin || ''))
}

function createToken(admin) {
  return jwt.sign({ sub: admin._id.toString(), role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '7d' })
}

async function getSetupStatus(_req, res) {
  const hasPin = await AdminAuth.exists({})
  const access = validateLicense({ updateLastSeen: false })
  return res.json({
    hasPin: Boolean(hasPin),
    licenseStatus: access.subscription?.status || access.code,
  })
}

async function registerPin(req, res) {
  const { pin } = req.body

  if (!isValidPin(pin)) {
    return res.status(400).json({ message: 'Use a 4-digit PIN.' })
  }

  const access = validateLicense()
  if (!access.allowed) {
    return res.status(403).json({ message: access.message, code: access.code })
  }

  const existingAdmin = await AdminAuth.findOne()
  if (existingAdmin) {
    return res.status(409).json({ message: 'Admin PIN is already registered.' })
  }

  const pinHash = await bcrypt.hash(pin, 12)
  const admin = await AdminAuth.create({ pinHash })

  return res.status(201).json({
    token: createToken(admin),
    hasPin: true,
    subscription: access.subscription,
  })
}

async function login(req, res) {
  const { pin } = req.body

  if (!isValidPin(pin)) {
    return res.status(400).json({ message: 'Use a 4-digit PIN.' })
  }

  const admin = await AdminAuth.findOne()
  if (!admin) {
    return res.status(404).json({ message: 'Admin PIN is not registered.' })
  }

  const access = validateLicense({ updateLastSeen: false })
  if (!access.allowed) {
    return res.status(403).json({ message: access.message, code: access.code })
  }

  const isMatch = await bcrypt.compare(pin, admin.pinHash)
  if (!isMatch) {
    return res.status(401).json({ message: 'Incorrect PIN. Please try again.' })
  }

  const verifiedAccess = validateLicense()
  return res.json({ token: createToken(admin), hasPin: true, subscription: verifiedAccess.subscription })
}

async function getSession(req, res) {
  return res.json({
    authenticated: true,
    hasPin: true,
    subscription: req.subscription,
  })
}

async function getSubscription(req, res) {
  return res.json({ subscription: req.subscription })
}

async function resetPin(req, res) {
  const { currentPin, newPin } = req.body

  if (!isValidPin(currentPin) || !isValidPin(newPin)) {
    return res.status(400).json({ message: 'Use 4-digit PIN values.' })
  }

  const admin = await AdminAuth.findById(req.auth.sub)
  if (!admin) {
    return res.status(401).json({ message: 'Invalid session' })
  }

  const isMatch = await bcrypt.compare(currentPin, admin.pinHash)
  if (!isMatch) {
    return res.status(401).json({ message: 'Current PIN is incorrect.' })
  }

  admin.pinHash = await bcrypt.hash(newPin, 12)
  await admin.save()

  return res.json({ token: createToken(admin), hasPin: true })
}

module.exports = {
  getSession,
  getSetupStatus,
  getSubscription,
  login,
  registerPin,
  resetPin,
}
