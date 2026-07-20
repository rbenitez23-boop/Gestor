import type { Database, TipoMovimiento } from '../../types';
import { calcularListaCompras } from '../../domain/compras';
import { agregarMovimiento } from '../../domain/movimientos';
import { store } from '../../services/store';
import { esc, downloadCsv, openModal, closeModal, toast, showLoader, hideLoader } from '../helpers';

const BADGE: Record<string, string> = {
  urgente: '<span class="semaforo sem-urgente">🔴 Urgente</span>',
  alta: '<span class="semaforo sem-alta">🟠 Alta</span>',
  media: '<span class="semaforo sem-media">🟡 Media</span>',
};

export function renderCompras(container: HTMLElement, db: Database, onChanged: () => void) {
  const lista = calcularListaCompras(db);

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px">
      <div><h1 style="font-size:22px;font-weight:800">Lista de Compras</h1><p style="color:var(--gris-med);font-size:13px">Materiales por debajo de su stock mínimo, agotados, o comprometidos en remisiones activas · ${new Date().toLocaleDateString('es-MX')}</p></div>
      <div class="no-print" style="display:flex;gap:8px">
        <button class="btn btn-orange" id="btn-print-compras">🖨️ Imprimir</button>
        <button class="btn btn-ghost" id="btn-export-compras">⬇️ Descargar Excel</button>
      </div>
    </div>
    <div class="no-print card" style="padding:12px 16px;margin-bottom:14px;font-size:12px;color:var(--gris-med)">
      <span class="semaforo sem-urgente" style="margin-right:8px">🔴 Urgente</span>Stock = 0
      <span class="semaforo sem-alta" style="margin:0 8px">🟠 Alta</span>Disponible &lt; mínimo
      <span class="semaforo sem-media" style="margin:0 8px">🟡 Media</span>Disponible &lt; máximo
    </div>
    <div class="card"><div class="tbl-wrap"><table>
      <thead><tr><th class="no-print">#</th><th>Material</th><th>Rack/Zona</th><th>Disponible</th><th class="no-print">Mín</th><th class="no-print">Máx</th><th class="no-print">Demanda activa</th><th>A comprar</th><th class="no-print">Prioridad</th><th class="no-print"></th></tr></thead>
      <tbody>${
        lista.length
          ? lista
              .map(
                (m, i) => `<tr>
              <td class="no-print">${i + 1}</td>
              <td style="font-weight:700">${esc(m.nombre)}</td>
              <td>${esc(m.rack || '—')}${m.zona ? ' · ' + esc(m.zona) : ''}</td>
              <td style="font-weight:700;color:${m.stockDisponible <= 0 ? 'var(--rojo)' : 'inherit'}">${m.stockDisponible}</td>
              <td class="no-print">${m.stockMin ?? (m.sugeridoMin !== null ? `<span style="color:var(--gris-med)">(sug: ${m.sugeridoMin})</span>` : '—')}</td>
              <td class="no-print">${m.stockMax ?? (m.sugeridoMax !== null ? `<span style="color:var(--gris-med)">(sug: ${m.sugeridoMax})</span>` : '—')}</td>
              <td class="no-print">${m.demandaActiva || 0}</td>
              <td style="font-weight:700;color:var(--rojo)">${m.cantidadComprar || '—'}</td>
              <td class="no-print">${BADGE[m.prioridad] || ''}</td>
              <td class="no-print"><button class="btn btn-success btn-sm" data-surtir="${m.id}" data-nombre="${esc(m.nombre)}" data-cant="${m.cantidadComprar || 1}">✅ Surtido</button></td>
            </tr>`
              )
              .join('')
          : '<tr><td colspan="10" class="empty-state">✅ Todo el stock está en niveles adecuados</td></tr>'
      }</tbody>
    </table></div></div>`;

  container.querySelector('#btn-print-compras')?.addEventListener('click', () => window.print());

  container.querySelector('#btn-export-compras')?.addEventListener('click', () => {
    downloadCsv(
      'lista-de-compras',
      ['Material', 'Rack', 'Zona', 'Disponible', 'Stock Mín', 'Stock Máx', 'Demanda Activa', 'A Comprar', 'Prioridad'],
      lista.map((m) => [m.nombre, m.rack, m.zona, m.stockDisponible, m.stockMin ?? '', m.stockMax ?? '', m.demandaActiva, m.cantidadComprar, m.prioridad])
    );
  });

  container.querySelectorAll<HTMLElement>('[data-surtir]').forEach((btn) => {
    btn.addEventListener('click', () => openSurtidoModal(btn.dataset.surtir!, btn.dataset.nombre || '', Number(btn.dataset.cant) || 1, db, onChanged));
  });
}

// ── Registrar la entrada de una compra directo desde la lista ─────────
function openSurtidoModal(materialId: string, nombre: string, cantidadSugerida: number, db: Database, onChanged: () => void) {
  const material = db.materiales.find((m) => m.id === materialId);
  const almacenOptions = db.almacenes.filter((a) => a.activo !== false).map((a) => `<option value="${esc(a.nombre)}">${esc(a.nombre)}</option>`).join('');

  const body = `
    <div class="fg"><label class="fl">Cantidad que llegó</label><input type="number" class="fc" id="su-cant" value="${cantidadSugerida}" min="1"/></div>
    <div class="fg"><label class="fl">Almacén destino</label><select class="fc" id="su-almacen">${almacenOptions}</select></div>
    <div class="fg"><label class="fl">Responsable</label><input class="fc" id="su-resp"/></div>
    <div class="fg"><label class="fl">Notas</label><input class="fc" id="su-notas" placeholder="Ej. proveedor, folio de factura…"/></div>`;
  const footer = `<button class="btn btn-ghost" data-close-modal>Cancelar</button><button class="btn btn-success" id="su-guardar">✅ Registrar entrada</button>`;
  const modal = openModal(`Surtido — ${nombre}`, body, footer);

  modal.querySelector('#su-guardar')?.addEventListener('click', async () => {
    const cant = Number((modal.querySelector('#su-cant') as HTMLInputElement).value) || 0;
    if (cant <= 0) {
      toast('La cantidad debe ser mayor a 0', 'e');
      return;
    }
    const almacen = (modal.querySelector('#su-almacen') as HTMLSelectElement).value;
    const responsable = (modal.querySelector('#su-resp') as HTMLInputElement).value;
    const notas = (modal.querySelector('#su-notas') as HTMLInputElement).value;

    showLoader('Guardando en GitHub…');
    try {
      await store.mutate((current) => {
        const m = current.materiales.find((x) => x.id === materialId) || material;
        const { db: next } = agregarMovimiento(current, {
          materialId,
          materialNombre: nombre,
          tipo: 'Entrada' as TipoMovimiento,
          fecha: new Date().toISOString(),
          tipoPaquete: m?.tipoPaquete || 'Pieza Única',
          cantPaquetes: cant,
          unidadesPaq: m?.unidadesPaq || 1,
          origen: '',
          destino: almacen,
          cliente: '',
          estado: 'Disponible',
          responsable,
          notas: notas || 'Surtido registrado desde Lista de Compras',
          fechaRegreso: '',
          numSeries: '',
        });
        return next;
      }, `Surtido: ${nombre} (+${cant})`);
      toast(`✓ ${nombre} surtido — se agregaron ${cant} al stock`, 's');
      closeModal();
      onChanged();
    } catch (e) {
      toast('Error: ' + (e as Error).message, 'e');
    } finally {
      hideLoader();
    }
  });
}
