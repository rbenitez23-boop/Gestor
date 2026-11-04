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

// Los archivos se escriben/leen codificados en base64 estándar; usamos
// TextDecoder/Encoder para soportar acentos y ñ correctamente (UTF-8).
function decodeBase64Utf8(b64: string): string {
  const binary = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  // Por bloques: carácter por carácter era lento con archivos de varios MB.
  let binary = '';
  const BLOQUE = 0x8000;
  for (let i = 0; i < bytes.length; i += BLOQUE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BLOQUE));
  }
  return btoa(binary);
}

/**
 * Lee la base de datos actual desde el repositorio (siempre la versión
 * más reciente de la rama).
 *
 * NOTA IMPORTANTE — por qué NO usamos raw.githubusercontent.com:
 * Ese servicio de GitHub pasa por una red de caché (CDN) que puede tardar
 * unos minutos en reflejar un commit recién hecho — así que después de
 * guardar, una lectura inmediata podía traer todavía la versión anterior,
 * aunque el commit ya existiera. Usamos en su lugar la API de "Git Blobs"
 * (`/git/blobs/{sha}`), que identifica el contenido por su propio hash:
 * como el sha cambia cada vez que el archivo cambia, es matemáticamente
 * imposible que devuelva datos viejos bajo un sha nuevo — y de paso sigue
 * soportando archivos grandes (hasta 100 MB) sin el límite de 1 MB de la
 * API de "Contents" para contenido embebido.
 */
