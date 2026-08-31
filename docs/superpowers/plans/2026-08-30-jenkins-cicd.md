# Jenkins CI/CD para iCarSell — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada push a `master` en GitHub despliegue automáticamente iCarSell en el VPS de IONOS, sin exponer nada nuevo a internet y sin arriesgar los datos de producción.

**Architecture:** Jenkins corre como contenedor Docker en el mismo VPS (docker-outside-of-docker: monta el socket de Docker del host y el directorio real de la app), accesible solo por túnel SSH, con el job de despliegue autogenerado vía Configuration as Code (JCasC) para que no dependa de clics manuales en el wizard. El pipeline hace poll a `master` cada ~2 minutos y redepliega con `docker compose` sobre el propio directorio de producción.

**Tech Stack:** Jenkins LTS (jdk21) en Docker, plugins `configuration-as-code` + `job-dsl` + `git` + `workflow-aggregator`, Docker Compose v2, Debian 12.

**Spec:** `docs/superpowers/specs/2026-08-30-jenkins-cicd-design.md`

## Global Constraints

- VPS: `74.208.32.129`, usuario `root`, Debian 12. Dominio en producción: `empalmemotors.com`.
- App en el VPS vive en `/root/apps/iCarSell` (git, remoto `origin` = `https://github.com/Berbxr/iCarSell.git`).
- Rama de despliegue: `master` únicamente.
- Jenkins expuesto **solo** en `127.0.0.1:8080` del VPS (acceso vía túnel SSH: `ssh -L 8080:localhost:8080 root@74.208.32.129`). Nunca publicar Jenkins en `ufw` ni en Nginx.
- Trigger de despliegue: `cron('H/2 * * * *')` (build incondicional cada ~2 min; ver nota de corrección en Task 3 — el poll con detección de cambios resultó poco fiable). Sin webhook público.
- Nombre de proyecto Docker Compose fijo: `icarsell` (flag `-p icarsell`) en todo comando de despliegue.
- **Nunca** escribir la contraseña root del VPS ni la contraseña de Jenkins en archivos versionados en git. Los scripts leen la contraseña del VPS desde la variable de entorno `VPS_SSH_PASSWORD`, que quien ejecute el plan debe exportar en su propia sesión (la contraseña ya fue compartida por el usuario en la conversación de brainstorming).
- Ya existe un respaldo de la base de datos de producción, tomado antes de esta implementación: `backups/icarsell_backup_20260831_015556.sql` (local) y `/root/backups/icarsell/` (VPS). Si algo sale mal, restaurar con `docker exec -i icarsell-db psql -U <usuario> -d <db> < <archivo>.sql`.
- Si se ejecuta desde Git Bash en Windows: exportar `MSYS_NO_PATHCONV=1` antes de llamar `.ops/ssh_exec.py` o `.ops/sftp_put.py` con rutas Unix absolutas como argumento — de lo contrario Git Bash las reescribe a rutas de Windows y el comando remoto/la subida falla con "No such file".

---

### Task 1: Herramientas de acceso SSH al VPS

**Files:**
- Create: `C:\Proyectos\iCarSell\.ops\ssh_exec.py`
- Create: `C:\Proyectos\iCarSell\.ops\sftp_put.py`
- Modify: `C:\Proyectos\iCarSell\.gitignore`

**Interfaces:**
- Produces: `python .ops/ssh_exec.py "<comando>"` — ejecuta `<comando>` por SSH en el VPS, imprime stdout/stderr/exit code, sale con código 0 si el comando remoto tuvo éxito. `python .ops/sftp_put.py <local> <remoto>` — sube un archivo por SFTP.
- Todas las tareas siguientes que tocan el VPS usan estas dos herramientas.

- [x] **Step 1: Agregar `.ops/` al `.gitignore`**

Editar `C:\Proyectos\iCarSell\.gitignore` y agregar al final:

```
.ops/
```

- [x] **Step 2: Crear el script de ejecución remota**

Crear `C:\Proyectos\iCarSell\.ops\ssh_exec.py`:

```python
import os, sys, io, paramiko

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

HOST = "74.208.32.129"
USER = "root"
PASSWORD = os.environ["VPS_SSH_PASSWORD"]

cmd = sys.argv[1] if len(sys.argv) > 1 else "echo ok"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=15)
stdin, stdout, stderr = client.exec_command(cmd, timeout=180)
out = stdout.read().decode(errors='replace')
err = stderr.read().decode(errors='replace')
code = stdout.channel.recv_exit_status()
print("=== STDOUT ===")
print(out)
print("=== STDERR ===")
print(err)
print("=== EXIT CODE:", code, "===")
client.close()
sys.exit(0 if code == 0 else 1)
```

