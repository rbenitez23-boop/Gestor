import { isConfigured, clearConfig } from './services/auth';
import { store } from './services/store';
import { renderSetup } from './ui/views/setup';
import { renderShell, type ViewId } from './ui/shell';
import { renderDashboard } from './ui/views/dashboard';
import { renderMateriales } from './ui/views/materiales';
import { renderMovimientos } from './ui/views/movimientos';
import { renderCompras } from './ui/views/compras';
import { renderProveedores } from './ui/views/proveedores';
import { renderRemisiones, detenerEscaneoRemision } from './ui/views/remisiones';
import { renderContable } from './ui/views/contable';
import { renderRecetario } from './ui/views/recetario';
import { renderAutoRemision } from './ui/views/autoRemision';
import { renderLayouts } from './ui/views/layouts';
import { renderScanner, detenerEscaner } from './ui/views/scanner';
import { renderEtiquetasQR } from './ui/views/etiquetasQR';
import { showLoader, hideLoader, toast } from './ui/helpers';

const root = document.getElementById('app')!;
let vistaAnterior: ViewId | null = null;

function parseHashView(): ViewId {
  const h = window.location.hash.replace('#', '') as ViewId;
  const valid: ViewId[] = ['dashboard', 'materiales', 'movimientos', 'remisiones', 'proveedores', 'recetario', 'compras', 'contable', 'autoremision', 'layouts', 'scanner', 'etiquetasqr'];
  return valid.includes(h) ? h : 'dashboard';
}

async function boot() {
  if (!isConfigured()) {
    renderSetup(root, () => boot());
    return;
  }

  showLoader('Cargando inventario desde GitHub…');
  try {
    await store.load();
  } catch (e) {
    hideLoader();
    root.innerHTML = `<div class="setup-wrap"><div class="setup-card">
      <h1 style="font-size:18px;font-weight:800;margin-bottom:8px">No se pudo conectar</h1>
      <p style="font-size:13px;color:var(--gris-med);margin-bottom:16px">${(e as Error).message}</p>
      <button class="btn btn-ghost" id="btn-reconfig">Reconfigurar acceso a GitHub</button>
    </div></div>`;
    document.getElementById('btn-reconfig')?.addEventListener('click', () => {
      clearConfig();
      boot();
    });
    return;
  }
  hideLoader();
  renderApp();
}

function renderApp() {
  const view = parseHashView();
  const db = store.current;
  if (!db) return;

  // Si salimos de la pantalla del escáner, apaga la cámara siempre —
  // batería y privacidad primero. Nuestra SPA reemplaza el HTML del
  // contenedor en cada navegación sin un "ciclo de vida" formal, así que
  // esta es la única oportunidad de hacer esta limpieza.
  if (vistaAnterior === 'scanner' && view !== 'scanner') detenerEscaner();
  if (vistaAnterior === 'remisiones' && view !== 'remisiones') detenerEscaneoRemision();
  vistaAnterior = view;

  const navigate = (v: ViewId) => {
    if (window.location.hash.replace('#', '') === v) {
      renderApp();
    } else {
      window.location.hash = v;
    }
  };
  const contentEl = renderShell(root, db, view, navigate);
  paintView(view, contentEl);
}

function paintView(view: ViewId, contentEl: HTMLElement) {
  const db = store.current;
  if (!db) return;
  const refresh = () => renderApp();

  switch (view) {
    case 'dashboard':
      renderDashboard(contentEl, db);
      break;
    case 'materiales':
      renderMateriales(contentEl, db, refresh);
      break;
    case 'movimientos':
      renderMovimientos(contentEl, db, refresh);
      break;
    case 'remisiones':
      renderRemisiones(contentEl, db, refresh);
      break;
    case 'proveedores':
      renderProveedores(contentEl, db, refresh);
      break;
    case 'recetario':
      renderRecetario(contentEl, db, refresh);
      break;
    case 'compras':
      renderCompras(contentEl, db, refresh);
      break;
    case 'contable':
      renderContable(contentEl, db);
      break;
    case 'autoremision':
      renderAutoRemision(contentEl, db, refresh);
      break;
    case 'layouts':
      renderLayouts(contentEl, db, refresh);
      break;
    case 'scanner':
      renderScanner(contentEl, db, refresh);
      break;
    case 'etiquetasqr':
      renderEtiquetasQR(contentEl, db);
      break;
  }
}

window.addEventListener('hashchange', () => {
  const db = store.current;
  if (!db) return;
  renderApp();
});

window.addEventListener('beforeunload', () => detenerEscaner());

boot().catch((e) => {
  hideLoader();
  toast('Error inesperado: ' + (e as Error).message, 'e');
});
