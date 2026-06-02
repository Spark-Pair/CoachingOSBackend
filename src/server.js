require('dotenv').config()

const cors = require('cors')
const express = require('express')
const connectDb = require('./config/db')
const attendanceRoutes = require('./routes/attendanceRoutes')
const authRoutes = require('./routes/authRoutes')
const classRoutes = require('./routes/classRoutes')
const studentRoutes = require('./routes/studentRoutes')

const app = express()
const port = process.env.PORT || 5000
const allowedOrigins = [
  process.env.CLIENT_ORIGIN,
  'http://127.0.0.1:5173',
  'http://localhost:5173',
].filter(Boolean)

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
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
app.use('/api/students', studentRoutes)

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ message: 'Server error' })
})

connectDb()
  .then(() => {
    app.listen(port, () => {
      console.log(`CoachingOS API running on port ${port}`)
    })
  })
  .catch((error) => {
    console.error('Failed to start server:', error.message)
    process.exit(1)
  })
