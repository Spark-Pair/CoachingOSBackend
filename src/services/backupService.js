const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const mongoose = require('mongoose')
const { EJSON } = require('bson')

const BACKUP_FORMAT = 'coachingos-backup'
const BACKUP_VERSION = 1
const MAX_BACKUP_BYTES = 512 * 1024 * 1024
const MAX_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024

function getDatabase() {
  const database = mongoose.connection.db

  if (!database) {
    throw new Error('Database is not connected')
  }

  return database
}

function getBackupDirectory() {
  if (process.env.COACHINGOS_BACKUP_DIR) {
    return path.resolve(process.env.COACHINGOS_BACKUP_DIR)
  }

  const dataDirectory = process.env.COACHINGOS_LICENSE_DIR
    || (process.platform === 'win32'
      ? path.join(process.env.ProgramData || 'C:\\ProgramData', 'CoachingOS')
      : path.join(process.cwd(), 'data'))

  return path.join(dataDirectory, 'Backups')
}

function createTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function createBackupFileName(prefix = 'CoachingOS-backup') {
  return `${prefix}-${createTimestamp()}.coachingos-backup`
}

async function buildBackupPayload() {
  const database = getDatabase()
  const collectionInfos = await database.listCollections({}, { nameOnly: true }).toArray()
  const collectionNames = collectionInfos
    .map(({ name }) => name)
    .filter((name) => !name.startsWith('system.'))
    .sort()
  const collections = []

  for (const name of collectionNames) {
    const collection = database.collection(name)
    const [documents, indexes] = await Promise.all([
      collection.find({}).toArray(),
      collection.indexes(),
    ])

    collections.push({
      name,
      documents,
      indexes: indexes.filter((index) => index.name !== '_id_'),
    })
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date(),
    database: database.databaseName,
    collections,
  }
}

async function createBackupBuffer() {
  const payload = await buildBackupPayload()
  const serialized = EJSON.stringify(payload, { relaxed: false })
  return zlib.gzipSync(Buffer.from(serialized, 'utf8'), { level: zlib.constants.Z_BEST_COMPRESSION })
}

function parseBackupBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('The selected backup file is empty')
  }

  if (buffer.length > MAX_BACKUP_BYTES) {
    throw new Error('The selected backup file is too large')
  }

  let payload

  try {
    const uncompressed = zlib.gunzipSync(buffer, { maxOutputLength: MAX_UNCOMPRESSED_BYTES })
    payload = EJSON.parse(uncompressed.toString('utf8'))
  } catch {
    throw new Error('The selected file is not a valid CoachingOS backup')
  }

  if (
    payload?.format !== BACKUP_FORMAT
    || payload?.version !== BACKUP_VERSION
    || !Array.isArray(payload?.collections)
  ) {
    throw new Error('This backup format is not supported')
  }

  const names = new Set()
  for (const collection of payload.collections) {
    if (
      !collection
      || typeof collection.name !== 'string'
      || collection.name.startsWith('system.')
      || names.has(collection.name)
      || !Array.isArray(collection.documents)
      || !Array.isArray(collection.indexes)
    ) {
      throw new Error('The backup contains invalid collection data')
    }
    names.add(collection.name)
  }

  return payload
}

async function saveSafetyBackup() {
  const backupDirectory = getBackupDirectory()
  fs.mkdirSync(backupDirectory, { recursive: true })
  const fileName = createBackupFileName('Before-restore')
  const filePath = path.join(backupDirectory, fileName)
  const buffer = await createBackupBuffer()
  fs.writeFileSync(filePath, buffer)
  return { buffer, filePath }
}

function cleanIndex(index) {
  const {
    v,
    ns,
    background,
    ...definition
  } = index

  return definition
}

async function applyBackupPayload(payload) {
  const database = getDatabase()
  const existingCollections = await database.listCollections({}, { nameOnly: true }).toArray()

  for (const { name } of existingCollections) {
    if (!name.startsWith('system.')) {
      await database.collection(name).drop()
    }
  }

  for (const collectionBackup of payload.collections) {
    const collection = await database.createCollection(collectionBackup.name)

    if (collectionBackup.documents.length > 0) {
      await collection.insertMany(collectionBackup.documents, { ordered: true })
    }

    const indexes = collectionBackup.indexes.map(cleanIndex)
    if (indexes.length > 0) {
      await collection.createIndexes(indexes)
    }
  }
}

async function restoreBackupBuffer(buffer) {
  const payload = parseBackupBuffer(buffer)
  const safetyBackup = await saveSafetyBackup()

  try {
    await applyBackupPayload(payload)
  } catch (error) {
    try {
      await applyBackupPayload(parseBackupBuffer(safetyBackup.buffer))
    } catch (rollbackError) {
      error.message = `${error.message}. Automatic rollback also failed: ${rollbackError.message}`
    }
    throw error
  }

  return {
    safetyBackupPath: safetyBackup.filePath,
    backupCreatedAt: payload.createdAt,
    collectionCount: payload.collections.length,
  }
}

module.exports = {
  MAX_BACKUP_BYTES,
  createBackupBuffer,
  createBackupFileName,
  getBackupDirectory,
  restoreBackupBuffer,
}
