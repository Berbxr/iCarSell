require('dotenv').config();
const prisma = require('../src/config/prisma');
const { hashPassword } = require('../src/utils/password');

async function main() {
  let sucursal = await prisma.sucursal.findFirst();
  if (!sucursal) {
    sucursal = await prisma.sucursal.create({
      data: { nombre: 'Matriz', serieFolio: 'A', ciudadEstado: 'Mexicali, Baja California' },
    });
    console.log('Sucursal "Matriz" creada.');
  }
  const existe = await prisma.usuario.findUnique({ where: { username: 'admin' } });
  if (existe) { console.log('El usuario admin ya existe.'); return; }
  const passwordHash = await hashPassword(process.env.ADMIN_PASSWORD_INICIAL || 'Cambiar123');
  await prisma.usuario.create({ data: { username: 'admin', passwordHash, rol: 'ADMIN', debeCambiarPassword: true } });
  await prisma.configuracion.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  console.log('Usuario admin creado (contraseña temporal: Cambiar123).');
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
