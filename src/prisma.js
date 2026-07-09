const { PrismaClient } = require('@prisma/client');

// Uma única instância do Prisma para todo o app.
const prisma = new PrismaClient();

module.exports = prisma;
