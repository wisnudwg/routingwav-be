import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import * as argon2 from 'argon2'
import { PrismaClient } from '../generated/prisma/client'

const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as argon2.HashOptions

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Never run the dev seed in production.')

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL as string }),
  })

  const account = await prisma.account.upsert({
    where: { alias: 'demo-studio' },
    update: {},
    create: { alias: 'demo-studio', phone: '+6281234567890', country: 'ID', address: 'Jl. Contoh No. 1, Bandung' },
  })

  await prisma.user.upsert({
    where: { email: 'owner@example.com' },
    update: {},
    create: {
      type: 'ROOT',
      accountId: account.id,
      email: 'owner@example.com',
      name: 'Demo Owner',
      passwordHash: await argon2.hash('Passw0rd!Owner1', OPTIONS),
      emailVerifiedAt: new Date(),
      termsAcceptedAt: new Date(),
      termsVersion: 'seed',
    },
  })

  await prisma.profile.upsert({
    where: { accountId_kind: { accountId: account.id, kind: 'TALENT' } },
    update: {},
    create: { accountId: account.id, kind: 'TALENT', roles: ['Mixing Engineer'] },
  })

  const member = await prisma.user.findFirst({ where: { accountId: account.id, username: 'budi' } })
  if (!member) {
    await prisma.user.create({
      data: {
        type: 'IAM',
        accountId: account.id,
        username: 'budi',
        name: 'Budi',
        passwordHash: await argon2.hash('Temp1234!', OPTIONS),
        mustChangePassword: true,
        permissions: ['mode:talent', 'talent:sales.view', 'messages:view'],
      },
    })
  }

  console.log('Seeded. Owner: owner@example.com / Passw0rd!Owner1')
  console.log('Member: account demo-studio, username budi, temporary password Temp1234! (must change)')
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})