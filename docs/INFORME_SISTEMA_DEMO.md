# Informe del Sistema Demo BITEL (MVP)

Fecha: 2026-03-14  
Versión del documento: 1.0

## 1) Resumen ejecutivo

El **Sistema Demo BITEL** es un **MVP (producto mínimo viable)** orientado a demostrar, en un entorno controlado, la operación diaria de un punto de venta **multi-local** (varios locales/sucursales), incluyendo:

- **Ventas** (registro y comprobante).
- **Caja por turno** (apertura, movimientos y cierre con diferencias).
- **Inventario por local** (consulta de stock y trazabilidad mediante movimientos/kardex).
- **Transferencias entre locales** (envíos por lote, estados y PDF).
- **Auditoría** (registro de actividades relevantes por usuario, local y fecha).
- **Administración** (funciones restringidas como backup y mantenimiento/reset de demo).

El objetivo principal es permitir que un encargado evalúe el flujo, permisos y controles del sistema, así como la trazabilidad que se obtiene en cada operación.

## 2) Alcance y supuestos (demo)

Este sistema está diseñado como **demostración**:

- Las operaciones se registran en base de datos y generan evidencias (por ejemplo PDFs), pero **no** incluye integración con servicios externos (por ejemplo facturación real, RENIEC u otros) dentro del alcance actual.
- Algunas pantallas pueden estar enfocadas a “mostrar el flujo” más que a cubrir todos los casos borde de producción.
- Existe funcionalidad de **mantenimiento/reset** para limpiar datos operativos de la demo cuando se requiera reiniciar la demostración.

## 3) Conceptos principales del sistema

### 3.1 Multi-local y control por local

El sistema opera con el concepto de **Local**:

- Muchas operaciones (ventas, caja, inventario, transferencias) se realizan **por local**.
- Para roles operativos (no administradores), el usuario queda asociado a un local y el sistema **restringe automáticamente** la información y operaciones a ese local.

### 3.2 Auditoría y trazabilidad

Las acciones relevantes generan registros de auditoría (logs) que permiten:

- Saber **qué** se hizo (acción).
- **Quién** lo hizo (usuario/rol).
- **Dónde** ocurrió (local).
- **Cuándo** ocurrió (fecha/hora).
- En algunos casos, incluir metadatos (montos, motivos, etc.).

## 4) Módulos / Pestañas del sistema (para qué sirve cada una)

### 4.1 Resumen (Dashboard)

Propósito: ofrecer una vista rápida del estado del negocio en el periodo seleccionado.

Qué muestra típicamente:

- Totales de ventas y número de operaciones.
- Totales segmentados por tipo (producto/servicio).
- Mensajes informativos del sistema (por ejemplo, la existencia de auditoría y control).

Uso recomendado:

- Abrir la demo en esta pestaña para dar contexto en 30–60 segundos.

### 4.2 Operación diaria

Propósito: concentrar el flujo diario del local: **venta + caja**.

Incluye:

1) **Ventas**
- Registro de venta (tipo, método de pago, detalle de ítems, descuentos).
- Asignación de **comprobante** (boleta física o boleta electrónica).
- Consulta de ventas recientes y descarga de PDF del comprobante.
- Anulación de venta (solo en roles autorizados).

2) **Caja por turno**
- **Abrir caja** (monto inicial).
- **Movimientos de caja** (gastos/retiros/depósitos con motivo).
- **Cerrar caja** (monto final, desglose por denominaciones y cálculo de diferencia).
- Descarga del **PDF de cierre**.
- Forzar cierre (solo para administrador).

Beneficio:

- Permite demostrar el control operativo de un turno, con evidencia y trazabilidad.

### 4.3 Inventario

Propósito: consultar el **stock por local** y soportar el movimiento de inventario.

Incluye:

- **Listado de inventario** (por local, búsqueda por código/nombre).
- **Kardex / Movimientos** (trazabilidad de entradas/salidas por ajustes, ventas u otros motivos).
- **Transferencias entre locales**:
  - Envío por lote (batch).
  - Estados (enviado/recibido/observado).
  - Descarga de **PDF de transferencia**.

Nota:

- La creación/edición/importación/exportación de inventario está restringida a roles superiores; el vendedor queda en **solo lectura** para inventario (según la definición de permisos vigente para esta demo).

### 4.4 Reportes

Propósito: análisis, consolidación y exportación de información.

Ejemplos de lo que suele incluir:

- KPIs (indicadores).
- Rankings/top.
- Cierres de caja consolidados.
- Exportaciones (Excel/PDF) según el rol.

Nota:

- En la jerarquía actual, esta pestaña se reserva para roles de control (por ejemplo supervisor/auditor/admin). El vendedor no tiene acceso a este módulo.

### 4.5 Administración

Propósito: funciones de control total y mantenimiento.

Ejemplos:

- Descarga de backup (cuando aplica).
- Mantenimiento/reset del entorno demo.

Nota:

- Está restringido por rol, debido a su criticidad.

## 5) Jerarquías, permisos y limitaciones

### 5.1 Roles del sistema

