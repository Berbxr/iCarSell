-- CreateEnum
CREATE TYPE "EstadoVenta" AS ENUM ('ACTIVA', 'CANCELADA');

-- DropIndex
DROP INDEX "Venta_vehiculoId_key";

-- AlterTable
ALTER TABLE "Venta" ADD COLUMN     "canceladaEn" TIMESTAMP(3),
ADD COLUMN     "descuento" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "estado" "EstadoVenta" NOT NULL DEFAULT 'ACTIVA',
ADD COLUMN     "motivoCancelacion" TEXT;
