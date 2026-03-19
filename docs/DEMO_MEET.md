# Guía de demostración (Google Meet) — paso a paso

Este documento está pensado para que la demo sea **guiada y predecible**, siguiendo el orden visual de la app:
**izquierda → derecha** y **arriba → abajo**, pestaña por pestaña.

> Nota: incluye diagramas en **Mermaid**. Si tu visor no los renderiza, puedes usar igual el guion y las tablas.

## 0) Agenda rápida (recomendada)

| Bloque | Duración | Objetivo |
|---|---:|---|
| Introducción + login | 1 min | Contexto del MVP multi-local |
| Operación diaria | 5–7 min | Venta + caja + comprobantes |
| Inventario + transferencias | 4–6 min | Stock + envíos entre locales + PDF |
| Auditoría (solo lectura) | 2–4 min | Control sin riesgo |
| Cierre (ADMIN) | 1 min | Capacidades admin (backup/mantenimiento) |

## 1) Accesos para probar (seed)

Estos usuarios existen cuando se ejecutó el seed de Prisma (`npm.cmd --prefix server run seed`) al menos una vez.

| Rol | Descripción | Correo | Contraseña | Local |
|---|---|---|---|---|
| `SUPERVISOR` | Encargado de un local | `supervisor.pn@bitel.local` | `demo123` | Pueblo Nuevo (`LALDA67`) |
| `VENDEDOR` | Vendedor de un local | `vendedor.pn@bitel.local` | `demo123` | Pueblo Nuevo (`LALDA67`) |
| `AUDITOR` | Solo lectura (control) | `auditor@bitel.local` | `demo123` | N/A |

## 2) Roles (cómo explicarlo en 20–30s)

1. **Administrador principal (`ADMIN`)**
   - Control total del sistema (multi-local).
2. **Encargado por local (`SUPERVISOR`)**
   - Opera el día a día en su local (ventas, caja, inventario, transferencias).
3. **Vendedor por local (`VENDEDOR`)**
   - Opera ventas y caja en su local.
   - Puede hacer transferencias (por ahora), pero **no** crea/edita/importa/exporta inventario.
   - No ve la pestaña de reportes.
4. **Solo lectura (`AUDITOR`)**
   - Ve módulos para control, sin poder registrar/modificar información.

## 3) Matriz de permisos (resumen)

Leyenda: ✅ permitido · ⚠️ permitido pero acotado por local · ❌ no permitido.

| Acción / Módulo | `ADMIN` | `SUPERVISOR` | `AUDITOR` | `VENDEDOR` |
|---|:---:|:---:|:---:|:---:|
| Ver resumen/dashboard | ✅ | ✅ | ✅ | ✅ |
| Registrar venta | ✅ | ⚠️ | ❌ | ⚠️ |
| Anular venta | ✅ | ⚠️ | ❌ | ❌ |
| Caja (listar / abrir / cerrar) | ✅ | ⚠️ | ✅ (solo lectura) | ⚠️ |
| Movimientos de caja | ✅ | ⚠️ | ❌ | ⚠️ |
| Descargar comprobante venta (PDF) | ✅ | ⚠️ | ❌ | ⚠️ |
| Descargar cierre de caja (PDF) | ✅ | ⚠️ | ❌ | ⚠️ |
| Inventario (ver) | ✅ | ⚠️ | ✅ | ✅ |
| Inventario (crear/editar/ajustar/importar/exportar) | ✅ | ⚠️ | ❌ | ❌ |
| Kardex/movimientos | ✅ | ⚠️ | ✅ | ❌ |
| Transferencias (ver) | ✅ | ⚠️ | ✅ | ✅ |
| Transferencias (enviar/recibir/observar + PDF) | ✅ | ⚠️ | ❌ | ⚠️ |
| Reportes (KPIs, cierres, stock, etc.) | ✅ | ⚠️ | ✅ | ❌ |
| Auditoría (ver logs) | ✅ | ❌ | ✅ | ❌ |
| Backup (`/reports/backup.json`) | ✅ | ❌ | ❌ | ❌ |
| Reset demo / mantenimiento | ✅ | ❌ | ❌ | ❌ |

## 4) Guía de demo — orden visual (izq→der, arriba→abajo)

### Paso 0 — Login (30–60s)

1. Ingresar con `supervisor.pn@bitel.local`.
2. Mostrar arriba:
   - Chip de rol + local asignado.
   - Selector de periodo (Hoy / Semana / Mes / Año).
3. Mencionar regla clave: *si el usuario no es `ADMIN/AUDITOR`, la app lo “fija” a su local y restringe automáticamente*.

### Pestaña: **Resumen** (1–2 min)

