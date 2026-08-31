# Jenkins CI/CD para iCarSell — Diseño

**Fecha:** 2026-08-30
**Estado:** Aprobado, pendiente de implementación

## Contexto

iCarSell corre en producción en un VPS de IONOS (`74.208.32.129`, Debian 12,
4 CPU / 3.8GB RAM / 118GB disco) **dedicado exclusivamente a este proyecto**.
El dominio `empalmemotors.com` apunta ahí vía Nginx nativo (HTTPS con
Certbot) que hace proxy a `127.0.0.1:8082` (contenedor `icarsell-frontend`).

Auditoría del servidor (2026-08-30) encontró tres problemas que hay que
resolver antes de automatizar despliegues:

1. El repo en `/root/apps/iCarSell` está en la rama `feat/implementacion-inicial`
   (9 commits locales sin subir a `origin`), no en `master`, aunque por
   coincidencia el HEAD tiene los mismos commits recientes que `master`.
2. Hay un cambio **local sin commitear** en `docker-compose.yml`: los puertos
   de `db` y `frontend` están enlazados a `127.0.0.1` en vez de `0.0.0.0`
   (hardening correcto, pero invisible para git — un `git reset --hard`
   automático lo borraría).
3. Hay archivos de respaldo `.sql` sueltos y sin trackear dentro del propio
   directorio del repo.

