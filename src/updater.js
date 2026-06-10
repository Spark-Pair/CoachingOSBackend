const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawn, spawnSync } = require('child_process')
const mongoose = require('mongoose')
const connectDb = require('./config/db')
const {
  createBackupBuffer,
  createBackupFileName,
  getBackupDirectory,
} = require('./services/backupService')

const DEFAULT_INSTALL_DIRECTORY = 'C:\\CoachingOS'
const UPDATE_FILES = [
  'CoachingOS.exe',
  'frontend',
  'Start CoachingOS.bat',
  'Install License.bat',
  'INSTALLATION GUIDE.txt',
  'version.json',
]

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function parseEnvironmentFile(filePath) {
  const variables = {}

  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separator = trimmed.indexOf('=')
    if (separator < 1) continue

    const key = trimmed.slice(0, separator).trim()
    let value = trimmed.slice(separator + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    variables[key] = value
  }

  return variables
}

function copyItem(source, destination) {
  fs.rmSync(destination, { recursive: true, force: true })
  fs.cpSync(source, destination, { recursive: true })
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function validateUpdatePackage(updateSource) {
  const manifestPath = path.join(updateSource, 'update-manifest.json')
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Update package manifest is missing')
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  if (!manifest.version || !Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error('Update package manifest is invalid')
  }

  for (const entry of manifest.files) {
    const filePath = path.resolve(updateSource, entry.path)
    const relativePath = path.relative(updateSource, filePath)
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error('Update package manifest contains an unsafe file path')
    }
    if (!fs.existsSync(filePath) || hashFile(filePath) !== entry.sha256) {
      throw new Error(`Update package integrity check failed for ${entry.path}`)
    }
  }

  return manifest
}

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`
  console.log(line)

  if (process.env.COACHINGOS_UPDATE_LOG) {
    fs.appendFileSync(process.env.COACHINGOS_UPDATE_LOG, `${line}\r\n`)
  }
}

function stopApplication() {
  log('Stopping CoachingOS if it is running...')
  spawnSync('taskkill.exe', ['/F', '/IM', 'CoachingOS.exe'], {
    stdio: 'ignore',
    windowsHide: true,
  })
}

function startApplication(installDirectory) {
  const logsDirectory = path.join(installDirectory, 'logs')
  fs.mkdirSync(logsDirectory, { recursive: true })
  const logHandle = fs.openSync(path.join(logsDirectory, 'server.log'), 'a')
  const child = spawn(path.join(installDirectory, 'CoachingOS.exe'), [], {
    cwd: installDirectory,
    detached: true,
    stdio: ['ignore', logHandle, logHandle],
    windowsHide: true,
  })
  child.unref()
  fs.closeSync(logHandle)
}

function openApplication(port) {
  const child = spawn('cmd.exe', ['/c', 'start', '', `http://127.0.0.1:${port}`], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref()
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function waitForHealth(port, timeoutMs = Number(process.env.COACHINGOS_UPDATE_HEALTH_TIMEOUT || 60000)) {
  const startedAt = Date.now()
  const url = `http://127.0.0.1:${port}/api/health`

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) })
      const body = await response.json()
      if (response.ok && body.status === 'ok') return true
    } catch {
      // The server may still be connecting to MongoDB.
    }
    await sleep(1000)
  }

  return false
}

async function createDatabaseSafetyBackup() {
  log('Connecting to the configured database...')
  await connectDb()

  const backupDirectory = getBackupDirectory()
  fs.mkdirSync(backupDirectory, { recursive: true })
  const backupPath = path.join(backupDirectory, createBackupFileName('Before-update'))
  const backupBuffer = await createBackupBuffer()
  fs.writeFileSync(backupPath, backupBuffer)
  await mongoose.disconnect()
  log(`Database backup created: ${backupPath}`)
  return backupPath
}

