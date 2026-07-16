# Peña Grande — Inventario

Sistema de inventario para Peña Grande. SPA (Single Page Application) en TypeScript, **sin servidor propio, sin costo, sin apps externas** — corre 100% desde GitHub: GitHub Pages sirve la aplicación, y este mismo repositorio (`data/db.json`) funciona como base de datos, vía la API oficial de GitHub.

➡️ Si es tu primera vez aquí, empieza por **[ARCHITECTURE.md](./ARCHITECTURE.md)** para entender las decisiones de diseño y sus límites reales antes de usarlo en producción.

> ℹ️ **Este repositorio ya viene compilado y listo.** `data/db.json` y `docs/` ya están generados — no necesitas instalar Node, npm, ni correr ningún script para empezar a usarlo. Solo sube el contenido a GitHub y activa Pages (sección "Puesta en marcha" abajo). Los comandos de `npm` son solo para cuando alguien quiera *modificar el código* más adelante.

> ⚠️ **Seguridad — hazlo en cuanto despliegues:** el PIN de Remisiones Contables viene en **1234** por default. Cámbialo desde la app (Remisiones Contables → Cambiar PIN) apenas la tengas funcionando — cualquiera que lea este repositorio conoce el PIN inicial.

## Estado del proyecto

| Módulo | Estado |
|---|---|
| Motor de stock (altas, salidas, traspasos, ROP, prioridades) | ✅ Migrado y probado |
| Materiales (catálogo, alta, edición) | ✅ Migrado |
| Movimientos (registrar, eliminar) | ✅ Migrado |
| Dashboard (valor de almacén, últimos movimientos) | ✅ Migrado |
| Lista de Compras (prioridad, demanda de remisiones activas) | ✅ Migrado y probado |
| Proveedores (alta, edición, baja) | ✅ Migrado |
| Remisiones (con destino, checklist, regreso) | ✅ Migrado y probado |
| Remisiones Contables (PIN con hash SHA-256, nunca texto plano) | ✅ Migrado y probado |
| Recetario (alta/edición de actividades desde la UI) | ✅ Migrado y probado |
| Auto-Remisión (motor de texto contra Recetario, sin IA) | ✅ Migrado y probado |
| Layouts (mapa visual arrastrable del almacén) | 🚧 Pendiente — el único módulo que falta, es el más complejo (editor SVG con drag & resize) |

**41 pruebas unitarias pasando**, incluida la lógica más delicada: cálculo de stock por almacén, "se envía vs. ya está en la sede" de Remisiones, y la consolidación de materiales reutilizables por bloque de horario simultáneo de Auto-Remisión.

**Nada de lo migrado cambia una sola regla de negocio del sistema original** — el motor de stock es una traducción línea por línea del `Code.gs` original, con pruebas unitarias que lo demuestran.

## Puesta en marcha (una sola vez)

```bash
npm install
npm run seed     # genera data/catalogo.seed.json, recetario.seed.json, etc. y data/db.json
npm run build    # compila la app a /docs
```

1. Crea un repositorio nuevo en GitHub y sube todo este contenido.
2. Ve a **Settings → Pages** en tu repo → Source: `Deploy from a branch` → Branch: `main`, carpeta `/docs`.
3. En unos minutos tu app estará en `https://TU_USUARIO.github.io/TU_REPO/`.
4. Comparte ese link con las 3-4 personas que van a usar el sistema.

## Cómo entra cada persona (una sola vez, 2 minutos)

Cada quien necesita su propio token de GitHub para poder **guardar** cambios (ver sin token también funciona, pero no permite guardar):

1. Entra a [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new)
2. **Repository access** → `Only select repositories` → elige este repo.
3. **Permissions → Repository permissions → Contents** → `Read and write`.
4. Genera el token, cópialo.
5. Abre el link de la app → pega usuario, repositorio, rama (`main`) y el token.

El token se guarda **solo en ese navegador** (localStorage) — nunca se sube al repo, nunca pasa por un servidor de terceros.

## Desarrollo local

```bash
npm run dev        # servidor local con recarga
npm run typecheck  # TypeScript estricto
npm test           # pruebas unitarias (Vitest)
```

## Actualizar tu inventario real

Los datos base (`data/db.json`) se generaron con el catálogo y recetario del sistema original en Apps Script. Si tienes un export de tu Google Sheet real (stock actual, historial de movimientos, remisiones), pásalo y se incorpora a `data/db.json` sin tocar el código.
