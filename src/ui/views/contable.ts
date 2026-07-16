import type { Database } from '../../types';
import { calcularReporteContable, verificarPin } from '../../domain/contable';
import { sha256 } from '../../services/crypto';
import { store } from '../../services/store';
import { fmtMoney, esc, toast, showLoader, hideLoader } from '../helpers';

export function renderContable(container: HTMLElement, db: Database) {
  container.innerHTML = `
    <div style="max-width:420px;margin:40px auto">
      <div class="card" style="padding:28px;text-align:center">
        <div style="font-size:32px;margin-bottom:6px">🔒</div>
        <div style="font-weight:800;font-size:17px;margin-bottom:4px">Remisiones Contables</div>
        <div style="font-size:12px;color:var(--gris-med);margin-bottom:18px">Acceso restringido — ingresa el PIN</div>
        <input type="password" class="fc" id="ct-pin" maxlength="10" placeholder="••••" style="text-align:center;font-size:20px;letter-spacing:6px;margin-bottom:10px"/>
        <div id="ct-error" style="color:var(--rojo);font-size:12px;min-height:16px;margin-bottom:8px"></div>
        <button class="btn btn-primary" style="width:100%;justify-content:center" id="ct-enter">Entrar</button>
        <div style="margin-top:14px;font-size:11px;color:var(--gris-med);text-decoration:underline;cursor:pointer" id="ct-change-link">Cambiar PIN</div>
        <div id="ct-change-box" style="display:none;margin-top:12px;text-align:left">
          <input type="password" class="fc" id="ct-pin-actual" placeholder="PIN actual" style="margin-bottom:8px"/>
          <input type="password" class="fc" id="ct-pin-nuevo" placeholder="Nuevo PIN (mín. 4 caracteres)" style="margin-bottom:8px"/>
          <button class="btn btn-ghost btn-sm" style="width:100%;justify-content:center" id="ct-change-save">Guardar nuevo PIN</button>
        </div>
      </div>
    </div>`;

  container.querySelector('#ct-change-link')?.addEventListener('click', () => {
    const box = container.querySelector('#ct-change-box') as HTMLElement;
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
  });

  container.querySelector('#ct-change-save')?.addEventListener('click', async () => {
    const actual = (document.getElementById('ct-pin-actual') as HTMLInputElement).value;
    const nuevo = (document.getElementById('ct-pin-nuevo') as HTMLInputElement).value;
    showLoader('Actualizando PIN…');
    try {
      const current = store.current;
      if (!current) throw new Error('No hay datos cargados');
      if (!(await verificarPin(current, actual))) throw new Error('El PIN actual no es correcto');
      if (!nuevo || nuevo.length < 4) throw new Error('El nuevo PIN debe tener al menos 4 caracteres');
      const nuevoHash = await sha256(nuevo);
      await store.mutate((fresh) => ({ ...fresh, contablePinHash: nuevoHash }), 'Cambio de PIN de Remisiones Contables');
      toast('PIN actualizado ✓', 's');
      (document.getElementById('ct-pin-actual') as HTMLInputElement).value = '';
      (document.getElementById('ct-pin-nuevo') as HTMLInputElement).value = '';
    } catch (e) {
      toast('Error: ' + (e as Error).message, 'e');
    } finally {
      hideLoader();
    }
  });

  const enter = async () => {
    const pin = (document.getElementById('ct-pin') as HTMLInputElement).value;
    const errEl = container.querySelector('#ct-error')!;
    errEl.textContent = '';
    if (!pin) {
      errEl.textContent = 'Ingresa el PIN';
      return;
    }
    if (!(await verificarPin(db, pin))) {
      errEl.textContent = 'PIN incorrecto';
      return;
    }
    renderReporte(container, db);
  };
  container.querySelector('#ct-enter')?.addEventListener('click', enter);
  container.querySelector('#ct-pin')?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') enter();
  });
}

function renderReporte(container: HTMLElement, db: Database) {
  const { remisiones, totales } = calcularReporteContable(db);

  container.innerHTML = `
    <div style="margin-bottom:20px"><h1 style="font-size:22px;font-weight:800">📊 Remisiones Contables</h1><p style="color:var(--gris-med);font-size:13px">Costo real de cada evento — Consumibles vs Depreciables</p></div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Consumibles</div><div class="stat-value">${fmtMoney(totales.consumibles)}</div></div>
      <div class="stat-card" style="border-color:rgba(108,71,255,.3)"><div class="stat-label">Depreciables</div><div class="stat-value" style="color:#6c47ff">${fmtMoney(totales.depreciables)}</div></div>
      <div class="stat-card" style="border-color:var(--azul)"><div class="stat-label">Total</div><div class="stat-value" style="color:var(--azul)">${fmtMoney(totales.total)}</div></div>
    </div>
    <div class="card"><div class="card-header"><span class="card-title">Costo por remisión</span></div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Folio</th><th>Cliente/Evento</th><th>Fecha</th><th>Estado</th><th>Consumibles</th><th>Depreciables</th><th>Total</th></tr></thead>
      <tbody>${
        remisiones.length
          ? remisiones
              .map(
                (r) => `<tr>
              <td style="font-weight:700">${r.folio}</td>
              <td>${esc(r.cliente)}${r.evento ? ' — ' + esc(r.evento) : ''}</td>
              <td>${esc(r.fechaSalida)}</td>
              <td><span class="semaforo ${r.cerrada ? 'sem-ok' : 'sem-media'}">${r.cerrada ? 'Cerrada' : 'Activa'}</span></td>
              <td>${fmtMoney(r.costoConsumibles)}</td>
              <td style="color:#6c47ff">${fmtMoney(r.costoDepreciables)}</td>
              <td style="font-weight:700">${fmtMoney(r.costoTotal)}</td>
            </tr>`
              )
              .join('')
          : '<tr><td colspan="7" class="empty-state">Sin remisiones registradas todavía</td></tr>'
      }</tbody>
    </table></div></div>`;
}