- [x] **Step 3: Crear el script de subida de archivos**

Crear `C:\Proyectos\iCarSell\.ops\sftp_put.py`:

```python
import os, sys, paramiko

HOST = "74.208.32.129"
USER = "root"
PASSWORD = os.environ["VPS_SSH_PASSWORD"]

local_path = sys.argv[1]
remote_path = sys.argv[2]

transport = paramiko.Transport((HOST, 22))
transport.connect(username=USER, password=PASSWORD)
sftp = paramiko.SFTPClient.from_transport(transport)
sftp.put(local_path, remote_path)
sftp.close()
transport.close()
print("OK subido a", remote_path)
```

- [x] **Step 4: Verificar dependencias y conectividad**

Run:
```bash
pip install paramiko -q
export VPS_SSH_PASSWORD='<contraseña del VPS>'
python .ops/ssh_exec.py "echo ok && hostname"
```
Expected: `=== STDOUT ===` seguido de `ok` y `my-vps`, `=== EXIT CODE: 0 ===`.

- [x] **Step 5: Commit**

```bash
cd /c/Proyectos/iCarSell
git add .gitignore
git commit -m "chore: ignora carpeta .ops (herramientas locales de despliegue)"
```

---

### Task 2: Hardening de puertos (loopback) y limpieza de respaldos en `.gitignore`

> **Nota de corrección:** el diseño original usaba un `docker-compose.prod.yml`
> como overlay `-f` aparte. Un review de seguridad detectó que Compose
> fusiona la lista `ports` de forma **aditiva** entre archivos `-f` (no la
> reemplaza), así que el overlay no anulaba el binding público del archivo
> base — quedaban ambos bindings activos y el hardening no protegía nada.
> Se corrigió aplicando el binding a `127.0.0.1` directo en
> `docker-compose.yml` base; no existe overlay de producción.

**Files:**
- Modify: `C:\Proyectos\iCarSell\docker-compose.yml`
- Modify: `C:\Proyectos\iCarSell\.gitignore`

**Interfaces:**
- Produces: `docker-compose.yml` con los puertos de `db` y `frontend` en `127.0.0.1`, que Task 4 y el `Jenkinsfile` (Task 3) despliegan tal cual (un solo archivo, sin `-f` adicional).

- [x] **Step 1: Enlazar los puertos de `db` y `frontend` a loopback**

En `C:\Proyectos\iCarSell\docker-compose.yml`, cambiar:

```yaml
  db:
    ports:
      - "5437:5432"
```
por:
```yaml
  db:
    ports:
      - "127.0.0.1:5437:5432"
```

y cambiar:
```yaml
  frontend:
    ports:
      - "${HTTP_PORT:-8082}:80"
```
por:
```yaml
  frontend:
    ports:
      - "127.0.0.1:${HTTP_PORT:-8082}:80"
```

- [x] **Step 2: Agregar respaldos al `.gitignore`**

Agregar al final de `C:\Proyectos\iCarSell\.gitignore`:

```
backups/
*.sql
```

- [x] **Step 3: Verificar que el overlay es válido**

Run:
```bash
cd /c/Proyectos/iCarSell
docker compose config --services
```
Expected: lista `db`, `backend`, `frontend` sin errores de parseo.

- [x] **Step 4: Commit y push**

```bash
git add docker-compose.yml .gitignore
git commit -m "fix(deploy): puertos de db/frontend solo en loopback (127.0.0.1) e ignora respaldos .sql"
git push origin master
```

---

### Task 3: `Jenkinsfile` del pipeline de despliegue

**Files:**
- Create: `C:\Proyectos\iCarSell\Jenkinsfile`

**Interfaces:**
- Consumes: `docker-compose.yml` con hardening de puertos (Task 2), directorio `/root/apps/iCarSell` ya saneado en `master` (Task 4).
- Produces: pipeline `Deploy` que Task 6/7 registran en Jenkins vía JCasC (`scriptPath('Jenkinsfile')`, rama `master`).

- [x] **Step 1: Crear el Jenkinsfile**

Crear `C:\Proyectos\iCarSell\Jenkinsfile`:

