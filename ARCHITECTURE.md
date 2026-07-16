# Arquitectura — Peña Grande Inventario

## Contexto y restricciones reales

Este sistema lo usan 3-4 personas para llevar el inventario de material de campamento: altas, salidas, préstamos, remisiones. El dueño del proyecto pidió explícitamente:

- Sin servidor propio que administrar.
- Sin costo, ni siquiera capas gratuitas de terceros (Render, Railway, etc.).
- Sin apps o extensiones externas.
- Todo debe vivir en GitHub.
- Accesible por un link para cualquiera del equipo.
- Datos protegidos, con historial y posibilidad de exportarlos/verlos en cualquier momento.

Estas restricciones, tomadas en conjunto, **eliminan cualquier arquitectura con backend tradicional** (Node.js + base de datos en un servidor). La única forma de cumplir *todas* al mismo tiempo es: hacer que el propio GitHub sea, a la vez, el servidor de archivos estáticos (GitHub Pages) y la base de datos (GitHub Contents API).

## Decisión: GitHub como plataforma completa

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  GitHub Pages                │        │  GitHub REST API              │
│  (docs/index.html, app.js)   │◄──────►│  (data/db.json vía Contents)  │
│  = "el servidor"             │  fetch │  = "la base de datos"         │
└─────────────────────────────┘        └──────────────────────────────┘
                ▲
                │ navegador de cada persona
                │ (token personal en localStorage)
```

- **Frontend**: TypeScript compilado con `esbuild` a un único `docs/app.js`, servido gratis por GitHub Pages. Sin framework — vanilla DOM — para minimizar dependencias externas y superficie de ataque.
- **Backend**: no existe. Cada acción de guardado es una llamada `fetch()` directa del navegador a `api.github.com`, autenticada con el token personal de quien está usando la app.
- **Base de datos**: un único archivo `data/db.json` versionado en git. Cada guardado es un commit real, con autor, fecha, y diff visible en GitHub.com.

## Por qué esto es más seguro que "guardarlo en mi escritorio"

Una base de datos local (SQLite en la computadora de una sola persona) no es compartible sin exponer esa computadora a internet — lo cual es un riesgo mucho mayor que este modelo. Aquí:

- Cada persona tiene su propio token, revocable individualmente en un clic desde GitHub.com si se pierde un celular o se va alguien del equipo.
- Cada cambio queda firmado con el usuario de GitHub que lo hizo — auditoría automática.
- El histórico completo es reversible (`git revert`) — un error de captura nunca es definitivo.
- El repositorio puede marcarse como **privado** en GitHub (recomendado) para que solo las personas invitadas puedan siquiera ver el código y los datos; el link de GitHub Pages seguiría siendo público a menos que uses GitHub Pages con visibilidad restringida (disponible en planes de pago) — ver sección "Privacidad del link" abajo.

## Concurrencia: qué pasa si dos personas guardan al mismo tiempo

Este es el trade-off explícito que se conversó y aceptó antes de construir esto. GitHub exige el `sha` del contenido actual para aceptar una escritura (optimistic locking). Si Ana guarda un cambio justo antes que Luis:

1. Luis intenta guardar con un `sha` que ya quedó obsoleto.
2. GitHub responde `409 Conflict`.
3. La app (`saveWithRetry` en `src/services/githubStore.ts`) recarga los datos frescos automáticamente, vuelve a aplicar el cambio de Luis sobre la versión nueva, y reintenta **una vez**.
4. Si vuelve a chocar (muy raro con 3-4 personas), se le pide a Luis recargar antes de reintentar — nunca se pierde información silenciosamente.

Es el equivalente directo al `LockService.getScriptLock()` del Apps Script original, adaptado a un modelo sin servidor central.

## Privacidad del link

Por defecto, un sitio en GitHub Pages de un repo público es visible para cualquiera con el link — igual que el Web App de Apps Script original. Si el inventario contiene información sensible (costos, proveedores, datos de clientes), dos opciones:

1. **Repo privado + GitHub Pages con acceso restringido**: requiere un plan de pago de GitHub (Pro/Team) — fuera del alcance de "gratis", pero es la opción más simple si en algún momento se justifica el gasto.
2. **Mantenerlo como está** (repo público, link "no listado"): nadie lo encuentra si no tiene el link exacto, igual que hoy. Aceptable para uso interno de un equipo pequeño, pero no es control de acceso real — cualquiera con el link puede *ver* los datos (no *modificarlos*, eso requiere token). Recomendación: no publicar el link fuera del equipo.

## Estructura de carpetas

```
src/
  types/           Contrato de datos compartido (TypeScript estricto)
  domain/          Lógica de negocio pura, sin I/O — 100% testeable
    stock.ts       Motor de cálculo de existencias (puerto fiel del original)
    materiales.ts  Catálogo + IDs secuenciales
    movimientos.ts Alta/baja de movimientos
  services/
    auth.ts        Manejo del token personal (solo localStorage)
    githubStore.ts Lectura/escritura de data/db.json vía GitHub API
    store.ts       Estado en memoria de la app + orquestación de guardado
  ui/
    shell.ts       Navegación SPA (sidebar + contenido, sin pestañas nuevas)
    views/         Una vista por pantalla
tests/domain/      Pruebas unitarias (Vitest) de la lógica de negocio
scripts/           Generación de datos semilla + build a /docs
data/               db.json (producción) + *.seed.json (datos base versionados)
docs/               Build final que sirve GitHub Pages (generado, no se edita a mano)
```

## Por qué no se abren pestañas nuevas

La versión en Apps Script abría `window.open()` a otras URLs de `HtmlService` para Layouts, Auto-Remisión, Escáner, etc. — sin botón de regreso, rompiendo el flujo. En esta arquitectura todo vive en un único documento HTML; la navegación entre secciones cambia el `#hash` de la URL y reemplaza el contenido del `<main>`, nunca abre una ventana nueva. Ver `src/app.ts` (router) y `src/ui/shell.ts`.

## Próximos pasos técnicos (roadmap)

Cada módulo pendiente sigue el mismo patrón ya establecido por Materiales/Movimientos:
1. Lógica pura en `src/domain/*.ts` (con pruebas).
2. Vista en `src/ui/views/*.ts` que la consume.
3. Alta en el router de `src/app.ts` y en `src/ui/shell.ts`.

Orden sugerido: Remisiones → Compras (reutiliza `calcularPrioridad`/`calcularROP` ya existentes) → Proveedores → Recetario (edición) → Auto-Remisión (motor de texto) → Contable (PIN con hash) → Layouts.
