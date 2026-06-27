# iCarSell

Sistema multi-sucursal de venta de autos (inventario, ventas con folio y contrato PDF, reportes y dashboard).

## Stack

- **Backend:** Node + Express + Prisma + PostgreSQL (JWT, roles ADMIN/VENDEDOR).
- **Frontend:** React (Vite) + React Router + Axios.
- **Contrato PDF:** plantilla HTML + puppeteer-core (Chromium).
- **Despliegue:** Docker Compose (db, backend, frontend-nginx).

## Levantar con Docker

```bash
cp .env.example .env
docker compose up --build -d
```

- App: http://localhost:8082
- Login inicial: `admin` / `Cambiar123` (se exige cambiar la contraseña al ingresar).

## Desarrollo local (tests y migraciones)

La base de datos debe estar arriba y `backend/.env` debe apuntar a `localhost:5437`:

```bash
docker compose up -d db
cd backend
npm install
npx prisma migrate dev      # aplica/crea migraciones
npm test                    # corre la suite (Jest + Supertest)
```

## Puertos

- Frontend (nginx): `8082`
- PostgreSQL: `5437`
- Backend (interno): `4000`
