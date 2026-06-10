const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawnSync } = require('child_process')

const root = path.resolve(__dirname, '../..')
const workspace = path.resolve(root, '..')
const releaseDirectory = path.join(workspace, 'LocalInstallation')
const updateDirectory = path.join(workspace, 'ManualUpdate')
const payloadDirectory = path.join(updateDirectory, 'update-package')
const version = process.env.COACHINGOS_VERSION || '1.1.0'

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    stdio: 'inherit',
    shell: command.toLowerCase().endsWith('.cmd'),
    env: { ...process.env, ...(options.env || {}) },
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}

run('npm.cmd', ['run', 'release:local'])

fs.rmSync(updateDirectory, { recursive: true, force: true })
fs.mkdirSync(payloadDirectory, { recursive: true })

for (const relativePath of [
  'CoachingOS.exe',
  'frontend',
  'Start CoachingOS.bat',
  'Install License.bat',
  'INSTALLATION GUIDE.txt',
]) {
  fs.cpSync(
    path.join(releaseDirectory, relativePath),
    path.join(payloadDirectory, relativePath),
    { recursive: true },
  )
}

fs.writeFileSync(path.join(payloadDirectory, 'version.json'), JSON.stringify({
  version,
  builtAt: new Date().toISOString(),
}, null, 2))

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath]
  })
}

const manifestFiles = listFiles(payloadDirectory).map((filePath) => ({
  path: path.relative(payloadDirectory, filePath).replace(/\\/g, '/'),
  sha256: crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'),
}))

fs.writeFileSync(path.join(payloadDirectory, 'update-manifest.json'), JSON.stringify({
  version,
  files: manifestFiles,
}, null, 2))

for (const fileName of ['RUN UPDATE.bat', 'UPDATE GUIDE.txt']) {
  fs.copyFileSync(path.join(root, 'deployment', fileName), path.join(updateDirectory, fileName))
}

run('npm.cmd', ['run', 'package:updater'])

console.log(`Manual update package prepared: ${updateDirectory}`)
