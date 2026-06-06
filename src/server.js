require('dotenv').config()

const cors = require('cors')
const express = require('express')
const connectDb = require('./config/db')
const attendanceRoutes = require('./routes/attendanceRoutes')
const authRoutes = require('./routes/authRoutes')
const classRoutes = require('./routes/classRoutes')
const feeRoutes = require('./routes/feeRoutes')
const reportRoutes = require('./routes/reportRoutes')
const studentRoutes = require('./routes/studentRoutes')

const app = express()
const port = process.env.PORT || 5000
const host = process.env.HOST || '0.0.0.0'
const allowedOrigins = [
  ...(process.env.CLIENT_ORIGIN || '').split(',').map((origin) => origin.trim()),
  'http://127.0.0.1:5173',
  'https://127.0.0.1:5173',
  'http://localhost:5173',
  'https://localhost:5173',
].filter(Boolean)
const localDevOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})(?::\d{2,5})?$/

app.use(cors({
  origin(origin, callback) {
    const isAllowedDevOrigin = process.env.NODE_ENV !== 'production' && localDevOriginPattern.test(origin || '')

    if (!origin || allowedOrigins.includes(origin) || isAllowedDevOrigin) {
      callback(null, true)
      return
    }

    callback(new Error('Not allowed by CORS'))
  },
}))
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api/auth', authRoutes)
app.use('/api/attendance', attendanceRoutes)
app.use('/api/classes', classRoutes)
app.use('/api/fees', feeRoutes)
app.use('/api/reports', reportRoutes)
app.use('/api/students', studentRoutes)

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ message: 'Server error' })
})

connectDb()
  .then(() => {
    app.listen(port, host, () => {
      console.log(`CoachingOS API running on http://${host}:${port}`)
    })
  })
  .catch((error) => {
    console.error('Failed to start server:', error.message)
    process.exit(1)
  })