- **ADMIN**: administrador principal del sistema (multi-local).
- **SUPERVISOR**: encargado por local (operación completa del local con restricciones).
- **VENDEDOR**: operación de ventas y caja en su local; acceso limitado a inventario y sin reportes.
- **AUDITOR**: rol de control (solo lectura), enfocado en revisión y trazabilidad.

### 5.2 Matriz de permisos (resumen)

Leyenda: ✅ permitido · ⚠️ permitido pero acotado por local · ❌ no permitido.

| Acción / Módulo | ADMIN | SUPERVISOR | AUDITOR | VENDEDOR |
|---|:---:|:---:|:---:|:---:|
| Ver resumen/dashboard | ✅ | ✅ | ✅ | ✅ |
| Registrar venta | ✅ | ⚠️ | ❌ | ⚠️ |
| Anular venta | ✅ | ⚠️ | ❌ | ❌ |
| Caja (listar) | ✅ | ⚠️ | ✅ (solo lectura) | ⚠️ |
| Caja (abrir/cerrar) | ✅ | ⚠️ | ❌ | ⚠️ |
| Movimientos de caja | ✅ | ⚠️ | ❌ | ⚠️ |
| Descargar comprobante de venta (PDF) | ✅ | ⚠️ | ❌ | ⚠️ |
| Descargar cierre de caja (PDF) | ✅ | ⚠️ | ❌ | ⚠️ |
| Inventario (ver) | ✅ | ⚠️ | ✅ | ✅ |
| Inventario (crear/editar/ajustar) | ✅ | ⚠️ | ❌ | ❌ |
| Inventario (importar/exportar) | ✅ | ⚠️ | ❌ | ❌ |
| Kardex / movimientos | ✅ | ⚠️ | ✅ | ❌ |
| Transferencias (ver) | ✅ | ⚠️ | ✅ | ✅ |
| Transferencias (enviar/recibir/observar + PDF) | ✅ | ⚠️ | ❌ | ⚠️ |
| Reportes (KPIs, cierres, etc.) | ✅ | ⚠️ | ✅ | ❌ |
| Auditoría (ver logs) | ✅ | ❌ | ✅ | ❌ |
| Backup / mantenimiento | ✅ | ❌ | ❌ | ❌ |

### 5.3 Limitaciones y controles por rol (explicación)

**Vendedor (`VENDEDOR`)**

- Enfocado en **ventas + caja** del local asignado.
- Puede operar **transferencias** (temporalmente habilitado en esta demo).
- No puede “administrar inventario” (crear/editar/ajustar/importar/exportar).
- No accede a la pestaña de **reportes**.

**Auditor (`AUDITOR`)**

- Diseñado para control sin riesgo: puede revisar información y trazabilidad.
- No realiza operaciones que cambien datos (no ventas, no caja operativa, no inventario operativo).

**Supervisor (`SUPERVISOR`)**

- Opera el local con mayor amplitud (incluye inventario y transferencias).
- En general queda restringido a su local.

**Administrador (`ADMIN`)**

- Control completo, incluyendo funciones de mantenimiento.

## 6) Flujos de operación (qué demuestra el sistema)

### 6.1 Flujo: venta → comprobante → auditoría

1. Registrar una venta con ítems y método.
2. El sistema asigna el tipo de comprobante (boleta física/electrónica) y numeración.
3. Se actualiza el stock (si aplica) y se registra actividad.
4. Se descarga el **PDF del comprobante** como evidencia.

### 6.2 Flujo: caja por turno → movimientos → cierre → diferencia

1. Abrir caja con monto de apertura.
2. Registrar movimientos de caja con motivos.
3. Cerrar caja ingresando monto final (y desglose).
4. El sistema calcula:
   - Monto esperado (apertura + ventas + movimientos).
   - Diferencia (monto final − esperado).
5. Se descarga el **PDF del cierre**.

### 6.3 Flujo: transferencias entre locales (lotes)

1. Generar envío por lote (origen/destino + ítems).
2. Se obtiene un código de envío.
3. Se imprime/descarga el **PDF del envío**.
4. En destino, se recibe u observa el envío, cambiando el estado (trazabilidad completa).

## 7) Usuarios de prueba (demo)

| Rol | Usuario | Contraseña | Nota |
|---|---|---|---|
| SUPERVISOR | `supervisor.pn@bitel.local` | `demo123` | Operación completa por local |
| VENDEDOR | `vendedor.pn@bitel.local` | `demo123` | Ventas + caja (inventario solo lectura) |
| AUDITOR | `auditor@bitel.local` | `demo123` | Solo lectura / control |

## 8) Recomendaciones para la presentación al encargado

- Empezar por **Resumen** para contexto rápido.
- Ir a **Operación diaria** y hacer 1 venta completa + 1 ciclo de caja.
- Mostrar 1 **PDF de venta** y 1 **PDF de cierre**.
- Ir a **Inventario** para explicar stock y luego hacer 1 transferencia por lote + PDF.
- Finalizar mostrando **auditoría** con el rol `AUDITOR` para evidenciar control y trazabilidad.

