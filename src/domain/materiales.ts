import type { Database, Material, Movimiento } from '../types';
import { calcularStockTodosLosMateriales, calcularPrioridad, stockVacio } from './stock';

/** Igual regla que generarIdSecuencial() del original: nunca reutiliza un ID aunque se hayan borrado filas. */
export function generarIdSecuencial(existentes: string[], prefijo: string, padLength: number): string {
  const re = new RegExp('^' + prefijo + '(\\d+)$');
  let maxNum = 0;
  existentes.forEach((id) => {
    const m = String(id || '').match(re);
    if (m && m[1]) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  });
  return prefijo + String(maxNum + 1).padStart(padLength, '0');
}

export interface MaterialConStock extends Material {
  stockTotal: number;
  stockDisponible: number;
  prioridad: ReturnType<typeof calcularPrioridad>;
}

/** Equivalente a getAllMateriales(): catálogo activo + stock calculado + prioridad de compra. */
export function listarMaterialesConStock(db: Database): MaterialConStock[] {
  const stockMap = calcularStockTodosLosMateriales(db.movimientos);
  return db.materiales
    .filter((m) => m.id && m.nombre && m.activo !== false)
    .map((m) => {
      const si = stockMap[m.id] || stockVacio();
      const disponible = si.totalDisponible;
      return {
        ...m,
        stockTotal: si.totalDisponible + si.fuera + si.totalFueraServ,
        stockDisponible: disponible,
        prioridad: calcularPrioridad(disponible, m.stockMin, m.stockMax),
      };
    });
}

function normalizeText(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function buscarMateriales(db: Database, query: string, limit = 10): MaterialConStock[] {
  const q = normalizeText(query);
  const all = listarMaterialesConStock(db);
  const filtered = all.filter((m) => q === '' || normalizeText(m.nombre).includes(q));
  return q === '' ? filtered : filtered.slice(0, limit);
}

export function movimientosDeMaterial(db: Database, materialId: string): Movimiento[] {
  return db.movimientos.filter((m) => m.materialId === materialId);
}
