const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const esbuild = require('esbuild')

const root = path.resolve(__dirname, '../..')
const buildDirectory = path.join(root, 'build')
const releaseDirectory = path.resolve(root, '../LocalInstallation')
const bundlePath = path.join(buildDirectory, 'backend-bundle.cjs')
const blobPath = path.join(buildDirectory, 'coachingos-sea.blob')
const seaConfigPath = path.join(buildDirectory, 'sea-config.json')
const executablePath = path.join(releaseDirectory, 'CoachingOS.exe')
const postjectPath = path.join(root, 'node_modules', '.bin', 'postject.cmd')

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: command.toLowerCase().endsWith('.cmd'),
  })
  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status || 1)
}

fs.rmSync(buildDirectory, { recursive: true, force: true })
fs.mkdirSync(buildDirectory, { recursive: true })
fs.mkdirSync(releaseDirectory, { recursive: true })

esbuild.buildSync({
  entryPoints: [path.join(root, 'src/server.js')],
  outfile: bundlePath,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  minify: false,
  sourcemap: false,
  logLevel: 'info',
})

fs.writeFileSync(seaConfigPath, JSON.stringify({
  main: bundlePath,
  output: blobPath,
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false,
}, null, 2))

run(process.execPath, ['--experimental-sea-config', seaConfigPath])
fs.copyFileSync(process.execPath, executablePath)
run(postjectPath, [
  executablePath,
  'NODE_SEA_BLOB',
  blobPath,
  '--sentinel-fuse',
  'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
])

console.log(`Backend executable created: ${executablePath}`)