export async function loadDatabase(): Promise<LoadedDatabase> {
  const cfg = getStoredConfig();
  if (!cfg) throw new NotConfiguredError();
  const { url, headers } = apiBase();

  // 1) Metadatos — siempre trae el `sha` actual, sin importar el tamaño.
  const metaRes = await fetchConLimite(url, { headers, cache: 'no-store' });
  if (metaRes.status === 401 || metaRes.status === 403) throw new AuthError();
  if (!metaRes.ok) throw new Error(`No se pudo leer la base de datos (HTTP ${metaRes.status})`);
  const meta = await metaRes.json();

  // 2) Contenido real por su sha exacto — inmune a caché desactualizada.
  const blobUrl = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/git/blobs/${meta.sha}`;
  const blobRes = await fetchConLimite(blobUrl, { headers, cache: 'no-store' }, 120_000);
  if (blobRes.status === 401 || blobRes.status === 403) throw new AuthError();
  if (!blobRes.ok) throw new Error(`No se pudo leer el contenido de la base de datos (HTTP ${blobRes.status})`);
  const blob = await blobRes.json();
  const content = decodeBase64Utf8(blob.content);
  return { data: JSON.parse(content) as Database, sha: meta.sha };
}

// ── Tiempo límite por petición ──
// Sin esto, si GitHub no responde, la app se quedaba "cargando" para
// siempre sin decir nada. Ahora, pasado el límite, se muestra un error claro.
const LIMITE_MS = 60_000;

export class TimeoutError extends Error {
  constructor() {
    super('GitHub tardó demasiado en responder. Revisa tu internet e intenta de nuevo.');
    this.name = 'TimeoutError';
  }
}

async function fetchConLimite(url: string, init: RequestInit = {}, limiteMs = LIMITE_MS): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), limiteMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new TimeoutError();
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Guarda la base de datos completa como un nuevo commit.
 *
 * Usa la API de "Git Data" (blob → tree → commit → ref) en lugar del PUT de
 * la API de Contents: el PUT de Contents se vuelve lento o se cuelga con
 * archivos de varios MB (como db.json, que ya pasa de 2 MB), mientras que
 * los blobs están hechos para archivos grandes (hasta 100 MB).
 *
 * Además, el JSON se guarda compacto (sin sangrías): ~30% más ligero, mismo
 * contenido. El historial de GitHub lo sigue mostrando normal.
 *
 * Control de concurrencia (igual que antes, nunca se pisan cambios):
 *  1) Si db.json ya no tiene el `sha` que cargamos → ConflictError.
 *  2) El commit nuevo cuelga del último commit de la rama; si alguien hizo
 *     otro commit en medio, GitHub rechaza mover la rama (no fast-forward)
 *     → ConflictError, y saveWithRetry reintenta con datos frescos.
 *
 * @param data   El estado completo a guardar (se sobreescribe el archivo).
 * @param sha    El `sha` de db.json obtenido en el último `loadDatabase()`.
 * @param message Mensaje de commit legible (bitácora del negocio).
 */
export async function saveDatabase(data: Database, sha: string, message: string): Promise<{ sha: string }> {
  const cfg = getStoredConfig();
  if (!cfg) throw new NotConfiguredError();
  const repoApi = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}`;
  const headers = {
    Authorization: `Bearer ${cfg.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
  const revisar = async (res: Response, que: string) => {
    if (res.status === 401 || res.status === 403) throw new AuthError();
    if (res.status === 409) throw new ConflictError();
    if (!res.ok) throw new Error(`No se pudo guardar (${que}, HTTP ${res.status})`);
    return res.json();
  };
  const refUrl = `${repoApi}/git/refs/heads/${encodeURIComponent(cfg.branch)}`;

  // 1) ¿Sigue db.json igual a como lo cargamos? (solo metadatos, es ligero)
  const meta = await revisar(await fetchConLimite(apiBase().url, { headers, cache: 'no-store' }), 'leer versión actual');
  if (meta.sha !== sha) throw new ConflictError();

  // 2) Último commit de la rama y su árbol de archivos.
  const ref = await revisar(await fetchConLimite(refUrl, { headers, cache: 'no-store' }), 'leer rama');
  const headSha: string = ref.object.sha;
  const headCommit = await revisar(await fetchConLimite(`${repoApi}/git/commits/${headSha}`, { headers, cache: 'no-store' }), 'leer commit');

  // 3) Sube el contenido nuevo como blob (la parte pesada; tiene más margen de tiempo).
  const blob = await revisar(
    await fetchConLimite(
      `${repoApi}/git/blobs`,
      { method: 'POST', headers, body: JSON.stringify({ content: encodeBase64Utf8(JSON.stringify(data)), encoding: 'base64' }) },
      120_000
    ),
    'subir datos'
  );

  // 4) Árbol nuevo = árbol actual con db.json reemplazado.
  const tree = await revisar(
    await fetchConLimite(`${repoApi}/git/trees`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ base_tree: headCommit.tree.sha, tree: [{ path: DB_PATH, mode: '100644', type: 'blob', sha: blob.sha }] }),
    }),
    'armar cambios'
  );

  // 5) Commit nuevo encima del último.
  const commit = await revisar(
    await fetchConLimite(`${repoApi}/git/commits`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, tree: tree.sha, parents: [headSha] }),
    }),
    'crear commit'
  );

  // 6) Mueve la rama al commit nuevo (sin forzar: si alguien se adelantó, falla → conflicto).
  const mover = await fetchConLimite(refUrl, { method: 'PATCH', headers, body: JSON.stringify({ sha: commit.sha, force: false }) });
  if (mover.status === 422 || mover.status === 409) throw new ConflictError();
  await revisar(mover, 'actualizar rama');

  return { sha: blob.sha as string };
}

/**
 * Guarda con reintento automático si hubo conflicto: vuelve a leer los
 * datos frescos, aplica la misma transformación sobre ellos, y
 * reintenta — hasta 5 veces, con una pequeña espera aleatoria entre cada
 * intento (evita que dos guardados que chocaron una vez vuelvan a chocar
 * exactamente igual la siguiente). Esto ya es una defensa extra; el
 * motivo más común de conflicto —guardados del mismo usuario cruzándose—
 * ya se evita en la cola de Store.mutate.
 */
export async function saveWithRetry(
  mutate: (current: Database) => Database,
  message: string
): Promise<Database> {
  let intentos = 0;
  let ultimoError: unknown;
  while (intentos < 5) {
    intentos++;
    try {
      const { data, sha } = await loadDatabase();
      const next = mutate(data);
      await saveDatabase(next, sha, message);
      return next;
    } catch (e) {
      ultimoError = e;
      if (!(e instanceof ConflictError)) throw e;
      // Conflicto real: alguien más guardó justo antes — espera un
      // momento aleatorio (evita que varios dispositivos reintenten
      // exactamente al mismo tiempo otra vez) y reintenta con datos frescos.
      const esperaMs = 150 + Math.random() * 350;
      await new Promise((r) => setTimeout(r, esperaMs));
    }
  }
  throw ultimoError;
}
