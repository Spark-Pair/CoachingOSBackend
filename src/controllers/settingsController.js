const Setting = require('../models/Setting')

async function getSettings(_req, res) {
  let settings
  try {
    settings = await Setting.findOneAndUpdate(
      { key: 'general' },
      { $setOnInsert: { coachingName: 'CoachingOS' } },
      { new: true, upsert: true },
    )
  } catch (error) {
    if (error.code !== 11000) throw error
    settings = await Setting.findOne({ key: 'general' })
  }

  return res.json({ coachingName: settings.coachingName })
}

async function updateSettings(req, res) {
  const coachingName = String(req.body.coachingName || '').trim()

  if (coachingName.length < 2 || coachingName.length > 80) {
    return res.status(400).json({ message: 'Coaching name must be between 2 and 80 characters.' })
  }

  const settings = await Setting.findOneAndUpdate(
    { key: 'general' },
    { $set: { coachingName } },
    { new: true, upsert: true, runValidators: true },
  )

  return res.json({ coachingName: settings.coachingName })
}

module.exports = {
  getSettings,
  updateSettings,
}
