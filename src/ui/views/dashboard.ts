import type { Database } from '../../types';
import { listarMaterialesConStock } from '../../domain/materiales';
import { calcularStockTodosLosMateriales, stockVacio } from '../../domain/stock';
import { fmtMoney, esc } from '../helpers';

export function renderDashboard(container: HTMLElement, db: Database) {
  const materiales = listarMaterialesConStock(db);
  const stockMap = calcularStockTodosLosMateriales(db.movimientos);

  const fueraCount = db.movimientos
    .filter((m) => (m.tipo === 'Préstamo' || m.tipo === 'Salida') && !m.regreso)
    .reduce((s, m) => s + (Number(m.totalUnidades) || 0), 0);

  const fueraServTotal = db.movimientos
    .filter((m) => m.tipo === 'Fuera de Servicio' || m.tipo === 'En Reparación')
    .reduce((s, m) => s + (Number(m.totalUnidades) || 0), 0);

  let valorConsumibles = 0;
  let valorDepreciables = 0;
  let sinCosto = 0;
  db.materiales
    .filter((m) => m.activo !== false)
    .forEach((m) => {
      if (m.costoUnidad === null || m.costoUnidad === undefined) {
        sinCosto++;
        return;
      }
      const si = stockMap[m.id] || stockVacio();
      const costoPorPieza = m.costoUnidad / (m.unidadesPaq || 1);
      const valor = si.totalDisponible * costoPorPieza;
      if (m.clasificacion === 'Depreciable') valorDepreciables += valor;
      else valorConsumibles += valor;
    });

  const ultimos = [...db.movimientos].slice(-5).reverse();

  container.innerHTML = `
    <div style="margin-bottom:20px"><h1 style="font-size:22px;font-weight:800">Dashboard</h1><p style="color:var(--gris-med);font-size:13px">Resumen en tiempo real</p></div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Materiales</div><div class="stat-value">${materiales.length}</div></div>
      <div class="stat-card"><div class="stat-label">Movimientos</div><div class="stat-value">${db.movimientos.length}</div></div>
      <div class="stat-card"><div class="stat-label">Fuera de Bodega</div><div class="stat-value">${fueraCount}</div></div>
      <div class="stat-card"><div class="stat-label">Fuera de Servicio</div><div class="stat-value">${fueraServTotal}</div></div>
    </div>
    <div class="card" style="padding:18px 20px;margin-bottom:20px">
      <div class="card-title" style="margin-bottom:14px">💰 Valor de Almacén</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px">
        <div><div class="stat-label">Consumibles</div><div class="stat-value" style="font-size:20px">${fmtMoney(Math.round(valorConsumibles * 100) / 100)}</div></div>
        <div><div class="stat-label">Depreciables</div><div class="stat-value" style="font-size:20px;color:#6c47ff">${fmtMoney(Math.round(valorDepreciables * 100) / 100)}</div></div>
        <div><div class="stat-label">Total</div><div class="stat-value" style="font-size:20px;color:var(--azul)">${fmtMoney(Math.round((valorConsumibles + valorDepreciables) * 100) / 100)}</div></div>
      </div>
      ${sinCosto ? `<div style="margin-top:10px;font-size:12px;color:var(--gris-med)">ℹ️ ${sinCosto} material(es) sin costo capturado, no incluidos en este total.</div>` : ''}
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Últimos movimientos</span></div>
      <div class="tbl-wrap"><table><thead><tr><th>Fecha</th><th>Material</th><th>Tipo</th><th>Cant.</th><th>Destino/Cliente</th></tr></thead>
      <tbody>${
        ultimos.length
          ? ultimos
              .map(
                (m) =>
                  `<tr><td>${new Date(m.fecha).toLocaleDateString('es-MX')}</td><td>${esc(m.materialNombre)}</td><td>${esc(m.tipo)}</td><td>${m.totalUnidades}</td><td>${esc(m.destino || m.cliente || '—')}</td></tr>`
              )
              .join('')
          : '<tr><td colspan="5" class="empty-state">Sin movimientos aún</td></tr>'
      }</tbody></table></div>
    </div>`;
}
