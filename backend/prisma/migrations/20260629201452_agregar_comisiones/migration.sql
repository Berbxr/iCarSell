-- AlterTable
ALTER TABLE "Venta" ADD COLUMN     "comision" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "RangoComision" (
    "id" SERIAL NOT NULL,
    "orden" INTEGER NOT NULL,
    "desdeUsd" DOUBLE PRECISION NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RangoComision_pkey" PRIMARY KEY ("id")
);
