const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')

const root = path.resolve(__dirname, '../..')
const keyDirectory = process.env.COACHINGOS_LICENSE_KEY_DIR
  ? path.resolve(process.env.COACHINGOS_LICENSE_KEY_DIR)
  : path.join(os.homedir(), '.coachingos-license-keys')
const privateKeyPath = path.join(keyDirectory, 'private.pem')
const publicKeyPath = path.join(keyDirectory, 'public.pem')
const publicKeyModulePath = path.join(root, 'src/config/licensePublicKey.js')

if (fs.existsSync(privateKeyPath)) {
  console.error('License keys already exist. Delete .license-keys manually only if you intend to invalidate all old licenses.')
  process.exit(1)
}

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 3072,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

fs.mkdirSync(keyDirectory, { recursive: true })
fs.writeFileSync(privateKeyPath, privateKey, { encoding: 'utf8', mode: 0o600 })
fs.writeFileSync(publicKeyPath, publicKey, 'utf8')
fs.writeFileSync(publicKeyModulePath, `module.exports = ${JSON.stringify(publicKey)}\n`, 'utf8')

console.log(`Private key: ${privateKeyPath}`)
console.log(`Public key embedded at: ${publicKeyModulePath}`)
console.log('Back up the private key securely. Never ship it with customer installations.')
