/**
 * Hash SHA-256 vía Web Crypto API (nativa del navegador, sin dependencias).
 * El PIN de Remisiones Contables nunca se guarda ni se compara en texto
 * plano — se compara el hash contra `db.contablePinHash`.
 */
export async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
