-- Tipo de cambio
ALTER TABLE "Configuracion" ADD COLUMN "tipoCambioDolar" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Método de pago
CREATE TYPE "MetodoPago" AS ENUM ('EFECTIVO', 'TRANSFERENCIA');
ALTER TABLE "Venta" ADD COLUMN "metodoPago" "MetodoPago" NOT NULL DEFAULT 'EFECTIVO';

-- Gastos generales
CREATE TABLE "GastoGeneral" (
  "id" SERIAL NOT NULL,
  "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "categoria" TEXT NOT NULL,
  "descripcion" TEXT NOT NULL,
  "monto" DOUBLE PRECISION NOT NULL,
  "sucursalId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GastoGeneral_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "GastoGeneral" ADD CONSTRAINT "GastoGeneral_sucursalId_fkey"
  FOREIGN KEY ("sucursalId") REFERENCES "Sucursal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Socios
CREATE TABLE "Socio" (
  "id" SERIAL NOT NULL,
  "nombre" TEXT NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Socio_pkey" PRIMARY KEY ("id")
);
INSERT INTO "Socio" ("nombre") VALUES ('Sin asignar');

-- socioId: nullable, backfill al socio inicial, luego NOT NULL + FK
ALTER TABLE "Vehiculo" ADD COLUMN "socioId" INTEGER;
UPDATE "Vehiculo" SET "socioId" = (SELECT "id" FROM "Socio" ORDER BY "id" ASC LIMIT 1);
ALTER TABLE "Vehiculo" ALTER COLUMN "socioId" SET NOT NULL;
ALTER TABLE "Vehiculo" ADD CONSTRAINT "Vehiculo_socioId_fkey"
  FOREIGN KEY ("socioId") REFERENCES "Socio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
