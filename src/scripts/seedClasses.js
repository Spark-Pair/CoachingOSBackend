require('dotenv').config()

const mongoose = require('mongoose')
const connectDb = require('../config/db')
const Class = require('../models/Class')

function ordinal(grade) {
  const mod100 = grade % 100
  if (mod100 >= 11 && mod100 <= 13) return `${grade}th`
  switch (grade % 10) {
    case 1:
      return `${grade}st`
    case 2:
      return `${grade}nd`
    case 3:
      return `${grade}rd`
    default:
      return `${grade}th`
  }
}

function buildClassNames() {
  const sections = ['A', 'B', 'C', 'D']
  const names = []

  for (let grade = 1; grade <= 10; grade += 1) {
    for (const section of sections) {
      names.push(`${ordinal(grade)}-${section}`)
    }
  }

  return names
}

async function seedClasses() {
  await connectDb()

  const classNames = buildClassNames()
  const existing = await Class.find({ name: { $in: classNames } }).select('name').lean()
  const existingNames = new Set(existing.map((item) => item.name))
  const toCreate = classNames.filter((name) => !existingNames.has(name))

  if (toCreate.length === 0) {
    console.log('Seed classes: nothing to create (already present).')
    return
  }

  await Class.insertMany(toCreate.map((name) => ({ name, status: 'Active' })), { ordered: false })
  console.log(`Seed classes: created ${toCreate.length} classes.`)
}

seedClasses()
  .then(() => mongoose.disconnect())
  .catch((error) => {
    console.error('Seed classes failed:', error.message)
    mongoose.disconnect().finally(() => process.exit(1))
  })

