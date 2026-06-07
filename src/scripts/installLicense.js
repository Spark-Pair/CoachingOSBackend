const fs = require('fs')
const path = require('path')
const {
  getLicenseDirectory,
  getLicensePath,
  verifyLicenseDocument,
} = require('../services/licenseService')

const sourceArgument = process.argv[2]
if (!sourceArgument) {
  console.error('Usage: npm run license:install -- C:\\path\\customer.license.json')
  process.exit(1)
}

const sourcePath = path.resolve(sourceArgument)
if (!fs.existsSync(sourcePath)) {
  console.error(`License file not found: ${sourcePath}`)
  process.exit(1)
}

const document = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))
if (!verifyLicenseDocument(document)) {
  console.error('License signature is invalid.')
  process.exit(1)
}

fs.mkdirSync(getLicenseDirectory(), { recursive: true })
fs.copyFileSync(sourcePath, getLicensePath())
console.log(`License installed: ${getLicensePath()}`)
console.log(`Customer: ${document.payload.customer}`)
console.log(`Expires: ${document.payload.expiresAt}`)
