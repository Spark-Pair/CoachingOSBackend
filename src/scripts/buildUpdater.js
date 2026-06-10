const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const esbuild = require('esbuild')

const root = path.resolve(__dirname, '../..')
const buildDirectory = path.join(root, 'build-updater')
const outputDirectory = path.resolve(root, '../ManualUpdate')
const bundlePath = path.join(buildDirectory, 'updater-bundle.cjs')
const blobPath = path.join(buildDirectory, 'updater-sea.blob')
const seaConfigPath = path.join(buildDirectory, 'sea-config.json')
const executablePath = path.join(outputDirectory, 'CoachingOSUpdater.exe')
const postjectPath = path.join(root, 'node_modules', '.bin', 'postject.cmd')

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: command.toLowerCase().endsWith('.cmd'),
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}

fs.rmSync(buildDirectory, { recursive: true, force: true })
fs.mkdirSync(buildDirectory, { recursive: true })
fs.mkdirSync(outputDirectory, { recursive: true })

esbuild.buildSync({
  entryPoints: [path.join(root, 'src/updater.js')],
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

console.log(`Updater executable created: ${executablePath}`)
