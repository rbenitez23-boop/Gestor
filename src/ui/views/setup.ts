import { saveConfig } from '../../services/auth';
import { toast } from '../helpers';

export function renderSetup(container: HTMLElement, onDone: () => void) {
  container.innerHTML = `
  <div class="setup-wrap">
    <div class="setup-card">
      <h1 style="font-size:20px;font-weight:800;margin-bottom:4px">Conectar con GitHub</h1>
      <p style="font-size:13px;color:var(--gris-med);margin-bottom:20px">Tus credenciales se guardan únicamente en este navegador. Nunca se suben al repositorio ni pasan por ningún servidor externo.</p>

      <div class="setup-step"><b>1.</b> Ve a <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a> y crea un <b>Fine-grained personal access token</b>.</div>
      <div class="setup-step"><b>2.</b> En "Repository access" elige <b>Only select repositories</b> → selecciona este repo.</div>
      <div class="setup-step"><b>3.</b> En "Permissions" → "Repository permissions" → <b>Contents: Read and write</b>.</div>
      <div class="setup-step"><b>4.</b> Copia el token generado (empieza con <code>github_pat_…</code>) y pégalo abajo.</div>

      <div class="fg" style="margin-top:18px">
        <label class="fl">Usuario u organización de GitHub <span>*</span></label>
        <input class="fc" id="su-owner" placeholder="ej. pena-grande"/>
      </div>
      <div class="fg">
        <label class="fl">Nombre del repositorio <span>*</span></label>
        <input class="fc" id="su-repo" placeholder="ej. pena-grande-inventario"/>
      </div>
      <div class="fg">
        <label class="fl">Rama <span>*</span></label>
        <input class="fc" id="su-branch" value="main"/>
      </div>
      <div class="fg">
        <label class="fl">Tu token personal <span>*</span></label>
        <input class="fc" id="su-token" type="password" placeholder="github_pat_…"/>
      </div>
      <button class="btn btn-primary" style="width:100%;justify-content:center" id="su-save">Conectar y entrar</button>
    </div>
  </div>`;

  container.querySelector('#su-save')?.addEventListener('click', () => {
    const owner = (document.getElementById('su-owner') as HTMLInputElement).value.trim();
    const repo = (document.getElementById('su-repo') as HTMLInputElement).value.trim();
    const branch = (document.getElementById('su-branch') as HTMLInputElement).value.trim() || 'main';
    const token = (document.getElementById('su-token') as HTMLInputElement).value.trim();
    if (!owner || !repo || !token) {
      toast('Completa usuario, repositorio y token', 'e');
      return;
    }
    saveConfig({ owner, repo, branch, token });
    toast('Conectado ✓', 's');
    onDone();
  });
}
