const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawnSync } = require('child_process')

const root = path.resolve(__dirname, '../..')
const workspace = path.resolve(root, '..')
const frontendRoot = path.join(workspace, 'CoachingOS')
const releaseDirectory = path.join(workspace, 'LocalInstallation')
const frontendOutput = path.join(releaseDirectory, 'frontend')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    stdio: 'inherit',
    shell: command.toLowerCase().endsWith('.cmd'),
    env: { ...process.env, ...(options.env || {}) },
  })
  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status || 1)
}

fs.rmSync(releaseDirectory, { recursive: true, force: true })
fs.mkdirSync(releaseDirectory, { recursive: true })

run('npm.cmd', ['run', 'build'], {
  cwd: frontendRoot,
  env: { VITE_API_URL: '/api' },
})
fs.cpSync(path.join(frontendRoot, 'dist'), frontendOutput, { recursive: true })

run('npm.cmd', ['run', 'package:exe'], { cwd: root })

for (const fileName of ['config.env.local.example', 'Start CoachingOS.bat', 'Install License.bat', 'INSTALLATION GUIDE.txt']) {
  const targetName = fileName === 'config.env.local.example' ? 'config.env' : fileName
  fs.copyFileSync(path.join(root, 'deployment', fileName), path.join(releaseDirectory, targetName))
}

const envPath = path.join(releaseDirectory, 'config.env')
const envContents = fs.readFileSync(envPath, 'utf8').replace(
  'CHANGE_THIS_TO_A_LONG_RANDOM_SECRET_BEFORE_INSTALLATION',
  crypto.randomBytes(48).toString('hex'),
)
fs.writeFileSync(envPath, envContents, 'utf8')

console.log(`Local installation package prepared: ${releaseDirectory}`)
