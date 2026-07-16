import type { Database } from '../../types';
import { calcularListaCompras } from '../../domain/compras';
import { esc, downloadCsv } from '../helpers';

const BADGE: Record<string, string> = {
  urgente: '<span class="semaforo sem-urgente">🔴 Urgente</span>',
  alta: '<span class="semaforo sem-alta">🟠 Alta</span>',
  media: '<span class="semaforo sem-media">🟡 Media</span>',
};

export function renderCompras(container: HTMLElement, db: Database) {
  const lista = calcularListaCompras(db);

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
      <div><h1 style="font-size:22px;font-weight:800">Lista de Compras</h1><p style="color:var(--gris-med);font-size:13px">Materiales por debajo de su stock mínimo, agotados, o comprometidos en remisiones activas</p></div>
      <button class="btn btn-ghost" id="btn-export-compras">⬇️ Descargar Excel</button>
    </div>
    <div class="card" style="padding:12px 16px;margin-bottom:14px;font-size:12px;color:var(--gris-med)">
      <span class="semaforo sem-urgente" style="margin-right:8px">🔴 Urgente</span>Stock = 0
      <span class="semaforo sem-alta" style="margin:0 8px">🟠 Alta</span>Disponible &lt; mínimo
      <span class="semaforo sem-media" style="margin:0 8px">🟡 Media</span>Disponible &lt; máximo
    </div>
    <div class="card"><div class="tbl-wrap"><table>
      <thead><tr><th>#</th><th>Material</th><th>Rack/Zona</th><th>Disponible</th><th>Mín</th><th>Máx</th><th>Demanda activa</th><th>A comprar</th><th>Prioridad</th></tr></thead>
      <tbody>${
        lista.length
          ? lista
              .map(
                (m, i) => `<tr>
              <td>${i + 1}</td>
              <td style="font-weight:700">${esc(m.nombre)}</td>
              <td>${esc(m.rack || '—')}${m.zona ? ' · ' + esc(m.zona) : ''}</td>
              <td style="font-weight:700;color:${m.stockDisponible <= 0 ? 'var(--rojo)' : 'inherit'}">${m.stockDisponible}</td>
              <td>${m.stockMin ?? (m.sugeridoMin !== null ? `<span style="color:var(--gris-med)">(sug: ${m.sugeridoMin})</span>` : '—')}</td>
              <td>${m.stockMax ?? (m.sugeridoMax !== null ? `<span style="color:var(--gris-med)">(sug: ${m.sugeridoMax})</span>` : '—')}</td>
              <td>${m.demandaActiva || 0}</td>
              <td style="font-weight:700;color:var(--rojo)">${m.cantidadComprar || '—'}</td>
              <td>${BADGE[m.prioridad] || ''}</td>
            </tr>`
              )
              .join('')
          : '<tr><td colspan="9" class="empty-state">✅ Todo el stock está en niveles adecuados</td></tr>'
      }</tbody>
    </table></div></div>`;

  container.querySelector('#btn-export-compras')?.addEventListener('click', () => {
    downloadCsv(
      'lista-de-compras',
      ['Material', 'Rack', 'Zona', 'Disponible', 'Stock Mín', 'Stock Máx', 'Demanda Activa', 'A Comprar', 'Prioridad'],
      lista.map((m) => [m.nombre, m.rack, m.zona, m.stockDisponible, m.stockMin ?? '', m.stockMax ?? '', m.demandaActiva, m.cantidadComprar, m.prioridad])
    );
  });
}
