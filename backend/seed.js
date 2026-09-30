require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);
  
  const admin = await prisma.user.upsert({
    where: { email: 'admin@stock.com' },
    update: {},
    create: {
      name: 'Super Admin',
      email: 'admin@stock.com',
      password: hashedPassword,
      role: 'ADMIN',
    },
  });

  console.log('Seed completed. Admin:', admin.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
