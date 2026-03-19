# Bitel Multi-local (MVP)

Este repositorio contiene un MVP de sistema multi-local para ventas, inventario, caja, reportes y auditoria.

## Estructura
- `server/` Backend NestJS + Prisma (PostgreSQL)
- `client/` Frontend React + Vite (PWA basica)
- `docker-compose.yml` Servicios locales

## Requisitos
- Node.js 18+
- Docker (opcional para Postgres)

## Variables de entorno (backend)
Copiar `.env.example` a `.env` dentro de `server/` y ajustar:

```env
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

`SMTP_PASS` debe ser una App Password de Gmail (no la contrasena normal de la cuenta).

`DOCUMENT_LOOKUP_TOKEN` habilita el autocompletado de DNI/RUC contra RENIEC/SUNAT.

## Primeros pasos (desarrollo)
1. Levantar Postgres.
2. Instalar dependencias en `server/` y `client/`.
3. Ejecutar migraciones Prisma (desde `server/`).
4. Levantar backend y frontend.

Comandos sugeridos:

```bash
cd server
npm run prisma:deploy
```

Si estas en la raiz:

```bash
npm --prefix server run prisma:deploy
```

## Tunnel estable (Named Tunnel recomendado)
Para evitar fallos intermitentes de `trycloudflare.com`, usa Named Tunnel.

1. En Cloudflare Zero Trust crea un tunnel y copia:
- `CF_TUNNEL_TOKEN`
- Hostname publico (ejemplo: `https://api.tudominio.com`)
2. En este proyecto ejecuta:

```bat
CONFIGURAR_NAMED_TUNNEL.bat
```

3. Luego inicia:

```bat
INICIAR_BACKEND_TUNNEL.bat
```

El script guarda la URL en `tmp/tunnel-url.txt`, actualiza `client/.env.local` y copia la URL al portapapeles.

Archivo de ejemplo: `ops/tunnel.env.example`  
Archivo real (local, no se sube a Git): `ops/tunnel.env`

## Notas
- El MVP no integra APIs externas de Bitel, pero deja el diseno preparado.
- La PWA es basica (manifest + estilo), sin service worker.