function createApplicationRollback(installDirectory, rollbackDirectory) {
  fs.mkdirSync(rollbackDirectory, { recursive: true })

  for (const relativePath of UPDATE_FILES) {
    const source = path.join(installDirectory, relativePath)
    if (fs.existsSync(source)) {
      copyItem(source, path.join(rollbackDirectory, relativePath))
    }
  }
}

function applyApplicationFiles(sourceDirectory, installDirectory) {
  for (const relativePath of UPDATE_FILES) {
    const source = path.join(sourceDirectory, relativePath)
    if (!fs.existsSync(source)) {
      throw new Error(`Update package is missing ${relativePath}`)
    }
    copyItem(source, path.join(installDirectory, relativePath))
  }
}

function restoreApplicationFiles(rollbackDirectory, installDirectory) {
  for (const relativePath of UPDATE_FILES) {
    const installedPath = path.join(installDirectory, relativePath)
    const rollbackPath = path.join(rollbackDirectory, relativePath)

    if (fs.existsSync(rollbackPath)) {
      copyItem(rollbackPath, installedPath)
    } else {
      fs.rmSync(installedPath, { recursive: true, force: true })
    }
  }
}

async function run() {
  const updaterDirectory = process.env.COACHINGOS_UPDATER_DIR || path.dirname(process.execPath)
  const updateSource = path.join(updaterDirectory, 'update-package')
  const argument = process.argv[2]
    || (process.argv[1] && !/\.(?:js|cjs|mjs|exe)$/i.test(process.argv[1]) ? process.argv[1] : '')
  const installDirectory = path.resolve(argument || DEFAULT_INSTALL_DIRECTORY)
  const configPath = path.join(installDirectory, 'config.env')
  const programDataDirectory = process.env.ProgramData || 'C:\\ProgramData'
  const updateDataDirectory = path.join(programDataDirectory, 'CoachingOS', 'Updates')
  const rollbackDirectory = path.join(updateDataDirectory, `rollback-${timestamp()}`)

  fs.mkdirSync(updateDataDirectory, { recursive: true })
  process.env.COACHINGOS_UPDATE_LOG = path.join(updateDataDirectory, 'updater.log')

  log(`Updating CoachingOS at ${installDirectory}`)

  const manifest = validateUpdatePackage(updateSource)
  if (!fs.existsSync(configPath)) {
    throw new Error(`Installation config was not found: ${configPath}`)
  }

  Object.assign(process.env, parseEnvironmentFile(configPath))
  const port = Number(process.env.PORT || 5000)

  stopApplication()

  try {
    await createDatabaseSafetyBackup()
  } catch (error) {
    startApplication(installDirectory)
    throw new Error(`Database backup failed. No application files were changed. ${error.message}`)
  }

  log('Saving the currently installed application for rollback...')
  let rollbackReady = false

  try {
    createApplicationRollback(installDirectory, rollbackDirectory)
    rollbackReady = true
    log('Installing updated application files...')
    applyApplicationFiles(updateSource, installDirectory)
    log('Starting the updated application...')
    startApplication(installDirectory)

    if (!await waitForHealth(port)) {
      throw new Error(`The updated application did not become healthy on port ${port}`)
    }

    fs.rmSync(rollbackDirectory, { recursive: true, force: true })
    log(`CoachingOS ${manifest.version} was installed successfully.`)
    openApplication(port)
    console.log('')
    console.log('Update complete. CoachingOS is running.')
  } catch (error) {
    log(`Update failed: ${error.message}`)
    if (rollbackReady) {
      log('Restoring the previous application version...')
      stopApplication()
      restoreApplicationFiles(rollbackDirectory, installDirectory)
    }
    startApplication(installDirectory)
    const outcome = rollbackReady
      ? 'the previous application was restored'
      : 'no application files were changed'
    throw new Error(`Update failed and ${outcome}. ${error.message}`)
  }
}

run()
  .catch(async (error) => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect().catch(() => {})
    }
    console.error('')
    console.error(`ERROR: ${error.message}`)
    process.exitCode = 1
  })
