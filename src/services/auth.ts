/**
 * Manejo del token personal de GitHub.
 *
 * DECISIÓN DE ARQUITECTURA:
 * Cada persona genera su propio "Fine-grained Personal Access Token" en su
 * cuenta de GitHub (Settings → Developer settings → Fine-grained tokens),
 * con permiso de lectura/escritura ÚNICAMENTE sobre este repositorio.
 *
 * El token se guarda en localStorage — es decir, SOLO en el navegador de
 * esa persona, nunca se sube al repositorio, nunca pasa por un servidor
 * nuestro (no existe un servidor nuestro). Esto es lo que permite que la
 * app funcione sin backend propio y sin costo: quien no tenga un token
 * válido con permiso de escritura sobre el repo simplemente no puede
 * guardar cambios, pero cualquiera con el link puede ver la app.
 *
 * Si el token se filtra, se revoca desde GitHub.com en un clic y dejará
 * de funcionar de inmediato — mucho más seguro que una contraseña fija.
 */

const TOKEN_KEY = 'pg_gh_token';
const OWNER_KEY = 'pg_gh_owner';
const REPO_KEY = 'pg_gh_repo';
const BRANCH_KEY = 'pg_gh_branch';

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

export function getStoredConfig(): GitHubConfig | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const owner = localStorage.getItem(OWNER_KEY);
  const repo = localStorage.getItem(REPO_KEY);
  const branch = localStorage.getItem(BRANCH_KEY) || 'main';
  if (!token || !owner || !repo) return null;
  return { token, owner, repo, branch };
}

export function saveConfig(cfg: GitHubConfig): void {
  localStorage.setItem(TOKEN_KEY, cfg.token);
  localStorage.setItem(OWNER_KEY, cfg.owner);
  localStorage.setItem(REPO_KEY, cfg.repo);
  localStorage.setItem(BRANCH_KEY, cfg.branch || 'main');
}

export function clearConfig(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(OWNER_KEY);
  localStorage.removeItem(REPO_KEY);
  localStorage.removeItem(BRANCH_KEY);
}

export function isConfigured(): boolean {
  return getStoredConfig() !== null;
}
