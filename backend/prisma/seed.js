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
  const RANGOS_DEFAULT = [
    { orden: 1, desdeUsd: 0, monto: 1000 },
    { orden: 2, desdeUsd: 6000, monto: 1600 },
    { orden: 3, desdeUsd: 10000, monto: 2600 },
  ];
  if ((await prisma.rangoComision.count()) === 0) {
    await prisma.rangoComision.createMany({ data: RANGOS_DEFAULT });
    console.log('Rangos de comisión por defecto creados.');
  }

  // Backfill: calcular comisión de ventas existentes que aún no la tienen.
  const { calcularComision } = require('../src/utils/comision');
  const rangos = await prisma.rangoComision.findMany();
  const ventasSinComision = await prisma.venta.findMany({
    where: { comision: 0 },
    include: { vehiculo: { select: { precioVenta: true } } },
  });
  for (const v of ventasSinComision) {
    const monto = calcularComision(v.vehiculo?.precioVenta ?? 0, rangos);
    if (monto > 0) await prisma.venta.update({ where: { id: v.id }, data: { comision: monto } });
  }
  if (ventasSinComision.length) console.log(`Backfill de comisión en ${ventasSinComision.length} venta(s).`);

  const existe = await prisma.usuario.findUnique({ where: { username: 'admin' } });
  if (existe) { console.log('El usuario admin ya existe.'); return; }
  const passwordHash = await hashPassword(process.env.ADMIN_PASSWORD_INICIAL || 'Cambiar123');
  await prisma.usuario.create({ data: { username: 'admin', passwordHash, rol: 'ADMIN', debeCambiarPassword: true } });
  await prisma.configuracion.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  console.log('Usuario admin creado (contraseña temporal: Cambiar123).');
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