```groovy
pipeline {
  agent any

  options {
    disableConcurrentBuilds()
  }

  triggers {
    cron('H/2 * * * *')
  }

  stages {
    stage('Deploy') {
      steps {
        sh '''
          set -e
          cd /root/apps/iCarSell
          git fetch origin master
          git checkout master
          git reset --hard origin/master
          docker compose -p icarsell build
          docker compose -p icarsell up -d
          docker image prune -f
        '''
      }
    }
  }

  post {
    success {
      echo 'Deploy de iCarSell completado.'
    }
    failure {
      echo 'Deploy de iCarSell fallido — revisar el log de esta build.'
    }
  }
}
```

- [x] **Step 2: Validar la sintaxis del Jenkinsfile localmente**

Run:
```bash
cd /c/Proyectos/iCarSell
python -c "import re; s=open('Jenkinsfile').read(); assert s.count('{')==s.count('}'), 'llaves desbalanceadas'; print('ok')"
```
Expected: `ok` (chequeo básico de llaves balanceadas; la validación real ocurre cuando Jenkins cargue el pipeline en Task 8).

- [x] **Step 3: Commit y push**

```bash
git add Jenkinsfile
git commit -m "feat(deploy): Jenkinsfile de despliegue automático a producción"
git push origin master
```

---

### Task 4: Sanear el repo en el VPS y verificar el despliegue con el overlay

**Files:**
- Ninguno local — solo comandos remotos vía `.ops/ssh_exec.py`.

**Interfaces:**
- Consumes: `.ops/ssh_exec.py` (Task 1), `docker-compose.yml` con hardening + `Jenkinsfile` ya en `origin/master` (Tasks 2 y 3).
- Produces: `/root/apps/iCarSell` en el VPS, en `master`, sin diffs locales, con los 3 contenedores corriendo con el overlay de producción — estado que Task 7 asume al montar el bind mount de Jenkins.

- [x] **Step 1: Descartar el diff local y cambiar a `master`**

Run:
```bash
python .ops/ssh_exec.py "cd /root/apps/iCarSell && git fetch origin && git checkout -- docker-compose.yml && git checkout master && git reset --hard origin/master && git status"
```
Expected: `=== EXIT CODE: 0 ===` y el `git status` final muestra `On branch master` / `nothing to commit, working tree clean`.

- [x] **Step 2: Confirmar que llegaron los archivos nuevos**

Run:
```bash
python .ops/ssh_exec.py "ls /root/apps/iCarSell/Jenkinsfile && grep -c 127.0.0.1 /root/apps/iCarSell/docker-compose.yml"
```
Expected: la ruta del Jenkinsfile listada sin error, y el `grep` reporta `2` (los dos puertos con binding a loopback).

- [x] **Step 3: Mover los respaldos sueltos fuera del repo**

Run:
```bash
python .ops/ssh_exec.py "mkdir -p /root/backups/icarsell && mv /root/apps/iCarSell/backups/*.sql /root/backups/icarsell/ 2>/dev/null; mv /root/apps/iCarSell/icarsell_backup*.sql /root/backups/icarsell/ 2>/dev/null; rmdir /root/apps/iCarSell/backups 2>/dev/null; git -C /root/apps/iCarSell status --porcelain"
```
Expected: la última línea (`git status --porcelain`) no muestra ningún archivo `.sql` ni carpeta `backups/`.

- [x] **Step 4: Redeploy manual con el overlay de producción**

Run:
```bash
python .ops/ssh_exec.py "cd /root/apps/iCarSell && docker compose -p icarsell up -d --build && docker ps"
```
Expected: exit code 0, `docker ps` lista `icarsell-db` (healthy), `icarsell-backend` (Up), `icarsell-frontend` (Up), y el puerto de frontend aparece como `127.0.0.1:8082->80/tcp`.

- [x] **Step 5: Confirmar que el sitio sigue respondiendo**

Run:
```bash
python .ops/ssh_exec.py "curl -s -o /dev/null -w '%{http_code}' https://empalmemotors.com"
```
Expected: `200` (dentro del `=== STDOUT ===`).

---

### Task 5: Swap de 2GB en el VPS

**Files:**
- Ninguno local — solo comandos remotos.

- [x] **Step 1: Verificar que no hay swap activo**

Run:
```bash
python .ops/ssh_exec.py "swapon --show; free -h"
```
Expected: `swapon --show` no imprime filas (sin swap todavía).

