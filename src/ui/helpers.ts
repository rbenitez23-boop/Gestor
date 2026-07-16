export function toast(msg: string, type: 's' | 'e' | 'i' = 'i') {
  let wrap = document.getElementById('toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'toast-wrap';
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.transition = '.2s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 200);
  }, 3200);
}

export function esc(s: string | number | null | undefined): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Descarga cualquier tabla como .csv — Excel lo abre directo, con acentos correctos (incluye BOM UTF-8). */
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const escapeCell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))];
  const csv = '\ufeff' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : filename + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Abre una foto en grande, a pantalla completa — clic afuera o en la ✕ para cerrar. */
export function lightbox(url: string) {
  if (!url) return;
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:9500;display:flex;align-items:center;justify-content:center;cursor:zoom-out;';
  el.innerHTML = `
    <span style="position:fixed;top:16px;right:20px;color:#fff;font-size:30px;cursor:pointer;opacity:.85;background:rgba(0,0,0,.4);width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;z-index:9501">✕</span>
    <img src="${esc(url)}" style="max-width:92vw;max-height:88vh;object-fit:contain;border-radius:8px;box-shadow:0 0 60px rgba(0,0,0,.5);cursor:default"/>`;
  el.addEventListener('click', (e) => {
    if (e.target === el || (e.target as HTMLElement).tagName === 'SPAN') el.remove();
  });
  document.body.appendChild(el);
}

let modalRoot: HTMLElement | null = null;
export function openModal(title: string, bodyHtml: string, footerHtml: string): HTMLElement {
  closeModal();
  modalRoot = document.createElement('div');
  modalRoot.className = 'modal-overlay';
  modalRoot.innerHTML = `
    <div class="modal">
      <div class="modal-header"><span class="card-title">${esc(title)}</span>
        <button class="btn btn-ghost btn-sm" data-close-modal>✕</button></div>
      <div class="modal-body">${bodyHtml}</div>
      <div class="modal-footer">${footerHtml}</div>
    </div>`;
  document.body.appendChild(modalRoot);
  requestAnimationFrame(() => modalRoot?.classList.add('open'));
  modalRoot.addEventListener('click', (e) => {
    if (e.target === modalRoot || (e.target as HTMLElement).closest('[data-close-modal]')) closeModal();
  });
  return modalRoot;
}
export function closeModal() {
  modalRoot?.remove();
  modalRoot = null;
}

let loaderEl: HTMLElement | null = null;
export function showLoader(msg = 'Cargando…') {
  if (!loaderEl) {
    loaderEl = document.createElement('div');
    loaderEl.style.cssText = 'position:fixed;inset:0;background:rgba(247,247,247,.88);z-index:9999;display:grid;place-items:center;backdrop-filter:blur(3px);';
    document.body.appendChild(loaderEl);
  }
  loaderEl.innerHTML = `<div style="text-align:center"><div style="width:36px;height:36px;border:3px solid var(--gris);border-top-color:var(--azul);border-radius:50%;margin:0 auto 10px;animation:spin .7s linear infinite"></div><div style="font-size:13px;color:var(--gris-med)">${esc(msg)}</div></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;
  loaderEl.style.display = 'grid';
}
export function hideLoader() {
  if (loaderEl) loaderEl.style.display = 'none';
}
