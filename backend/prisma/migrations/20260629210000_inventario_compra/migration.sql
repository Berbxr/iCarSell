-- 1) Nuevos valores de enum (no se usan en esta misma migración)
ALTER TYPE "Rol" ADD VALUE 'ALMACEN';
ALTER TYPE "EstadoVehiculo" ADD VALUE 'EN_COMPRA';

-- 2) Nuevas columnas de costo y fecha
ALTER TABLE "Vehiculo" ADD COLUMN "precioCompra" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Vehiculo" ADD COLUMN "comisionProveedor" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Vehiculo" ADD COLUMN "transporte" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Vehiculo" ADD COLUMN "registroPlacas" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Vehiculo" ADD COLUMN "salidas" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Vehiculo" ADD COLUMN "fechaPaseAVenta" TIMESTAMP(3);

-- 3) Preservar datos existentes ANTES de eliminar costoCompra
UPDATE "Vehiculo" SET "precioCompra" = "costoCompra";
UPDATE "Vehiculo" SET "fechaPaseAVenta" = "fechaIngreso"
  WHERE "estado" IN ('DISPONIBLE','RESERVADO','VENDIDO');

-- 4) Eliminar la columna vieja
ALTER TABLE "Vehiculo" DROP COLUMN "costoCompra";

-- 5) Tabla de gastos
CREATE TABLE "GastoVehiculo" (
  "id" SERIAL NOT NULL,
  "vehiculoId" INTEGER NOT NULL,
  "descripcion" TEXT NOT NULL,
  "monto" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GastoVehiculo_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "GastoVehiculo" ADD CONSTRAINT "GastoVehiculo_vehiculoId_fkey"
  FOREIGN KEY ("vehiculoId") REFERENCES "Vehiculo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
