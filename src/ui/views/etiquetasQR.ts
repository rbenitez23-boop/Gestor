import type { Database } from '../../types';
import { generarQrDataUrl } from '../../services/qr';
import { esc, showLoader, hideLoader, toast } from '../helpers';

export function renderEtiquetasQR(container: HTMLElement, db: Database) {
  const materiales = db.materiales.filter((m) => m.activo !== false).sort((a, b) => a.nombre.localeCompare(b.nombre));

  container.innerHTML = `
    <div class="no-print" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div><h1 style="font-size:22px;font-weight:800">Etiquetas QR</h1><p style="color:var(--gris-med);font-size:13px">Genera e imprime las etiquetas para pegar en racks/materiales</p></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" id="qr-generar">🏷️ Generar etiquetas</button>
        <button class="btn btn-orange" id="qr-imprimir" style="display:none">🖨️ Imprimir</button>
      </div>
    </div>
    <div class="no-print card" style="padding:12px 14px;margin-bottom:16px">
      <input class="fc" id="qr-filtro" placeholder="Filtrar materiales a incluir (déjalo vacío para todos)…"/>
      <div style="font-size:12px;color:var(--gris-med);margin-top:6px">${materiales.length} materiales activos en tu catálogo. Generar todas puede tardar unos segundos.</div>
    </div>
    <div id="qr-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:14px"></div>`;

  let filtro = '';
  container.querySelector('#qr-filtro')?.addEventListener('input', (e) => {
    filtro = (e.target as HTMLInputElement).value.toLowerCase();
  });

  container.querySelector('#qr-generar')?.addEventListener('click', async () => {
    const lista = materiales.filter((m) => m.nombre.toLowerCase().includes(filtro));
    if (!lista.length) {
      toast('Sin materiales que coincidan con el filtro', 'e');
      return;
    }
    showLoader(`Generando ${lista.length} códigos QR…`);
    try {
      const grid = container.querySelector('#qr-grid')!;
      grid.innerHTML = '';
      for (const m of lista) {
        const dataUrl = await generarQrDataUrl(m.id, 200);
        const div = document.createElement('div');
        div.className = 'qr-label';
        div.innerHTML = `
          <img src="${dataUrl}" style="width:100%;aspect-ratio:1/1;object-fit:contain"/>
          <div style="text-align:center;font-weight:700;font-size:12px;margin-top:4px;line-height:1.2">${esc(m.nombre)}</div>
          <div style="text-align:center;font-size:10px;color:var(--gris-med)">${m.id}</div>`;
        div.style.cssText = 'border:1.5px solid var(--gris);border-radius:8px;padding:10px;background:#fff;';
        grid.appendChild(div);
      }
      (container.querySelector('#qr-imprimir') as HTMLElement).style.display = '';
      toast(`${lista.length} etiquetas generadas ✓`, 's');
    } catch (e) {
      toast('Error generando QR: ' + (e as Error).message, 'e');
    } finally {
      hideLoader();
    }
  });

  container.querySelector('#qr-imprimir')?.addEventListener('click', () => window.print());
}
