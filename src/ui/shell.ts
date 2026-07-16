import type { Database } from '../types';
import { store } from '../services/store';
import { toast, showLoader, hideLoader } from './helpers';

export type ViewId = 'dashboard' | 'materiales' | 'movimientos' | 'remisiones' | 'proveedores' | 'recetario' | 'compras' | 'contable' | 'autoremision' | 'layouts' | 'scanner' | 'etiquetasqr';

const NAV: { id: ViewId; label: string; section?: string }[] = [
  { id: 'dashboard', label: 'Dashboard', section: 'Principal' },
  { id: 'materiales', label: 'Materiales' },
  { id: 'movimientos', label: 'Movimientos' },
  { id: 'remisiones', label: 'Remisiones' },
  { id: 'autoremision', label: 'Auto-Remisión' },
  { id: 'compras', label: 'Lista de Compras' },
  { id: 'scanner', label: '📷 Escáner QR', section: 'Herramientas' },
  { id: 'etiquetasqr', label: '🏷️ Etiquetas QR' },
  { id: 'proveedores', label: 'Proveedores', section: 'Catálogos' },
  { id: 'recetario', label: 'Recetario' },
  { id: 'layouts', label: 'Layouts (mapa del almacén)' },
  { id: 'contable', label: 'Remisiones Contables 🔒', section: 'Administración' },
];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function comprimirLogo(dataUrl: string, maxDim = 160, calidad = 0.85): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png', calidad));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export function renderShell(root: HTMLElement, db: Database, active: ViewId, onNav: (v: ViewId) => void): HTMLElement {
  const logo = db.uiConfig?.logoDataUrl || '';
  const activeLabel = NAV.find((n) => n.id === active)?.label || '';

  root.innerHTML = `
    <div class="app-shell">
      <button class="mobile-menu-btn" id="shell-menu-btn" aria-label="Abrir menú">☰</button>
      <div class="mobile-topbar-title">${activeLabel}</div>
      <div class="sidebar-overlay" id="shell-overlay"></div>
      <nav class="sidebar" id="shell-sidebar">
        <div class="sidebar-title" style="display:flex;align-items:center;gap:10px">
          <div id="shell-logo-wrap" style="width:32px;height:32px;border-radius:8px;background:rgba(255,255,255,.1);display:grid;place-items:center;flex-shrink:0;cursor:pointer;overflow:hidden" title="Subir logo">
            ${logo ? `<img src="${logo}" style="width:100%;height:100%;object-fit:cover"/>` : '<span style="font-size:15px">🏕️</span>'}
          </div>
          <input type="file" accept="image/*" id="shell-logo-input" style="display:none"/>
          <div>Peña Grande<small>Inventario</small></div>
        </div>
        <div class="nav" id="shell-nav"></div>
      </nav>
      <main class="main">
        <div class="content" id="shell-content"></div>
      </main>
    </div>`;

  const sidebar = root.querySelector('#shell-sidebar') as HTMLElement;
  const overlay = root.querySelector('#shell-overlay') as HTMLElement;
  const closeMobileMenu = () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
  };
  root.querySelector('#shell-menu-btn')?.addEventListener('click', () => {
    sidebar.classList.add('open');
    overlay.classList.add('open');
  });
  overlay.addEventListener('click', closeMobileMenu);

  const navEl = root.querySelector('#shell-nav')!;
  let lastSection = '';
  NAV.forEach((item) => {
    if (item.section && item.section !== lastSection) {
      lastSection = item.section;
      const s = document.createElement('div');
      s.className = 'nav-section';
      s.textContent = item.section;
      navEl.appendChild(s);
    }
    const el = document.createElement('div');
    el.className = 'nav-item' + (item.id === active ? ' active' : '');
    el.textContent = item.label;
    el.addEventListener('click', () => {
      closeMobileMenu();
      onNav(item.id);
    });
    navEl.appendChild(el);
  });

  const logoInput = root.querySelector('#shell-logo-input') as HTMLInputElement;
  root.querySelector('#shell-logo-wrap')?.addEventListener('click', () => logoInput.click());
  logoInput.addEventListener('change', async () => {
    const file = logoInput.files?.[0];
    if (!file) return;
    showLoader('Guardando logo…');
    try {
      const raw = await fileToDataUrl(file);
      const comprimido = await comprimirLogo(raw);
      await store.mutate((current) => ({ ...current, uiConfig: { ...current.uiConfig, logoDataUrl: comprimido } }), 'Actualizar logo');
      toast('Logo actualizado ✓', 's');
      onNav(active); // re-pinta la vista actual con el logo nuevo
    } catch (e) {
      toast('Error: ' + (e as Error).message, 'e');
    } finally {
      hideLoader();
    }
  });

  return root.querySelector('#shell-content')!;
}
