const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { canonicalPayload } = require('../services/licenseService')

function argument(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : ''
}

function validDate(value) {
  const date = new Date(value)
  return !Number.isNaN(date.getTime())
}

const customer = argument('customer').trim()
const expires = argument('expires').trim()
const outputArgument = argument('output').trim()
const root = path.resolve(__dirname, '../..')
const privateKeyPath = process.env.COACHINGOS_LICENSE_PRIVATE_KEY
  ? path.resolve(process.env.COACHINGOS_LICENSE_PRIVATE_KEY)
  : path.join(
    process.env.COACHINGOS_LICENSE_KEY_DIR
      ? path.resolve(process.env.COACHINGOS_LICENSE_KEY_DIR)
      : path.join(os.homedir(), '.coachingos-license-keys'),
    'private.pem',
  )

if (!customer || !validDate(expires)) {
  console.error('Usage: npm run license:create -- --customer "Iqbal Coaching" --expires 2027-06-07 [--output path]')
  process.exit(1)
}
if (!fs.existsSync(privateKeyPath)) {
  console.error(`Private key not found: ${privateKeyPath}`)
  console.error('Run npm run license:keys once on the developer machine.')
  process.exit(1)
}

const expiresAt = new Date(`${expires.slice(0, 10)}T23:59:59.999Z`)
const payload = {
  licenseId: crypto.randomUUID(),
  customer,
  issuedAt: new Date().toISOString(),
  expiresAt: expiresAt.toISOString(),
}
const signature = crypto.sign(
  'sha256',
  Buffer.from(canonicalPayload(payload)),
  fs.readFileSync(privateKeyPath, 'utf8'),
).toString('base64')
const outputPath = outputArgument
  ? path.resolve(outputArgument)
  : path.join(
    os.homedir(),
    'CoachingOS-Licenses',
    `${customer.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}-${expires}.license.json`,
  )

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify({ payload, signature }, null, 2)}\n`, 'utf8')
console.log(`License created: ${outputPath}`)
console.log(`Expires: ${payload.expiresAt}`)
