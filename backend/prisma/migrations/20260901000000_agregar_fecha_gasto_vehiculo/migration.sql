-- AlterTable
ALTER TABLE "GastoVehiculo" ADD COLUMN     "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill: los gastos ya existentes heredan como fecha del gasto su fecha de registro original,
-- en vez de quedar todos fechados al momento de aplicar esta migración.
UPDATE "GastoVehiculo" SET "fecha" = "createdAt";
