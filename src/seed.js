require('dotenv').config();
const prisma = require('./prisma');

// Preços em centavos (ex.: 5990 = R$ 59,90).
const produtos = [
  { name: 'Camiseta Básica',   category: 'Roupas',     price: 5990,  emoji: '👕', description: 'Algodão premium, disponível em vários tamanhos.' },
  { name: 'Tênis Casual',      category: 'Calçados',   price: 19990, emoji: '👟', description: 'Confortável para o dia a dia.' },
  { name: 'Boné Aba Curva',    category: 'Acessórios', price: 4990,  emoji: '🧢', description: 'Ajuste traseiro, tamanho único.' },
  { name: 'Mochila',           category: 'Acessórios', price: 14990, emoji: '🎒', description: 'Compartimento acolchoado para notebook.' },
  { name: 'Moletom com Capuz', category: 'Roupas',     price: 12990, emoji: '🧥', description: 'Bolso canguru, bem quentinho.' },
  { name: 'Óculos de Sol',     category: 'Acessórios', price: 8990,  emoji: '🕶️', description: 'Proteção UV400, estojo incluso.' },
  { name: 'Relógio Esportivo', category: 'Acessórios', price: 25990, emoji: '⌚', description: 'À prova d\'água, pulseira de silicone.' },
  { name: 'Chinelo Slide',     category: 'Calçados',   price: 3990,  emoji: '🩴', description: 'Leve, macio e resistente.' },
];

async function main() {
  const count = await prisma.product.count();
  if (count > 0) {
    console.log(`Seed pulado — já existem ${count} produtos.`);
    return;
  }
  await prisma.product.createMany({ data: produtos });
  console.log(`Seed concluído — ${produtos.length} produtos criados.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
