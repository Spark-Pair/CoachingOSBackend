const {
  checkForUpdate,
  prepareAndLaunchUpdate,
} = require('../services/updateService')

let updateStarting = false

async function getUpdateStatus(_req, res) {
  const result = await checkForUpdate()
  return res.json(result)
}

async function installUpdate(_req, res) {
  if (updateStarting) {
    return res.status(409).json({ message: 'The updater is already starting' })
  }

  updateStarting = true
  try {
    const result = await prepareAndLaunchUpdate()
    res.status(202).json(result)
    setTimeout(() => process.exit(0), 1500)
    return undefined
  } catch (error) {
    updateStarting = false
    console.error('Automatic update failed:', error)
    return res.status(500).json({ message: error.message || 'Could not start the update' })
  }
}

module.exports = {
  getUpdateStatus,
  installUpdate,
}
