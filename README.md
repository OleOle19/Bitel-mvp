# Bitel Multi-local (MVP)

Este repositorio contiene un MVP de sistema multi-local para ventas, inventario, caja, reportes y auditoría.

## Estructura
- `server/` Backend NestJS + Prisma (PostgreSQL)
- `client/` Frontend React + Vite (PWA básica)
- `docker-compose.yml` Servicios locales

## Requisitos
- Node.js 18+
- Docker (opcional para Postgres)

## Variables de entorno (backend)
Copiar `.env.example` a `.env` dentro de `server/` y ajustar:

```
DATABASE_URL="postgresql://bitel:bitel@localhost:5432/bitel_mvp?schema=public"
JWT_SECRET="cambia_esto"
JWT_EXPIRES_IN="1d"
DOCUMENT_LOOKUP_TOKEN=""
RENIEC_API_URL="https://api.apis.net.pe/v2/reniec/dni"
SUNAT_API_URL="https://api.apis.net.pe/v2/sunat/ruc/full"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="TU_CORREO_GMAIL@gmail.com"
SMTP_PASS="TU_APP_PASSWORD_DE_16_CARACTERES"
SMTP_FROM="Bitel Demo <TU_CORREO_GMAIL@gmail.com>"
```

`SMTP_PASS` debe ser una App Password de Gmail (no la contraseña normal de la cuenta).

`DOCUMENT_LOOKUP_TOKEN` habilita el autocompletado de DNI/RUC contra RENIEC/SUNAT.

## Primeros pasos (desarrollo)
1. Levantar Postgres
2. Instalar dependencias en `server/` y `client/`
3. Ejecutar migraciones Prisma (desde `server/`)
4. Levantar backend y frontend

Comandos sugeridos:

```bash
cd server
npm run prisma:deploy
```

Si estas en la raiz:

```bash
npm --prefix server run prisma:deploy
```

## Notas
- El MVP no integra APIs externas de Bitel, pero deja el diseño preparado.
- La PWA es básica (manifest + estilo), sin service worker.