- [x] **Step 2: Crear y activar el swapfile**

Run:
```bash
python .ops/ssh_exec.py "fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab"
```
Expected: exit code 0, sin errores de `mkswap`/`swapon`.

- [x] **Step 3: Confirmar el swap activo y persistente**

Run:
```bash
python .ops/ssh_exec.py "swapon --show && free -h && cat /etc/fstab | grep swapfile"
```
Expected: `swapon --show` lista `/swapfile` con tamaño `2G`; `/etc/fstab` contiene la línea `/swapfile none swap sw 0 0`.

---

### Task 6: Archivos de infraestructura de Jenkins (local → subida al VPS)

**Files:**
- Create (local, `.ops/jenkins/`): `Dockerfile`, `plugins.txt`, `casc.yaml`, `docker-compose.yml`
- Ninguno de estos archivos se comitea al repo de la app (son infraestructura del servidor, según el spec).

**Interfaces:**
- Produces: `/root/ci/jenkins/{Dockerfile,plugins.txt,casc.yaml,docker-compose.yml}` en el VPS, que Task 7 construye y levanta.
- Consumes: `.ops/sftp_put.py` y `.ops/ssh_exec.py` (Task 1).

- [x] **Step 1: Crear `plugins.txt`**

Crear `C:\Proyectos\iCarSell\.ops\jenkins\plugins.txt`:

```
configuration-as-code
job-dsl
git
workflow-aggregator
```

- [x] **Step 2: Crear `casc.yaml`**

Crear `C:\Proyectos\iCarSell\.ops\jenkins\casc.yaml`:

```yaml
jenkins:
  systemMessage: "iCarSell CI/CD"
  numExecutors: 2
  securityRealm:
    local:
      allowsSignup: false
      users:
        - id: "${JENKINS_ADMIN_USER}"
          password: "${JENKINS_ADMIN_PASSWORD}"
  authorizationStrategy:
    loggedInUsersCanDoAnything:
      allowAnonymousRead: false

jobs:
  - script: >
      pipelineJob('icarsell-deploy') {
        definition {
          cpsScm {
            scm {
              git {
                remote { url('https://github.com/Berbxr/iCarSell.git') }
                branches('*/master')
              }
            }
            scriptPath('Jenkinsfile')
          }
        }
        triggers {
          cron('H/2 * * * *')
        }
      }
```

- [x] **Step 3: Crear el `Dockerfile`**

Crear `C:\Proyectos\iCarSell\.ops\jenkins\Dockerfile`:

> **Nota de corrección:** el diseño original agregaba `jenkins` a un grupo
> con el GID del socket de Docker y volvía a `USER jenkins` al final. Al
> probar el pipeline, `cd /root/apps/iCarSell` falló con "Permission
> denied": `/root` en el host tiene permisos `700`, así que un usuario no-root
> dentro del contenedor no puede ni atravesarlo, sin importar el grupo del
> socket. Se corrigió dejando el proceso como `root` dentro del contenedor
> (quien ya controla el socket de Docker tiene control equivalente a root
> del host de todas formas, así que esto no reduce la seguridad real).

```dockerfile
FROM jenkins/jenkins:lts-jdk21

USER root

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && chmod a+r /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
      > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y --no-install-recommends \
      docker-ce-cli docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt

COPY casc.yaml /usr/share/jenkins/casc.yaml

ENV JAVA_OPTS="-Djenkins.install.runSetupWizard=false"
ENV CASC_JENKINS_CONFIG="/usr/share/jenkins/casc.yaml"
```

- [x] **Step 4: Crear el `docker-compose.yml` de Jenkins**

Crear `C:\Proyectos\iCarSell\.ops\jenkins\docker-compose.yml`:

```yaml
services:
  jenkins:
    build:
      context: .
    container_name: icarsell-jenkins
    restart: unless-stopped
    environment:
      JENKINS_ADMIN_USER: ${JENKINS_ADMIN_USER}
      JENKINS_ADMIN_PASSWORD: ${JENKINS_ADMIN_PASSWORD}
    ports:
      - "127.0.0.1:8080:8080"
    volumes:
      - jenkins_home:/var/jenkins_home
      - /var/run/docker.sock:/var/run/docker.sock
      - /root/apps/iCarSell:/root/apps/iCarSell

volumes:
  jenkins_home:
```

- [x] **Step 5: Subir los 4 archivos al VPS**

