import type { Database, Movimiento, TipoMovimiento, TipoPaquete } from '../../types';
import { agregarMovimiento, eliminarMovimiento } from '../../domain/movimientos';
import { store } from '../../services/store';
import { openModal, closeModal, toast, esc, downloadCsv, showLoader, hideLoader } from '../helpers';

const TIPOS_MOV: TipoMovimiento[] = [
  'Alta de Producto', 'Baja de Producto', 'Entrada', 'Salida', 'Traspaso', 'Préstamo', 'Regreso', 'Fuera de Servicio', 'En Reparación',
];
const TIPOS_PAQUETE: TipoPaquete[] = ['Bolsa', 'Caja', 'Paquete Armado', 'Pieza Única'];

export function renderMovimientos(container: HTMLElement, db: Database, onChanged: () => void) {
  const todos = [...db.movimientos].reverse();
  let filtrados: Movimiento[] = todos;

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div><h1 style="font-size:22px;font-weight:800">Movimientos</h1><p style="color:var(--gris-med);font-size:13px" id="mov-contador">${db.movimientos.length} registrados</p></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" id="btn-export-mov">⬇️ Descargar Excel</button>
        <button class="btn btn-primary" id="btn-new-mov">+ Nuevo movimiento</button>
      </div>
    </div>
    <div class="card" style="padding:14px 16px;margin-bottom:16px">
      <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end">
        <div class="fg" style="margin-bottom:0"><label class="fl">Desde</label><input type="date" class="fc" id="mov-desde"/></div>
        <div class="fg" style="margin-bottom:0"><label class="fl">Hasta</label><input type="date" class="fc" id="mov-hasta"/></div>
        <button class="btn btn-ghost" id="mov-limpiar">Limpiar</button>
      </div>
    </div>
    <div class="card"><div class="tbl-wrap"><table>
      <thead><tr><th>Fecha</th><th>Material</th><th>Tipo</th><th>Unidades</th><th>Origen</th><th>Destino/Cliente</th><th></th></tr></thead>
      <tbody id="mov-tbody"></tbody>
    </table></div></div>`;

  function renderRows(list: Movimiento[]) {
    const tbody = container.querySelector('#mov-tbody')!;
    tbody.innerHTML = list.length
      ? list
          .map(
            (m) => `<tr>
              <td>${new Date(m.fecha).toLocaleString('es-MX')}</td>
              <td>${esc(m.materialNombre)}</td>
              <td>${esc(m.tipo)}</td>
              <td style="font-weight:700">${m.totalUnidades}</td>
              <td>${esc(m.origen || '—')}</td>
              <td>${esc(m.destino || m.cliente || '—')}</td>
              <td><button class="btn btn-ghost btn-sm" data-del="${m.idMov}">Eliminar</button></td>
            </tr>`
          )
          .join('')
      : '<tr><td colspan="7" class="empty-state">Sin movimientos en este rango</td></tr>';

    tbody.querySelectorAll<HTMLElement>('[data-del]').forEach((el) => {
      el.addEventListener('click', async () => {
        const idMov = el.dataset.del!;
        if (!confirm(`¿Eliminar el movimiento ${idMov}?`)) return;
        showLoader('Eliminando…');
        try {
          await store.mutate((current) => eliminarMovimiento(current, idMov), `Eliminar movimiento ${idMov}`);
          toast('Movimiento eliminado', 's');
          onChanged();
        } catch (e) {
          toast('Error: ' + (e as Error).message, 'e');
        } finally {
          hideLoader();
        }
      });
    });
  }

  function aplicarFiltro() {
    const desde = (container.querySelector('#mov-desde') as HTMLInputElement).value;
    const hasta = (container.querySelector('#mov-hasta') as HTMLInputElement).value;
    filtrados = todos.filter((m) => {
      const fechaMov = m.fecha.slice(0, 10); // YYYY-MM-DD
      if (desde && fechaMov < desde) return false;
      if (hasta && fechaMov > hasta) return false;
      return true;
    });
    renderRows(filtrados);
    const contador = container.querySelector('#mov-contador')!;
    contador.textContent = desde || hasta ? `${filtrados.length} de ${todos.length} registrados (filtrado)` : `${todos.length} registrados`;
  }

  renderRows(todos);
  container.querySelector('#mov-desde')?.addEventListener('change', aplicarFiltro);
  container.querySelector('#mov-hasta')?.addEventListener('change', aplicarFiltro);
  container.querySelector('#mov-limpiar')?.addEventListener('click', () => {
    (container.querySelector('#mov-desde') as HTMLInputElement).value = '';
    (container.querySelector('#mov-hasta') as HTMLInputElement).value = '';
    aplicarFiltro();
  });

  container.querySelector('#btn-new-mov')?.addEventListener('click', () => openMovimientoModal(db, onChanged));

  container.querySelector('#btn-export-mov')?.addEventListener('click', () => {
    downloadCsv(
      'movimientos',
      ['ID Mov', 'Fecha', 'Material', 'Tipo', 'Cant. Paquetes', 'Uds/Paq', 'Total Unidades', 'Origen', 'Destino', 'Cliente', 'Responsable', 'Notas', 'Núm. Serie'],
      filtrados.map((m) => [m.idMov, new Date(m.fecha).toLocaleString('es-MX'), m.materialNombre, m.tipo, m.cantPaquetes, m.unidadesPaq, m.totalUnidades, m.origen, m.destino, m.cliente, m.responsable, m.notas, m.numSeries])
    );
  });
}

function openMovimientoModal(db: Database, onChanged: () => void) {
  const materialOptions = db.materiales
    .filter((m) => m.activo !== false)
    .map((m) => `<option value="${m.id}" data-tipo="${m.tipoPaquete}" data-uds="${m.unidadesPaq}">${esc(m.nombre)}</option>`)
    .join('');
  const almacenOptions = db.almacenes.filter((a) => a.activo !== false).map((a) => `<option value="${esc(a.nombre)}">${esc(a.nombre)}</option>`).join('');

  const body = `
    <div class="fg"><label class="fl">Material <span>*</span></label>
      <select class="fc" id="mv-mat">${materialOptions}</select>
    </div>
    <div class="frow">
      <div class="fg"><label class="fl">Tipo de movimiento <span>*</span></label>
        <select class="fc" id="mv-tipo">${TIPOS_MOV.map((t) => `<option value="${t}">${t}</option>`).join('')}</select>
      </div>
      <div class="fg"><label class="fl">Fecha</label><input type="datetime-local" class="fc" id="mv-fecha" value="${new Date().toISOString().slice(0, 16)}"/></div>
    </div>
    <div class="frow">
      <div class="fg"><label class="fl">Cantidad de paquetes</label><input type="number" class="fc" id="mv-cant" value="1" min="1"/></div>
      <div class="fg"><label class="fl">Unidades por paquete</label><input type="number" class="fc" id="mv-uds" value="1" min="1"/></div>
    </div>
    <div class="frow">
      <div class="fg"><label class="fl">Almacén origen</label><select class="fc" id="mv-origen"><option value="">— Ninguno —</option>${almacenOptions}</select></div>
      <div class="fg"><label class="fl">Almacén destino</label><select class="fc" id="mv-destino"><option value="">— Ninguno —</option>${almacenOptions}</select></div>
    </div>
    <div class="fg"><label class="fl">Cliente (si es Salida/Préstamo)</label><input class="fc" id="mv-cliente"/></div>
    <div class="fg"><label class="fl">Responsable</label><input class="fc" id="mv-resp"/></div>
    <div class="fg"><label class="fl">Notas</label><textarea class="fc" id="mv-notas" rows="2"></textarea></div>`;

  const footer = `<button class="btn btn-ghost" data-close-modal>Cancelar</button><button class="btn btn-primary" id="mv-save">Guardar movimiento</button>`;
  const modal = openModal('Registrar movimiento', body, footer);

  const matSelect = modal.querySelector('#mv-mat') as HTMLSelectElement;
  const tipoPaqSyncedFromMat = () => {
    const opt = matSelect.selectedOptions[0];
    if (!opt) return;
    (document.getElementById('mv-uds') as HTMLInputElement).value = opt.dataset.uds || '1';
  };
  matSelect.addEventListener('change', tipoPaqSyncedFromMat);
  tipoPaqSyncedFromMat();

  modal.querySelector('#mv-save')?.addEventListener('click', async () => {
    const opt = matSelect.selectedOptions[0];
    if (!opt) {
      toast('Selecciona un material', 'e');
      return;
    }
    showLoader('Guardando en GitHub…');
    try {
      let idMovCreado = '';
      await store.mutate((current) => {
        const { db: next, idMov } = agregarMovimiento(current, {
          materialId: opt.value,
          materialNombre: opt.textContent || '',
          tipo: (document.getElementById('mv-tipo') as HTMLSelectElement).value as TipoMovimiento,
          fecha: new Date((document.getElementById('mv-fecha') as HTMLInputElement).value).toISOString(),
          tipoPaquete: (opt.dataset.tipo || 'Pieza Única') as TipoPaquete,
          cantPaquetes: Number((document.getElementById('mv-cant') as HTMLInputElement).value) || 1,
          unidadesPaq: Number((document.getElementById('mv-uds') as HTMLInputElement).value) || 1,
          origen: (document.getElementById('mv-origen') as HTMLSelectElement).value,
          destino: (document.getElementById('mv-destino') as HTMLSelectElement).value,
          cliente: (document.getElementById('mv-cliente') as HTMLInputElement).value,
          estado: 'Disponible',
          responsable: (document.getElementById('mv-resp') as HTMLInputElement).value,
          notas: (document.getElementById('mv-notas') as HTMLTextAreaElement).value,
          fechaRegreso: '',
          numSeries: '',
        });
        idMovCreado = idMov;
        return next;
      }, `Movimiento ${(document.getElementById('mv-tipo') as HTMLSelectElement).value}: ${opt.textContent}`);
      toast(`Movimiento ${idMovCreado} guardado ✓`, 's');
      closeModal();
      onChanged();
    } catch (e) {
      toast('Error: ' + (e as Error).message, 'e');
    } finally {
      hideLoader();
    }
  });
}
