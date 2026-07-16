import type { Database, Prioridad } from '../types';
import { calcularStockTodosLosMateriales, calcularStockMinMaxSugerido, calcularPrioridad, stockVacio } from './stock';

export interface ItemCompra {
  id: string;
  nombre: string;
  tipoPaquete: string;
  rack: string;
  zona: string;
  stockDisponible: number;
  stockMin: number | null;
  stockMax: number | null;
  sugeridoMin: number | null;
  sugeridoMax: number | null;
  demandaActiva: number;
  cantidadComprar: number;
  prioridad: Prioridad;
}

const ORDEN_PRIORIDAD: Record<Prioridad, number> = { urgente: 0, alta: 1, media: 2, ok: 3 };

/**
 * Puerto fiel de getMaterialesCompras(): cruza stock disponible contra
 * stock mínimo/máximo Y contra la demanda de remisiones activas (no
 * cerradas) que aún no se han enviado — para que la lista de compras
 * anticipe lo que ya está comprometido, no solo lo que falta hoy.
 */
export function calcularListaCompras(db: Database): ItemCompra[] {
  const stockMap = calcularStockTodosLosMateriales(db.movimientos);

  const demanda: Record<string, number> = {};
  db.remisiones
    .filter((r) => r.cerrada !== true)
    .forEach((r) => {
      r.items.forEach((it) => {
        if (!it.materialId) return;
        const cant = it.cantidadEnviar !== undefined && it.cantidadEnviar !== null ? it.cantidadEnviar : it.totalUnidades || 0;
        demanda[it.materialId] = (demanda[it.materialId] || 0) + cant;
      });
    });

  const resultado: ItemCompra[] = [];

  db.materiales
    .filter((m) => m.activo !== false)
    .forEach((m) => {
      const si = stockMap[m.id] || stockVacio();
      const disponible = si.totalDisponible;
      const dem = demanda[m.id] || 0;
      const prioridad = calcularPrioridad(disponible, m.stockMin, m.stockMax);

      const necesitaPorDemanda = Math.max(0, dem - disponible);
      const necesitaPorMin = m.stockMin !== null && disponible < m.stockMin ? m.stockMin - disponible : 0;
      const cantidadComprar = Math.max(necesitaPorDemanda, necesitaPorMin, disponible <= 0 ? 1 : 0);

      if (prioridad === 'ok' && cantidadComprar === 0) return;

      const sug = calcularStockMinMaxSugerido(m.id, db.movimientos);

      resultado.push({
        id: m.id,
        nombre: m.nombre,
        tipoPaquete: m.tipoPaquete,
        rack: m.rack || '',
        zona: m.zona || '',
        stockDisponible: disponible,
        stockMin: m.stockMin,
        stockMax: m.stockMax,
        sugeridoMin: sug.sugeridoMin,
        sugeridoMax: sug.sugeridoMax,
        demandaActiva: dem,
        cantidadComprar,
        prioridad,
      });
    });

  return resultado.sort((a, b) => (ORDEN_PRIORIDAD[a.prioridad] ?? 9) - (ORDEN_PRIORIDAD[b.prioridad] ?? 9) || b.cantidadComprar - a.cantidadComprar);
}
