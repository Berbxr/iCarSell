-- Configuracion.mostrarGastosAutos: controla si los costos de Compra (los 5 fijos +
-- "Otros costos/gastos" del inventario) se muestran en el módulo de Gastos generales
-- como categoría "Gastos de autos". Oculto por defecto.
ALTER TABLE "Configuracion" ADD COLUMN "mostrarGastosAutos" BOOLEAN NOT NULL DEFAULT false;
