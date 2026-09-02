-- AlterTable
ALTER TABLE "Vehiculo" ADD COLUMN     "fechaCompra" TIMESTAMP(3),
ADD COLUMN     "fechaComisionProveedor" TIMESTAMP(3),
ADD COLUMN     "fechaTransporte" TIMESTAMP(3),
ADD COLUMN     "fechaRegistroPlacas" TIMESTAMP(3),
ADD COLUMN     "fechaSalidas" TIMESTAMP(3);

-- Backfill: para vehículos ya existentes no hay una fecha real capturada por cada costo,
-- así que se usa la fecha de ingreso a inventario como mejor aproximación disponible.
-- El usuario puede corregirla manualmente si conoce la fecha real de algún costo.
UPDATE "Vehiculo" SET
  "fechaCompra" = "fechaIngreso",
  "fechaComisionProveedor" = "fechaIngreso",
  "fechaTransporte" = "fechaIngreso",
  "fechaRegistroPlacas" = "fechaIngreso",
  "fechaSalidas" = "fechaIngreso";
