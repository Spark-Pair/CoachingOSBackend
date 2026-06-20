const fs = require('fs')
const path = require('path')

const environmentPath = fs.existsSync(path.join(process.cwd(), '.env'))
  ? path.join(process.cwd(), '.env')
  : path.join(process.cwd(), 'config.env')

require('dotenv').config({ path: environmentPath })

const cors = require('cors')
const express = require('express')
const http = require('http')
const https = require('https')

const connectDb = require('./config/db')
const attendanceRoutes = require('./routes/attendanceRoutes')
const authRoutes = require('./routes/authRoutes')
const backupRoutes = require('./routes/backupRoutes')
const classRoutes = require('./routes/classRoutes')
const dashboardRoutes = require('./routes/dashboardRoutes')
const feeRoutes = require('./routes/feeRoutes')
const reportRoutes = require('./routes/reportRoutes')
const studentRoutes = require('./routes/studentRoutes')
const updateRoutes = require('./routes/updateRoutes')

const app = express()

const port = Number(process.env.BACKEND_PORT || process.env.PORT || 5000)
const host = process.env.HOST || '0.0.0.0'
const publicHost = process.env.PUBLIC_HOST || '127.0.0.1'
const publicDomain = process.env.PUBLIC_DOMAIN || ''
const frontendPort = Number(process.env.FRONTEND_PORT || 5173)

function readBooleanEnv(name, fallback = false) {
  const value = String(process.env[name] || '').trim().toLowerCase()
  if (!value) return fallback
  return ['1', 'true', 'yes', 'on'].includes(value)
}

function resolveOptionalPath(filePath) {
  if (!filePath) return ''
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)
}

function getHttpsOptions() {
  const pfxPath = resolveOptionalPath(process.env.HTTPS_PFX_PATH)
  if (!pfxPath) {
    throw new Error('HTTPS_ENABLED=true but HTTPS_PFX_PATH is not set.')
  }
  if (!fs.existsSync(pfxPath)) {
    throw new Error(`HTTPS_ENABLED=true but PFX certificate was not found: ${pfxPath}`)
  }

  try {
    return {
      pfx: fs.readFileSync(pfxPath),
      passphrase: process.env.HTTPS_PFX_PASSWORD || undefined,
    }
  } catch (error) {
    throw new Error(`HTTPS certificate could not be loaded: ${error.message}`)
  }
}

function buildOriginList(name, ports) {
  if (!name) return []
  return ports.flatMap((originPort) => [
    `https://${name}:${originPort}`,
    `http://${name}:${originPort}`,
  ])
}

const allowedOrigins = [
  ...(process.env.CLIENT_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://localhost:5173',
  'https://127.0.0.1:5173',
  ...buildOriginList(publicHost, [frontendPort, port]),
  ...buildOriginList(publicDomain, [frontendPort, port]),
]

const localDevOriginPattern =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})(?::\d{2,5})?$/

app.use(cors({
  origin(origin, callback) {
    const isAllowedDevOrigin =
      process.env.NODE_ENV !== 'production' &&
      localDevOriginPattern.test(origin || '')

    if (!origin || allowedOrigins.includes(origin) || isAllowedDevOrigin) {
      callback(null, true)
      return
    }

    callback(new Error(`Not allowed by CORS: ${origin}`))
  },
  credentials: true,
}))

app.use(express.json({ limit: '10mb' }))

app.get('/api/health', (req, res) => {
  const protocol = req.secure ? 'https' : 'http'
  res.json({
    status: 'ok',
    app: 'CoachingOS',
    protocol,
    host,
    publicHost,
    publicDomain,
    port,
    httpsEnabled: req.secure,
    timestamp: new Date().toISOString(),
  })
})

app.use('/api/auth', authRoutes)
app.use('/api/attendance', attendanceRoutes)
app.use('/api/backups', backupRoutes)
app.use('/api/classes', classRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/fees', feeRoutes)
app.use('/api/reports', reportRoutes)
app.use('/api/students', studentRoutes)
app.use('/api/updates', updateRoutes)

const frontendDirectory = path.resolve(
  process.env.FRONTEND_DIR || path.join(process.cwd(), 'frontend')
)

const frontendIndex = path.join(frontendDirectory, 'index.html')

if (fs.existsSync(frontendIndex)) {
  app.use(express.static(frontendDirectory))

  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) {
      return res.sendFile(frontendIndex)
    }

    return next()
  })
}

app.use((err, _req, res, _next) => {
  console.error(err)

  res.status(500).json({
    message: 'Server error',
    error: process.env.NODE_ENV === 'production' ? undefined : err.message,
  })
})

connectDb()
  .then(() => {
    const httpsEnabled = readBooleanEnv('HTTPS_ENABLED', false)
    const fallbackToHttp = readBooleanEnv('HTTPS_FALLBACK_TO_HTTP', true)
    let protocol = 'http'
    let server = http.createServer(app)

    if (httpsEnabled) {
      try {
        const httpsOptions = getHttpsOptions()
        protocol = 'https'
        server = https.createServer(httpsOptions, app)
      } catch (error) {
        if (!fallbackToHttp) {
          throw error
        }

        console.warn(error.message)
        console.warn('HTTPS_FALLBACK_TO_HTTP=true, so CoachingOS is starting over HTTP.')
      }
    }

    server.listen(port, host, () => {
      console.log(`CoachingOS running on ${protocol}://${host}:${port}`)
      console.log(`Protocol actually used: ${protocol}`)
      console.log(`Local admin URL: ${protocol}://127.0.0.1:${port}/dashboard`)
      console.log(`Local teacher scan URL: ${protocol}://127.0.0.1:${port}/scan`)
      console.log(`LAN admin URL: ${protocol}://${publicHost}:${port}/dashboard`)
      console.log(`LAN teacher scan URL: ${protocol}://${publicHost}:${port}/scan`)
      if (publicDomain) {
        console.log(`Domain admin URL: ${protocol}://${publicDomain}:${port}/dashboard`)
        console.log(`Domain teacher scan URL: ${protocol}://${publicDomain}:${port}/scan`)
      }
      console.log(`Health URL: ${protocol}://${publicDomain || publicHost}:${port}/api/health`)
      if (protocol === 'https') {
        console.warn('CoachingOS is running over HTTPS for camera support.')
        console.warn('Browsers may still show a warning if the certificate is not trusted on the device.')
      } else {
        console.warn('CoachingOS is running in HTTP LAN mode.')
        console.warn('Mobile browsers may show "Not secure" and may block camera/PWA features on HTTP LAN URLs.')
      }
      console.log(`Allowed origins: ${allowedOrigins.join(', ')}`)
    })
  })
  .catch((error) => {
    console.error('Failed to start server:', error.message)
    process.exit(1)
  })
