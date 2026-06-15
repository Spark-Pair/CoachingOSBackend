const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const PUBLIC_KEY = require('../config/licensePublicKey')

const LICENSE_FILE_NAME = 'license.json'
const STATE_FILE_NAME = 'license-state.json'
const WINDOWS_RENAME_RETRY_CODES = new Set(['EACCES', 'EBUSY', 'EPERM'])
const WINDOWS_RENAME_RETRY_DELAYS_MS = [25, 50, 100, 200, 400]
const sleepBuffer = new Int32Array(new SharedArrayBuffer(4))

function getLicenseDirectory() {
  if (process.env.COACHINGOS_LICENSE_DIR) {
    return path.resolve(process.env.COACHINGOS_LICENSE_DIR)
  }

  const baseDirectory = process.env.PROGRAMDATA || path.join(os.homedir(), '.coachingos')
  return path.join(baseDirectory, 'CoachingOS')
}

function getLicensePath() {
  return path.join(getLicenseDirectory(), LICENSE_FILE_NAME)
}

function getStatePath() {
  return path.join(getLicenseDirectory(), STATE_FILE_NAME)
}

function canonicalPayload(payload) {
  return JSON.stringify({
    licenseId: String(payload.licenseId || ''),
    customer: String(payload.customer || ''),
    issuedAt: String(payload.issuedAt || ''),
    expiresAt: String(payload.expiresAt || ''),
  })
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function sleepSync(milliseconds) {
  Atomics.wait(sleepBuffer, 0, 0, milliseconds)
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const contents = `${JSON.stringify(value, null, 2)}\n`
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`
  fs.writeFileSync(temporaryPath, contents, 'utf8')

  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        fs.renameSync(temporaryPath, filePath)
        return
      } catch (error) {
        const retryDelay = WINDOWS_RENAME_RETRY_DELAYS_MS[attempt]
        if (process.platform !== 'win32' || !WINDOWS_RENAME_RETRY_CODES.has(error.code) || retryDelay === undefined) {
          throw error
        }
        sleepSync(retryDelay)
      }
    }
  } catch (renameError) {
    try {
      // Windows can allow writing a file while temporarily denying replacement.
      fs.writeFileSync(filePath, contents, 'utf8')
    } catch {
      throw renameError
    }
  } finally {
    try {
      fs.rmSync(temporaryPath, { force: true })
    } catch {
      // A stale temporary file is harmless and can be cleaned up later.
    }
  }
}

function isValidDate(value) {
  const date = new Date(value)
  return !Number.isNaN(date.getTime())
}

function verifyLicenseDocument(document) {
  if (!document?.payload || !document?.signature) return false
  return crypto.verify(
    'sha256',
    Buffer.from(canonicalPayload(document.payload)),
    PUBLIC_KEY,
    Buffer.from(document.signature, 'base64'),
  )
}

function readState(licenseId, issuedAt) {
  try {
    const state = readJson(getStatePath())
    if (state.licenseId === licenseId && isValidDate(state.lastSeenAt)) return state
  } catch {
    // A missing state file is normal on first use.
  }
  return { licenseId, lastSeenAt: issuedAt }
}

function serializeLicense(payload, state, now) {
  const expiresAt = new Date(payload.expiresAt)
  const lastSeenAt = new Date(state.lastSeenAt)
  const rollbackDetected = now < lastSeenAt
  const expired = now >= expiresAt
  return {
    licenseId: payload.licenseId,
    customer: payload.customer,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    lastSeenAt: state.lastSeenAt,
    status: rollbackDetected ? 'Clock error' : expired ? 'Expired' : 'Active',
    daysRemaining: expired ? 0 : Math.max(0, Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000))),
    licensePath: getLicensePath(),
  }
}

function validateLicense({ updateLastSeen = true } = {}) {
  let document
  try {
    document = readJson(getLicensePath())
  } catch {
    return {
      allowed: false,
      code: 'LICENSE_MISSING',
      message: 'License is missing. Contact developers.',
    }
  }

  if (!verifyLicenseDocument(document)) {
    return {
      allowed: false,
      code: 'LICENSE_INVALID',
      message: 'License is invalid. Contact developers.',
    }
  }

  const { payload } = document
  if (!payload.licenseId || !payload.customer || !isValidDate(payload.issuedAt) || !isValidDate(payload.expiresAt)) {
    return {
      allowed: false,
      code: 'LICENSE_INVALID',
      message: 'License is invalid. Contact developers.',
    }
  }

  const state = readState(payload.licenseId, payload.issuedAt)
  const now = new Date()
  const subscription = serializeLicense(payload, state, now)

  if (subscription.status === 'Clock error') {
    return {
      allowed: false,
      code: 'SYSTEM_CLOCK_INVALID',
      message: 'System date/time changed. Contact developers.',
      subscription,
    }
  }

  if (subscription.status === 'Expired') {
    if (now > new Date(state.lastSeenAt)) {
      state.lastSeenAt = now.toISOString()
      writeJson(getStatePath(), state)
      subscription.lastSeenAt = state.lastSeenAt
    }
    return {
      allowed: false,
      code: 'SUBSCRIPTION_EXPIRED',
      message: 'Subscription expired. Contact developers.',
      subscription,
    }
  }

  if (updateLastSeen) {
    state.lastSeenAt = now.toISOString()
    writeJson(getStatePath(), state)
    subscription.lastSeenAt = state.lastSeenAt
  }

  return { allowed: true, subscription }
}

module.exports = {
  canonicalPayload,
  getLicenseDirectory,
  getLicensePath,
  validateLicense,
  verifyLicenseDocument,
}
