const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawn, spawnSync } = require('child_process')
const { Readable, Transform } = require('stream')
const { pipeline } = require('stream/promises')

const DEFAULT_METADATA_URL = 'https://github.com/Spark-Pair/CoachingOSBackend/releases/latest/download/update.json'
const RELEASE_DOWNLOAD_PREFIX = 'https://github.com/Spark-Pair/CoachingOSBackend/releases/download/'
const MAX_UPDATE_BYTES = 500 * 1024 * 1024

function getDataDirectory() {
  return process.env.COACHINGOS_LICENSE_DIR
    || (process.platform === 'win32'
      ? path.join(process.env.ProgramData || 'C:\\ProgramData', 'CoachingOS')
      : path.join(process.cwd(), 'data'))
}

function getUpdateDirectory() {
  return path.join(getDataDirectory(), 'Updates')
}

function getUpdateStatePath() {
  return path.join(getUpdateDirectory(), 'update-state.json')
}

function parseVersion(version) {
  const match = String(version || '').trim().match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) return null
  return match.slice(1).map(Number)
}

function compareVersions(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (!a || !b) throw new Error('Update metadata contains an invalid version')

  for (let index = 0; index < 3; index += 1) {
    if (a[index] > b[index]) return 1
    if (a[index] < b[index]) return -1
  }
  return 0
}

function getCurrentVersion() {
  if (process.env.COACHINGOS_VERSION && parseVersion(process.env.COACHINGOS_VERSION)) {
    return process.env.COACHINGOS_VERSION
  }

  const versionPath = path.join(process.cwd(), 'version.json')
  if (fs.existsSync(versionPath)) {
    try {
      const version = JSON.parse(fs.readFileSync(versionPath, 'utf8')).version
      if (parseVersion(version)) return version
    } catch {
      // Fall through to the development version.
    }
  }

  return '0.0.0'
}

function isInstallSupported() {
  return process.platform === 'win32'
    && (
      path.basename(process.execPath).toLowerCase() === 'coachingos.exe'
      || process.env.COACHINGOS_ALLOW_UPDATE_INSTALL === 'true'
    )
}

function validateMetadata(metadata) {
  if (
    !metadata
    || !parseVersion(metadata.version)
    || typeof metadata.mandatory !== 'boolean'
    || typeof metadata.downloadUrl !== 'string'
    || typeof metadata.releaseUrl !== 'string'
    || !/^[a-f0-9]{64}$/i.test(metadata.sha256 || '')
  ) {
    throw new Error('The update server returned invalid metadata')
  }

  if (
    !metadata.downloadUrl.startsWith(RELEASE_DOWNLOAD_PREFIX)
    || !metadata.releaseUrl.startsWith('https://github.com/Spark-Pair/CoachingOSBackend/releases/')
  ) {
    throw new Error('The update download location is not trusted')
  }

  return {
    version: metadata.version,
    mandatory: metadata.mandatory,
    publishedAt: metadata.publishedAt || null,
    downloadUrl: metadata.downloadUrl,
    releaseUrl: metadata.releaseUrl,
    sha256: metadata.sha256.toLowerCase(),
    assetName: metadata.assetName || path.basename(new URL(metadata.downloadUrl).pathname),
  }
}

function readCachedUpdate() {
  const statePath = getUpdateStatePath()
  if (!fs.existsSync(statePath)) return null

  try {
    return validateMetadata(JSON.parse(fs.readFileSync(statePath, 'utf8')))
  } catch {
    return null
  }
}

function cacheUpdate(metadata) {
  const updateDirectory = getUpdateDirectory()
  fs.mkdirSync(updateDirectory, { recursive: true })
  fs.writeFileSync(getUpdateStatePath(), JSON.stringify(metadata, null, 2), 'utf8')
}

function clearCachedUpdate() {
  fs.rmSync(getUpdateStatePath(), { force: true })
}

async function fetchLatestMetadata() {
  const response = await fetch(process.env.COACHINGOS_UPDATE_URL || DEFAULT_METADATA_URL, {
    headers: {
      Accept: 'application/json',
      'User-Agent': `CoachingOS/${getCurrentVersion()}`,
    },
    signal: AbortSignal.timeout(10000),
  })

  if (!response.ok) {
    throw new Error(`Update server returned HTTP ${response.status}`)
  }

  const text = (await response.text()).replace(/^\uFEFF/, '')
  return validateMetadata(JSON.parse(text))
}