Se generó y descargó un respaldo de la base de datos de producción antes de
iniciar cualquier cambio: `backups/icarsell_backup_20260831_015556.sql`
(local, en `C:\Proyectos\iCarSell\backups\`, y también en el VPS en
`/root/backups/icarsell/`, ambos fuera del control de git).

## Objetivo

Que cada push a `master` en GitHub se despliegue solo en el VPS, sin
intervención manual, sin exponer superficie nueva a internet, y sin arriesgar
los datos de producción.

## Decisiones (acordadas con el usuario)

- **Acceso a Jenkins:** solo por túnel SSH (`127.0.0.1:8080` en el VPS, sin
  publicar en internet). El trigger de despliegue es por *polling* a GitHub
  (no webhook público), así no hace falta dominio nuevo ni Certbot adicional.
- **Cómo corre Jenkins:** como contenedor Docker (`jenkins/jenkins:lts-jdk21`
  extendido), no instalado nativo en el host — decisión explícita del
  usuario pese a la alternativa nativa (más simple para el socket de
  Docker) que se le presentó como opción.

## Corrección durante implementación (2026-08-31)

Un review de seguridad automático sobre el commit del overlay detectó que
**Docker Compose fusiona la lista `ports` de forma aditiva** entre archivos
`-f`, no la reemplaza: el `docker-compose.prod.yml` original no anulaba el
binding a `0.0.0.0` del archivo base, solo agregaba uno adicional a
`127.0.0.1` — el servicio quedaba expuesto en ambos, es decir, el hardening
no protegía nada. Se corrigió eliminando el overlay y aplicando el binding
a `127.0.0.1` directo en `docker-compose.yml` base (sección 1 actualizada
abajo); no hay overlay de producción distinto al de desarrollo.

## Arquitectura

### 1. Saneamiento del repo en el VPS (antes de Jenkins)

- El hardening de puertos vive directo en **`docker-compose.yml`** (un solo
  archivo, sin overlay — ver corrección arriba):
  ```yaml
  services:
    db:
      ports:
        - "127.0.0.1:5437:5432"
    frontend:
      ports:
        - "127.0.0.1:${HTTP_PORT:-8082}:80"
  ```
  Esto no rompe el desarrollo local (`127.0.0.1` sigue siendo accesible
  desde la misma máquina), tal cual está documentado en el README.
- En el VPS: descartar el diff local de `docker-compose.yml`
  (`git checkout -- docker-compose.yml`), cambiar a `master`
  (`git checkout master && git pull origin master`).
- Mover `icarsell_backup*.sql` y `backups/` fuera del repo (ya se movieron a
  `/root/backups/icarsell/`); agregar `backups/` y `*.sql` a `.gitignore`.
- Redeploy manual de verificación:
  `docker compose -p icarsell up -d --build`
  y confirmar que el sitio sigue respondiendo en `https://empalmemotors.com`
  antes de tocar Jenkins.

### 2. Contenedor de Jenkins (docker-outside-of-docker)

Nuevo directorio `/root/ci/jenkins/` en el VPS (no versionado en el repo de
la app; es infraestructura del servidor):

- **`Dockerfile`**: parte de `jenkins/jenkins:lts-jdk21`, instala
  `docker-ce-cli` + `docker-compose-plugin` vía el repo apt de Docker, crea
  un grupo con el mismo GID que `/var/run/docker.sock` del host y agrega el
  usuario `jenkins` a ese grupo (para no correr el contenedor como root ni
  dar permisos amplios sobre el socket).
- **`docker-compose.yml`** de Jenkins:
  - Volumen nombrado `jenkins_home:/var/jenkins_home` (persistencia de
    plugins, jobs, historial, credenciales).
  - Bind mount `/var/run/docker.sock:/var/run/docker.sock`.
  - Bind mount `/root/apps/iCarSell:/root/apps/iCarSell` (misma ruta
    absoluta en host y contenedor) — el pipeline opera "in place" sobre el
    repo real, reutilizando el `.env` que ya vive ahí. No se duplican
    secretos en credenciales de Jenkins.
  - Puerto publicado como `127.0.0.1:8080:8080` únicamente.

Acceso al panel: `ssh -L 8080:localhost:8080 root@74.208.32.129` desde la PC
del usuario, luego `http://localhost:8080`.

### 3. Pipeline (`Jenkinsfile` en la raíz del repo de iCarSell)

- Job tipo "Pipeline script from SCM" apuntando a `origin/master`.
- Trigger: `pollSCM('H/2 * * * *')` (cada ~2 minutos).
- `options { disableConcurrentBuilds() }` para evitar despliegues solapados.
- Etapa única `Deploy`:
  ```bash
  cd /root/apps/iCarSell
  git fetch origin master
  git checkout master
  git reset --hard origin/master
  docker compose -p icarsell build
  docker compose -p icarsell up -d
  docker image prune -f
  ```
  El nombre de proyecto explícito (`-p icarsell`) evita ambigüedad frente al
  `container_name` ya fijo de cada servicio.
- Sin etapa de tests automatizados en esta primera versión (el objetivo es
  el despliegue automático; se puede agregar `npm test` del backend como
  etapa adicional después, gateando el deploy si falla).

### 4. Swap de seguridad

Agregar un swapfile de 2GB en el VPS (`fallocate` + `mkswap` + `swapon` +
entrada en `/etc/fstab`) como colchón para picos de memoria durante
`docker compose build` (npm install, build de Vite, imagen con
puppeteer/Chromium) concurrentes con tráfico normal de la app.

## Fuera de alcance (explícitamente, para esta iteración)

- Webhook público / dominio para Jenkins.
- Etapa de tests automatizados en el pipeline.
- Notificaciones (email/Slack) de resultado de build.
- Rollback automático ante fallo de deploy (por ahora, rollback es manual:
  `git checkout <commit-anterior> && docker compose ... up -d --build`).

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| `git reset --hard` en el deploy borra cambios manuales futuros no comiteados en el VPS | Documentar que el VPS es "solo despliegue", cualquier cambio se hace vía commit + push, nunca editando en vivo. |
| Contenedor de Jenkins con acceso al socket de Docker puede controlar todo el host | Acceso limitado a túnel SSH (ya protegido por credenciales del VPS); alcance del usuario `jenkins` acotado al grupo del socket, no root. |
| Pérdida de datos durante el saneamiento inicial del repo/branch en el VPS | Respaldo de BD ya generado y descargado (`backups/icarsell_backup_20260831_015556.sql`) antes de cualquier cambio. |
| Poll cada 2 min consume recursos mínimos pero no es instantáneo | Aceptado explícitamente por el usuario a cambio de no exponer Jenkins a internet. |

## Testing / verificación

- Tras el saneamiento del repo: confirmar `https://empalmemotors.com` sirve
  la app y `docker ps` muestra los 3 contenedores sanos.
- Tras levantar Jenkins: confirmar acceso al panel vía túnel SSH y wizard de
  setup inicial completado.
- Tras configurar el pipeline: hacer un commit trivial a `master`, esperar
  el poll, y confirmar en el log de Jenkins que corrió `build` + `up -d` sin
  error, y que el cambio se ve reflejado en el sitio.
