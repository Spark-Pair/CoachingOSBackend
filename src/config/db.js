const mongoose = require('mongoose')

function buildDirectMongoUri(mongoUri) {
  const atlasHosts = process.env.MONGO_ATLAS_HOSTS
  const replicaSet = process.env.MONGO_ATLAS_REPLICA_SET

  if (!atlasHosts || !replicaSet || !mongoUri.startsWith('mongodb+srv://')) {
    return null
  }

  const uri = new URL(mongoUri)
  const hosts = atlasHosts
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean)
    .map((host) => (host.includes(':') ? host : `${host}:27017`))
    .join(',')

  if (!hosts) {
    return null
  }

  const params = new URLSearchParams(uri.search)
  params.set('ssl', 'true')
  params.set('authSource', params.get('authSource') || 'admin')
  params.set('replicaSet', replicaSet)

  return `mongodb://${uri.username}:${uri.password}@${hosts}${uri.pathname}?${params.toString()}`
}

async function connectMongo(mongoUri) {
  try {
    await mongoose.connect(mongoUri)
  } catch (error) {
    const directMongoUri = buildDirectMongoUri(mongoUri)
    const isSrvDnsRefused = error.code === 'ECONNREFUSED' && error.message.includes('querySrv')

    if (!directMongoUri || !isSrvDnsRefused) {
      throw error
    }

    console.warn('MongoDB SRV lookup failed; retrying with direct Atlas hosts')
    await mongoose.connect(directMongoUri)
  }
}

async function connectDb() {
  const mongoUri = process.env.MONGO_URI

  if (!mongoUri) {
    throw new Error('MONGO_URI is required')
  }

  await connectMongo(mongoUri)
  console.log('MongoDB connected')
}

module.exports = connectDb