Run:
```bash
python .ops/ssh_exec.py "mkdir -p /root/ci/jenkins"
python .ops/sftp_put.py .ops/jenkins/Dockerfile /root/ci/jenkins/Dockerfile
python .ops/sftp_put.py .ops/jenkins/plugins.txt /root/ci/jenkins/plugins.txt
python .ops/sftp_put.py .ops/jenkins/casc.yaml /root/ci/jenkins/casc.yaml
python .ops/sftp_put.py .ops/jenkins/docker-compose.yml /root/ci/jenkins/docker-compose.yml
python .ops/ssh_exec.py "ls -la /root/ci/jenkins"
```
Expected: cada `sftp_put.py` imprime `OK subido a ...`; el `ls` final lista los 4 archivos.

---

### Task 7: Credenciales, build y arranque del contenedor de Jenkins

**Files:**
- Ninguno local — el `.env` de Jenkins se crea directo en el VPS, nunca en la PC ni en git (contiene la contraseña de administrador de Jenkins).

**Interfaces:**
- Consumes: `/root/ci/jenkins/*` (Task 6), `/var/run/docker.sock` del host, `/root/apps/iCarSell` ya saneado (Task 4).
- Produces: contenedor `icarsell-jenkins` corriendo y accesible en `127.0.0.1:8080` del VPS.

- [x] **Step 1: Generar `.env` con el GID del socket de Docker y una contraseña de administrador**

Run:
```bash
python .ops/ssh_exec.py "cd /root/ci/jenkins && DOCKER_GID=$(stat -c '%g' /var/run/docker.sock) && PASS=$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9') && printf 'DOCKER_GID=%s\nJENKINS_ADMIN_USER=admin\nJENKINS_ADMIN_PASSWORD=%s\n' \"$DOCKER_GID\" \"$PASS\" > .env && cat .env"
```
Expected: exit code 0; el `=== STDOUT ===` muestra las 3 líneas `DOCKER_GID=...`, `JENKINS_ADMIN_USER=admin`, `JENKINS_ADMIN_PASSWORD=...`.

**Anota la contraseña que aparece aquí — es la única vez que se muestra en texto plano. Es el login del panel de Jenkins.**

- [x] **Step 2: Construir la imagen**

Run:
```bash
python .ops/ssh_exec.py "cd /root/ci/jenkins && docker compose build"
```
Expected: exit code 0, sin errores de `apt-get`, `groupadd` ni `jenkins-plugin-cli` en el log.

- [x] **Step 3: Levantar el contenedor**

Run:
```bash
python .ops/ssh_exec.py "cd /root/ci/jenkins && docker compose up -d && sleep 20 && docker ps | grep jenkins"
```
Expected: `icarsell-jenkins` aparece con estado `Up` y puerto `127.0.0.1:8080->8080/tcp`.

- [x] **Step 4: Verificar que Jenkins terminó de arrancar sin errores de configuración**

Run:
```bash
python .ops/ssh_exec.py "docker logs icarsell-jenkins --tail 80"
```
Expected: el log contiene `Jenkins is fully up and running`; no hay líneas `SEVERE` ni `ERROR` relacionadas con `configuration-as-code` o `casc.yaml`.

---

### Task 8: Verificar Jenkins operativo (JCasC, usuario admin, job creado)

**Files:**
- Ninguno.

**Interfaces:**
- Consumes: contenedor `icarsell-jenkins` corriendo (Task 7), credenciales generadas en Task 7 Step 1.

- [x] **Step 1: Verificar que el panel responde**

Run:
```bash
python .ops/ssh_exec.py "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/login"
```
Expected: `200`.

- [x] **Step 2: Verificar el login del usuario admin generado por JCasC**

Run (sustituye `<PASS>` por la contraseña obtenida en Task 7 Step 1):
```bash
python .ops/ssh_exec.py "curl -s -o /dev/null -w '%{http_code}' -u admin:<PASS> http://127.0.0.1:8080/whoAmI/api/json"
```
Expected: `200` (si devuelve `401`, revisar que `JENKINS_ADMIN_PASSWORD` en `.env` coincide con la que se está probando).

- [x] **Step 3: Verificar que el job `icarsell-deploy` fue creado por el Job DSL de `casc.yaml`**

Run:
```bash
python .ops/ssh_exec.py "curl -s -u admin:<PASS> http://127.0.0.1:8080/job/icarsell-deploy/api/json"
```
Expected: JSON con `"name":"icarsell-deploy"` y sin `"status":404`.

