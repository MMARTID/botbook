# Contribuir a Alhabla

Este documento define cómo trabajamos en este repositorio cuando somos varias
personas (y varias sesiones de Claude Code) tocando el código a la vez, para no
pisarnos el trabajo ni desplegar algo a medias por accidente.

## Regla de oro

**Nunca se hace push directo a `main`.** Todo cambio entra por Pull Request.

Esto no es solo una convención: `main` tiene protección de rama activada en
GitHub (Settings → Branches) que **bloquea el push directo incluso para
administradores**. Un push directo a `main` será rechazado por GitHub.

La razón es que `main` es, de facto, la rama de producción:

- [`ci.yml`](.github/workflows/ci.yml) corre lint/typecheck/tests en cada PR y
  en cada push a `main`.
- [`deploy-backend.yml`](.github/workflows/deploy-backend.yml) se dispara con
  cada push a `main` y despliega el backend a Cloud Run (repite los tests
  antes de desplegar).
- El frontend se despliega a producción desde `main` vía la integración Git de
  Vercel.

## Flujo estándar por tarea/sesión

1. Partir siempre de `main` actualizado:
   ```bash
   git checkout main && git pull --rebase origin main
   ```
2. Crear una rama nueva con nombre descriptivo:
   ```bash
   git checkout -b feature/nombre-descriptivo
   # o fix/nombre-descriptivo para arreglos de bugs
   ```
3. Hacer commits pequeños y frecuentes.
4. Publicar la rama:
   ```bash
   git push -u origin feature/nombre-descriptivo
   ```
5. Si la tarea se alarga varios días, traer los cambios de la otra persona
   antes de seguir o antes de abrir el PR:
   ```bash
   git fetch origin && git rebase origin/main
   ```
   Resolver los conflictos en local, no en GitHub.
6. Abrir un Pull Request hacia `main`. Esto dispara `ci.yml` automáticamente.
7. Mergear solo cuando el CI esté en verde. La rama debe estar actualizada
   respecto a `main` para poder mergear (GitHub lo exige).

## Qué pasa después de mergear

Un merge a `main` dispara `deploy-backend.yml`, que despliega el backend a
Cloud Run. El Environment `production` de GitHub tiene revisores requeridos
configurados, así que el job de deploy queda **pausado pidiendo una
aprobación manual explícita** antes de tocar producción — quien tenga acceso
de revisor debe aprobarlo desde la pestaña **Actions** del repositorio (el
job de deploy aparece con un botón "Review deployments").

El frontend se despliega en paralelo vía Vercel en cuanto el push llega a
`main`, sin paso de aprobación manual.

## Trabajando con Claude Code

Ambas personas usamos Claude Code. Cada sesión nueva debe partir de un `main`
actualizado (paso 1 de arriba) antes de crear una rama, para evitar que las
dos personas trabajen sobre bases desincronizadas y que el rebase del paso 5
se vuelva más difícil de lo necesario.