Orden para explicar:
1. **Fila de tarjetas (arriba, de izquierda a derecha):**
   - Ventas totales (monto + operaciones).
   - Operaciones (cantidad de ventas).
   - Productos (ventas por tipo).
   - Servicios (ventas por tipo).
2. **Bloque informativo (debajo):** “Actividad y auditoría”.
3. **Tarjetas inferiores (izquierda → derecha):**
   - Stock bajo (alertas).
   - Diferencias de caja (cierres con diferencia).

### Pestaña: **Operación diaria** (5–7 min)

Esta pestaña está organizada en acordeones (de arriba hacia abajo). Explica y ejecuta en ese orden.

#### Acordeón 1: “Ventas y caja”

**Columna izquierda — Ventas (arriba→abajo):**
1. Seleccionar local (si aplica).
2. Tipo (Producto/Servicio).
3. Método (Efectivo/BiPay/Transferencia).
4. Comprobante (Boleta física / boleta electrónica).
5. Ítems:
   - Código / descripción / cantidad / precio.
   - Descuentos (Bitel / tienda).
6. Registrar venta.
7. Mostrar que el comprobante se asigna automáticamente al registrar.

**Columna derecha — Caja por turno (arriba→abajo):**
1. “Abrir caja” (monto de apertura).
2. “Cerrar caja” (desglose por billetes/monedas + monto final).
3. “Movimientos de caja” (gasto / retiro / depósito).
4. (Solo `ADMIN`) “Forzar cierre”.

#### Acordeón 2: “Ventas recientes y acciones”

1. Tabla de ventas recientes (mostrar 1–2 filas).
2. Descargar PDF de comprobante de venta (si aplica).
3. (Si quieres mostrar control) anular venta solo con `ADMIN/SUPERVISOR`.

#### Acordeón 3: “Cajas recientes y cierres”

1. Tabla de cajas recientes.
2. Descargar PDF de cierre.

### Pestaña: **Inventario** (4–6 min)

Esta pestaña también está en acordeones (arriba→abajo).

#### Acordeón 1: “Inventario”

1. Filtro por local (si aplica).
2. Buscar por código o nombre.
3. Tabla de inventario (explicar columnas).

> Nota de roles:
> - `SUPERVISOR/ADMIN`: además puede registrar/editar e importar Excel.
> - `VENDEDOR`: **solo lectura** (no crea/edita/importa/exporta).

#### Acordeón 2: “Transferencias entre locales”

1. Tabla de transferencias (estado y fecha).
2. Envío por lote:
   - Origen, destino, ítems y cantidades.
   - Generar envío y mostrar el `batchCode`.
3. Imprimir PDF del envío.
4. Recibir u observar para mostrar cambio de estado.

### Pestaña: **Reportes** (solo `ADMIN/SUPERVISOR/AUDITOR`)

Orden sugerido (si aplica a tu demo):
1. Filtros (local, fecha).
2. KPIs.
3. Top productos / por categoría.
4. Cierres de caja + exportaciones.

### Pestaña: **Administración** (solo `ADMIN/AUDITOR`)

1. Mencionar backup (`/reports/backup.json`).
2. (Opcional) Reset demo / mantenimiento.

## 5) Diagramas (para explicar el flujo)

### Flujo: Venta + caja + auditoría (operación diaria)

```mermaid
flowchart TD
  A[Usuario (SUPERVISOR/VENDEDOR)] --> B[Operación diaria]
  B --> C[Registrar venta]
  C --> D[Actualiza stock]
  C --> E[Asigna comprobante]
  C --> F[Log: sale.create]
  B --> G[Caja por turno]
  G --> H[Abrir caja]
  H --> I[Log: cash.open]
  G --> J[Movimientos de caja]
  J --> K[Log: cash.tx.create]
  G --> L[Cerrar caja]
  L --> M[Log: cash.close]
  B --> N[Descargar PDFs]
```

### Flujo: Transferencias entre locales (lote)

```mermaid
flowchart LR
  A[Usuario (SUPERVISOR/VENDEDOR)] --> B[Generar envío por lote]
  B --> C[Se crea batchCode]
  C --> D[Imprimir PDF del envío]
  C --> E[Recibir envío (destino)]
  C --> F[Observar envío (incidencia)]
  E --> G[Estado: RECEIVED]
  F --> H[Estado: OBSERVED]
```

## 6) Cierre (frases cortas)

- “El sistema es multi-local: cada usuario puede quedar asignado a un local y se restringe automáticamente.”
- “Supervisor opera el día a día: ventas, caja, inventario y transferencias.”
- “Vendedor opera ventas/caja y transferencias, sin tocar inventario ni reportes.”
- “Auditor es solo lectura: control sin riesgo.”