function createUpdateResult(metadata, source, online) {
  const currentVersion = getCurrentVersion()
  const available = compareVersions(metadata.version, currentVersion) > 0

  if (!available) {
    clearCachedUpdate()
  } else if (metadata.mandatory) {
    cacheUpdate(metadata)
  } else {
    clearCachedUpdate()
  }

  return {
    currentVersion,
    available,
    canInstall: isInstallSupported(),
    online,
    source,
    update: available ? metadata : null,
  }
}

async function checkForUpdate() {
  try {
    const metadata = await fetchLatestMetadata()
    return createUpdateResult(metadata, 'github', true)
  } catch (error) {
    const cached = readCachedUpdate()
    const currentVersion = getCurrentVersion()

    if (cached && cached.mandatory && compareVersions(cached.version, currentVersion) > 0) {
      return {
        currentVersion,
        available: true,
        canInstall: isInstallSupported(),
        online: false,
        source: 'cache',
        checkError: error.message,
        update: cached,
      }
    }

    return {
      currentVersion,
      available: false,
      canInstall: isInstallSupported(),
      online: false,
      source: 'unavailable',
      checkError: error.message,
      update: null,
    }
  }
}

async function downloadUpdate(metadata, destination) {
  const response = await fetch(metadata.downloadUrl, {
    headers: { 'User-Agent': `CoachingOS/${getCurrentVersion()}` },
    redirect: 'follow',
    signal: AbortSignal.timeout(600000),
  })

  if (!response.ok || !response.body) {
    throw new Error(`Update download failed with HTTP ${response.status}`)
  }

  const contentLength = Number(response.headers.get('content-length') || 0)
  if (contentLength > MAX_UPDATE_BYTES) {
    throw new Error('The update package is too large')
  }

  let downloadedBytes = 0
  const hash = crypto.createHash('sha256')
  const source = Readable.fromWeb(response.body)
  const verifier = new Transform({
    transform(chunk, _encoding, callback) {
      downloadedBytes += chunk.length
      if (downloadedBytes > MAX_UPDATE_BYTES) {
        callback(new Error('The update package is too large'))
        return
      }
      hash.update(chunk)
      callback(null, chunk)
    },
  })

  try {
    await pipeline(source, verifier, fs.createWriteStream(destination))
  } catch (error) {
    fs.rmSync(destination, { force: true })
    throw error
  }
  if (hash.digest('hex') !== metadata.sha256) {
    fs.rmSync(destination, { force: true })
    throw new Error('The downloaded update failed its integrity check')
  }
}

function extractUpdate(zipPath, destination) {
  fs.rmSync(destination, { recursive: true, force: true })
  fs.mkdirSync(destination, { recursive: true })
  const escapePowerShellLiteral = (value) => String(value).replace(/'/g, "''")
  const command = `Expand-Archive -LiteralPath '${escapePowerShellLiteral(zipPath)}' -DestinationPath '${escapePowerShellLiteral(destination)}' -Force`

  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-Command', command,
  ], {
    windowsHide: true,
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || 'Could not extract the update package')
  }
}

async function prepareAndLaunchUpdate() {
  if (!isInstallSupported()) {
    throw new Error('Automatic installation is only available in the installed Windows application')
  }

  const result = await checkForUpdate()
  if (!result.online) {
    throw new Error('Connect to the internet before installing the update')
  }
  if (!result.available || !result.update) {
    throw new Error('No newer update is available')
  }

  const updateDirectory = getUpdateDirectory()
  const packageDirectory = path.join(updateDirectory, `auto-${result.update.version}`)
  const zipPath = path.join(updateDirectory, result.update.assetName)
  fs.mkdirSync(updateDirectory, { recursive: true })

  await downloadUpdate(result.update, zipPath)
  extractUpdate(zipPath, packageDirectory)

  const updaterPath = path.join(packageDirectory, 'CoachingOSUpdater.exe')
  const payloadPath = path.join(packageDirectory, 'update-package', 'update-manifest.json')
  if (!fs.existsSync(updaterPath) || !fs.existsSync(payloadPath)) {
    throw new Error('The update package does not contain the required updater files')
  }

  const child = spawn(updaterPath, [process.cwd()], {
    cwd: packageDirectory,
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  })
  child.unref()

  return {
    version: result.update.version,
    message: 'The updater is starting. CoachingOS will reopen when the update is complete.',
  }
}

module.exports = {
  checkForUpdate,
  compareVersions,
  getCurrentVersion,
  isInstallSupported,
  prepareAndLaunchUpdate,
}
