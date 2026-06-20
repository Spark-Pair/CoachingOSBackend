const windowMs = Number(process.env.PUBLIC_SCAN_RATE_LIMIT_WINDOW_MS || 60000)
const maxRequests = Number(process.env.PUBLIC_SCAN_RATE_LIMIT_MAX || 90)
const buckets = new Map()

function publicScanRateLimit(req, res, next) {
  const now = Date.now()
  const key = `${req.ip || req.socket?.remoteAddress || 'unknown'}:${req.headers['user-agent'] || ''}`
  const current = buckets.get(key)

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return next()
  }

  current.count += 1
  if (current.count > maxRequests) {
    return res.status(429).json({ message: 'Too many scan attempts. Please wait and try again.' })
  }

  return next()
}

module.exports = publicScanRateLimit