- [x] **Step 4: Documentar el acceso al panel para el usuario**

No hay archivo que crear — este paso es informativo: comunicar al usuario que puede entrar al panel con:
```bash
ssh -L 8080:localhost:8080 root@74.208.32.129
```
y luego abrir `http://localhost:8080` con usuario `admin` y la contraseña generada en Task 7 Step 1.

---

### Task 9: Prueba end-to-end del pipeline automático

**Files:**
- Modify: `C:\Proyectos\iCarSell\README.md` (línea trivial, solo para disparar el pipeline de prueba)

**Interfaces:**
- Consumes: todo lo anterior. Este task confirma que el sistema completo funciona de punta a punta.

- [x] **Step 1: Hacer un cambio trivial y subirlo a `master`**

Agregar al final de `C:\Proyectos\iCarSell\README.md`:

```markdown

## CI/CD

Los cambios en `master` se despliegan automáticamente en producción vía Jenkins (poll cada ~2 min).
```

Run:
```bash
cd /c/Proyectos/iCarSell
git add README.md
git commit -m "docs: nota de CI/CD en el README (prueba end-to-end del pipeline)"
git push origin master
```

- [x] **Step 2: Esperar al poll y confirmar que corrió una build**

Esperar al menos 3 minutos desde el push. Luego:

Run (sustituye `<PASS>`):
```bash
python .ops/ssh_exec.py "curl -s -u admin:<PASS> http://127.0.0.1:8080/job/icarsell-deploy/lastBuild/api/json"
```
Expected: JSON con `"result":"SUCCESS"` y `"building":false`.

- [x] **Step 3: Confirmar que el VPS quedó en el commit nuevo y los contenedores se recrearon**

Run:
```bash
python .ops/ssh_exec.py "git -C /root/apps/iCarSell log -1 --oneline && docker ps"
```
Expected: el hash del commit coincide con el del push del Step 1; `icarsell-db`, `icarsell-backend`, `icarsell-frontend` aparecen `Up` (recién recreados).

- [x] **Step 4: Confirmar que el sitio sigue en línea**

Run:
```bash
python .ops/ssh_exec.py "curl -s -o /dev/null -w '%{http_code}' https://empalmemotors.com"
```
Expected: `200`.

Si todos los checks pasan, el pipeline de CI/CD está operativo: cada push a `master` se despliega solo.

---

## Resultado real de la ejecución (2026-08-31)

Plan ejecutado de punta a punta contra el VPS de producción. Se encontraron
y corrigieron 3 problemas reales durante la implementación (no anticipados
en el diseño original, documentados también en el spec):

1. **`docker-compose.prod.yml` no protegía nada** — Compose fusiona `ports`
   de forma aditiva entre archivos `-f`; el hardening quedaba anulado por el
   binding público del archivo base. Corregido: binding a `127.0.0.1` en el
   único `docker-compose.yml`, sin overlay.
2. **`Permission denied` en el bind mount de Jenkins** — `/root` en el host
   tiene permisos `700`; el usuario `jenkins` (no-root) no podía atravesarlo
   pese al grupo del socket de Docker. Corregido: el contenedor de Jenkins
   corre como `root`.
3. **`pollSCM`/`scm()` poco fiable** — Jenkins actualizaba su baseline de
   commit sin encolar el build de forma consistente tras el primer poll.
   Corregido: trigger `cron('H/2 * * * *')` incondicional (el `Jenkinsfile`
   ya es idempotente).

**Verificación final:** build `#3` del job `icarsell-deploy`, disparado por
el cron (`"Started by timer"`), tomó el commit `606d191` y terminó con
`result=SUCCESS` en 182s. El VPS quedó en ese mismo commit, los 4
contenedores (`icarsell-db`, `icarsell-backend`, `icarsell-frontend`,
`icarsell-jenkins`) arriba y sanos, y `https://empalmemotors.com` responde
`200`. Los scripts de diagnóstico temporales (con la contraseña de Jenkins
en texto plano) se borraron del VPS al terminar.

Pendiente conocido: la advertencia `triggers is deprecated` del plugin
Job-DSL sigue apareciendo en el log de arranque; no es bloqueante (el job se
crea y el trigger funciona), pero si una futura versión de Job-DSL elimina
el soporte, la creación del job tendría que moverse a un Job DSL "seed job"
clásico en vez de la clave `jobs:` de JCasC.
