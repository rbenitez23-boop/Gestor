/**
 * githubStore.ts — GitHub como base de datos.
 *
 * DECISIÓN DE ARQUITECTURA (ver ARCHITECTURE.md para el detalle completo):
 * En vez de depender de un servidor propio o un servicio de terceros, todo
 * el estado del inventario vive en un único archivo JSON dentro de este
 * mismo repositorio (`data/db.json`), leído y escrito directamente desde
 * el navegador vía la API REST oficial de GitHub (Contents API).
 *
 * Esto nos da, gratis, algo que ni un backend propio nos daría tan fácil:
 *   - Historial completo e inmutable de cada cambio (cada guardado es un
 *     commit real, con autor, fecha y diff).
 *   - Reversión de errores con `git revert` desde GitHub.com.
 *   - Cero infraestructura que mantener, cero costo, cero credenciales de
 *     base de datos que proteger más allá del token personal de cada quien.
 *
 * CONTROL DE CONCURRENCIA (optimistic locking):
 * GitHub exige el `sha` del contenido actual del archivo para aceptar una
 * escritura. Si alguien más guardó un cambio entre que tú cargaste los
 * datos y que intentas guardar los tuyos, GitHub rechaza el commit con un
 * 409 — nunca se pisan cambios silenciosamente. `saveDatabase` expone ese
 * conflicto como `ConflictError` para que la UI le pida al usuario
 * recargar antes de reintentar. Es el equivalente directo al
 * `LockService.getScriptLock()` del Apps Script original, adaptado a un
 * modelo sin servidor.
 */

import type { Database } from '../types';
import { getStoredConfig } from './auth';

const DB_PATH = 'data/db.json';

export class ConflictError extends Error {
  constructor() {
    super('Alguien más guardó un cambio justo antes que tú. Recarga los datos e intenta de nuevo.');
    this.name = 'ConflictError';
  }
}

export class AuthError extends Error {
  constructor(msg = 'Tu token de GitHub no es válido o no tiene permiso de escritura sobre este repositorio.') {
    super(msg);
    this.name = 'AuthError';
  }
}

export class NotConfiguredError extends Error {
  constructor() {
    super('No has configurado tu acceso a GitHub todavía.');
    this.name = 'NotConfiguredError';
  }
}

interface LoadedDatabase {
  data: Database;
  sha: string;
}

function apiBase(): { url: string; headers: Record<string, string> } {
  const cfg = getStoredConfig();
  if (!cfg) throw new NotConfiguredError();
  return {
    url: `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${DB_PATH}?ref=${cfg.branch}`,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  };
}

// Los archivos se escriben codificados en base64 estándar; usamos
// TextDecoder/Encoder para soportar acentos y ñ correctamente (UTF-8).
function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

/**
 * Lee la base de datos actual desde el repositorio (siempre la versión
 * más reciente de la rama).
 *
 * NOTA IMPORTANTE: la API de "Contents" de GitHub solo incluye el
 * contenido codificado en base64 cuando el archivo pesa menos de 1 MB.
 * Nuestro `data/db.json` crece con el historial real (movimientos,
 * remisiones) y ya supera ese límite. En vez de pelear con los distintos
 * media types de esa API, leemos el contenido real directamente desde
 * `raw.githubusercontent.com` — el servicio de archivos crudos de GitHub,
 * que no tiene ese límite práctico — y usamos la API de Contents
 * únicamente para obtener el `sha` (necesario para el control de
 * concurrencia al guardar).
 */
export async function loadDatabase(): Promise<LoadedDatabase> {
  const cfg = getStoredConfig();
  if (!cfg) throw new NotConfiguredError();
  const { url, headers } = apiBase();

  // 1) Metadatos — siempre trae el `sha`, sin importar el tamaño del archivo.
  const metaRes = await fetch(url, { headers, cache: 'no-store' });
  if (metaRes.status === 401 || metaRes.status === 403) throw new AuthError();
  if (!metaRes.ok) throw new Error(`No se pudo leer la base de datos (HTTP ${metaRes.status})`);
  const meta = await metaRes.json();

  // 2) Contenido real, siempre desde el servicio de archivos crudos.
  // IMPORTANTE: no se manda el header Authorization aquí — agregarlo
  // provoca que el navegador bloquee la petición por política CORS
  // (preflight) contra raw.githubusercontent.com. Como el repositorio es
  // público, el contenido se puede leer sin token de todas formas.
  const rawUrl = `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}/${DB_PATH}`;
  const rawRes = await fetch(rawUrl, { cache: 'no-store' });
  if (!rawRes.ok) throw new Error(`No se pudo leer el contenido de la base de datos (HTTP ${rawRes.status})`);
  const text = await rawRes.text();
  return { data: JSON.parse(text) as Database, sha: meta.sha };
}

/**
 * Guarda la base de datos completa como un nuevo commit.
 * @param data   El estado completo a guardar (se sobreescribe el archivo).
 * @param sha    El `sha` obtenido en el último `loadDatabase()` — es la
 *               prueba de "esto es lo último que vi"; si ya no coincide,
 *               GitHub responde 409 y lanzamos ConflictError.
 * @param message Mensaje de commit legible — aparece en el historial real
 *               de git, así que se redacta como bitácora del negocio.
 */
export async function saveDatabase(data: Database, sha: string, message: string): Promise<{ sha: string }> {
  const cfg = getStoredConfig();
  if (!cfg) throw new NotConfiguredError();
  const { url } = apiBase();
  const putUrl = url.split('?')[0] ?? url;
  const body = {
    message,
    content: encodeBase64Utf8(JSON.stringify(data, null, 2)),
    sha,
    branch: cfg.branch,
  };
  const res = await fetch(putUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (res.status === 409) throw new ConflictError();
  if (res.status === 401 || res.status === 403) throw new AuthError();
  if (!res.ok) throw new Error(`No se pudo guardar (HTTP ${res.status})`);
  const json = await res.json();
  return { sha: json.content.sha as string };
}

/**
 * Guarda con reintento automático UNA vez si hubo conflicto: vuelve a leer
 * los datos frescos, aplica la misma transformación sobre ellos, y
 * reintenta. Si vuelve a chocar, se lo pasa al usuario en vez de
 * reintentar indefinidamente (evita loops silenciosos).
 */
export async function saveWithRetry(
  mutate: (current: Database) => Database,
  message: string
): Promise<Database> {
  const first = await loadDatabase();
  const next = mutate(first.data);
  try {
    await saveDatabase(next, first.sha, message);
    return next;
  } catch (e) {
    if (e instanceof ConflictError) {
      const fresh = await loadDatabase();
      const retried = mutate(fresh.data);
      await saveDatabase(retried, fresh.sha, message);
      return retried;
    }
    throw e;
  }
}
