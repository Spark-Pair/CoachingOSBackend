const {
  MAX_BACKUP_BYTES,
  createBackupBuffer,
  createBackupFileName,
  getBackupDirectory,
  restoreBackupBuffer,
} = require('../services/backupService')

let restoreInProgress = false

async function getBackupStatus(_req, res) {
  return res.json({
    backup: {
      ready: true,
      backupDirectory: getBackupDirectory(),
      restoreInProgress,
    },
  })
}

async function downloadBackup(_req, res) {
  try {
    const buffer = await createBackupBuffer()
    const fileName = createBackupFileName()

    res.setHeader('Content-Type', 'application/gzip')
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    res.setHeader('Content-Length', buffer.length)
    return res.send(buffer)
  } catch (error) {
    console.error('Backup failed:', error)
    return res.status(500).json({ message: error.message || 'Could not create database backup' })
  }
}

async function restoreBackup(req, res) {
  if (restoreInProgress) {
    return res.status(409).json({ message: 'A database restore is already in progress' })
  }

  const chunks = []
  let totalBytes = 0

  try {
    for await (const chunk of req) {
      totalBytes += chunk.length
      if (totalBytes > MAX_BACKUP_BYTES) {
        return res.status(413).json({ message: 'The selected backup file is too large' })
      }
      chunks.push(chunk)
    }

    restoreInProgress = true
    const result = await restoreBackupBuffer(Buffer.concat(chunks))

    return res.json({
      message: 'Database restored successfully',
      restore: result,
    })
  } catch (error) {
    console.error('Restore failed:', error)
    return res.status(400).json({ message: error.message || 'Could not restore database backup' })
  } finally {
    restoreInProgress = false
  }
}

module.exports = {
  downloadBackup,
  getBackupStatus,
  restoreBackup,
}
