/**
 * stock.ts — Cálculo de existencias.
 *
 * Puerto 1:1 de la lógica original en Code.gs (calcularStockPorAlmacen,
 * calcularStockTodosLosMateriales, calcularROP, calcularStockMinMaxSugerido,
 * calcularPrioridad). Es lógica de negocio pura (sin I/O), así que se
 * puede probar con Vitest sin necesitar Google ni GitHub — ver
 * tests/domain/stock.test.ts.
 *
 * NO se cambió ninguna regla de negocio respecto al original: mismos
 * tipos de movimiento, mismo tratamiento de "fuera" vs "fuera de
 * servicio", mismo cálculo de ROP y de sugerencias de stock mínimo/máximo.
 */

import type { Material, Movimiento, StockInfo } from '../types';

const FACTOR_STOCK_MAX = 2;
const MESES_HISTORIAL = 6;
const DIAS_POR_MES = 30;

export function stockVacio(): StockInfo {
  return { porAlmacen: {}, fueraServicio: {}, totalFisico: 0, totalFueraServ: 0, totalDisponible: 0, fuera: 0, clientes: {} };
}

/** Calcula el stock de UN material a partir de sus movimientos. */
export function calcularStockPorAlmacen(materialId: string, movimientos: Movimiento[]): StockInfo {
  const almacenes: Record<string, number> = {};
  const fueraServicio: Record<string, number> = {};
  let fuera = 0;
  const clientes: Record<string, number> = {};

  movimientos
    .filter((m) => m.materialId === materialId)
    .forEach((m) => {
      const cant = Number(m.totalUnidades) || 0;
      const origen = m.origen || '';
      const dest = m.destino || '';
      const cliente = m.cliente || '';
      const regreso = m.regreso;

      switch (m.tipo) {
        case 'Alta de Producto':
        case 'Entrada':
          if (dest) almacenes[dest] = (almacenes[dest] || 0) + cant;
          break;
        case 'Salida':
        case 'Préstamo':
          if (origen) almacenes[origen] = (almacenes[origen] || 0) - cant;
          if (!regreso) {
            fuera += cant;
            if (cliente) clientes[cliente] = (clientes[cliente] || 0) + cant;
          }
          break;
        case 'Regreso':
          if (dest) almacenes[dest] = (almacenes[dest] || 0) + cant;
          fuera = Math.max(0, fuera - cant);
          if (cliente && clientes[cliente]) clientes[cliente] = Math.max(0, clientes[cliente] - cant);
          break;
        case 'Traspaso':
          if (origen) almacenes[origen] = (almacenes[origen] || 0) - cant;
          if (dest) almacenes[dest] = (almacenes[dest] || 0) + cant;
          break;
        case 'Baja de Producto':
          if (origen) almacenes[origen] = (almacenes[origen] || 0) - cant;
          break;
        case 'Fuera de Servicio':
        case 'En Reparación':
          if (origen) fueraServicio[origen] = (fueraServicio[origen] || 0) + cant;
          break;
      }
    });

  delete almacenes[''];
  delete fueraServicio[''];

  const totalFisico = Object.values(almacenes).reduce((s, v) => s + Math.max(0, v), 0);
  const totalFueraServ = Object.values(fueraServicio).reduce((s, v) => s + v, 0);
  const totalDisponible = Math.max(0, totalFisico - totalFueraServ);

  return { porAlmacen: almacenes, fueraServicio, totalFisico, totalFueraServ, totalDisponible, fuera, clientes };
}

/** Igual que calcularStockPorAlmacen pero para TODOS los materiales en una sola pasada — O(N) en vez de O(N×M). */
export function calcularStockTodosLosMateriales(movimientos: Movimiento[]): Record<string, StockInfo> {
  const mapa: Record<string, { almacenes: Record<string, number>; fueraServicio: Record<string, number>; fuera: number; clientes: Record<string, number> }> = {};
  const getEntry = (id: string) => {
    if (!mapa[id]) mapa[id] = { almacenes: {}, fueraServicio: {}, fuera: 0, clientes: {} };
    return mapa[id];
  };

  movimientos.forEach((m) => {
    if (!m.materialId) return;
    const e = getEntry(m.materialId);
    const cant = Number(m.totalUnidades) || 0;
    const origen = m.origen || '';
    const dest = m.destino || '';
    const cliente = m.cliente || '';
    const regreso = m.regreso;

    switch (m.tipo) {
      case 'Alta de Producto':
      case 'Entrada':
        if (dest) e.almacenes[dest] = (e.almacenes[dest] || 0) + cant;
        break;
      case 'Salida':
      case 'Préstamo':
        if (origen) e.almacenes[origen] = (e.almacenes[origen] || 0) - cant;
        if (!regreso) {
          e.fuera += cant;
          if (cliente) e.clientes[cliente] = (e.clientes[cliente] || 0) + cant;
        }
        break;
      case 'Regreso':
        if (dest) e.almacenes[dest] = (e.almacenes[dest] || 0) + cant;
        e.fuera = Math.max(0, e.fuera - cant);
        if (cliente && e.clientes[cliente]) e.clientes[cliente] = Math.max(0, e.clientes[cliente] - cant);
        break;
      case 'Traspaso':
        if (origen) e.almacenes[origen] = (e.almacenes[origen] || 0) - cant;
        if (dest) e.almacenes[dest] = (e.almacenes[dest] || 0) + cant;
        break;
      case 'Baja de Producto':
        if (origen) e.almacenes[origen] = (e.almacenes[origen] || 0) - cant;
        break;
      case 'Fuera de Servicio':
      case 'En Reparación':
        if (origen) e.fueraServicio[origen] = (e.fueraServicio[origen] || 0) + cant;
        break;
    }
  });

  const resultado: Record<string, StockInfo> = {};
  Object.keys(mapa).forEach((id) => {
    const e = mapa[id];
    if (!e) return;
    delete e.almacenes[''];
    delete e.fueraServicio[''];
    const totalFisico = Object.values(e.almacenes).reduce((s, v) => s + Math.max(0, v), 0);
    const totalFueraServ = Object.values(e.fueraServicio).reduce((s, v) => s + v, 0);
    resultado[id] = {
      porAlmacen: e.almacenes,
      fueraServicio: e.fueraServicio,
      totalFisico,
      totalFueraServ,
      totalDisponible: Math.max(0, totalFisico - totalFueraServ),
      fuera: e.fuera,
      clientes: e.clientes,
    };
  });
  return resultado;
}

export function tdeADias(valor: number | null, unidad: string): number | null {
  if (!valor) return null;
  const u = (unidad || '').toLowerCase();
  if (u.startsWith('sem')) return valor * 7;
  if (u.startsWith('mes')) return valor * DIAS_POR_MES;
  return valor;
}

export interface RopResult {
  rop: number | null;
  calculado: boolean;
  demandaDiaria: number | null;
  leadDias: number | null;
}

/** Punto de Reorden — igual fórmula que el original: demanda diaria histórica × lead time + colchón mínimo. */
export function calcularROP(material: Material, movimientosDelMaterial: Movimiento[]): RopResult {
  const { stockMin, stockMax } = material;
  const leadDias = tdeADias(material.tdeValor, material.tdeUnidad);

  if (leadDias && stockMin !== null) {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - MESES_HISTORIAL);
    const salidas = movimientosDelMaterial.filter(
      (m) => m.tipo === 'Salida' && m.fecha && new Date(m.fecha) >= cutoff
    );
    const totalSalido = salidas.reduce((s, m) => s + (Number(m.totalUnidades) || 0), 0);
    const diasPeriodo = MESES_HISTORIAL * DIAS_POR_MES;
    const demandaDiaria = totalSalido / diasPeriodo;
    const rop = Math.ceil(demandaDiaria * leadDias + stockMin);
    return { rop, calculado: true, demandaDiaria: Math.round(demandaDiaria * 100) / 100, leadDias };
  }

  if (stockMin !== null && stockMax !== null) {
    return { rop: Math.ceil(stockMin + (stockMax - stockMin) / 2), calculado: false, demandaDiaria: null, leadDias: null };
  }
  return { rop: null, calculado: false, demandaDiaria: null, leadDias: null };
}

export interface SugeridoStock {
  sugeridoMin: number | null;
  sugeridoMax: number | null;
}

export function calcularStockMinMaxSugerido(materialId: string, movimientos: Movimiento[]): SugeridoStock {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - MESES_HISTORIAL);

  const salidas = movimientos.filter(
    (m) => m.materialId === materialId && (m.tipo === 'Salida' || m.tipo === 'Préstamo') && m.fecha && new Date(m.fecha) >= cutoff
  );
  if (salidas.length === 0) return { sugeridoMin: null, sugeridoMax: null };

  const totalSalido = salidas.reduce((s, m) => s + (Number(m.totalUnidades) || 0), 0);
  const promedioEvento = Math.ceil(totalSalido / salidas.length);
  return { sugeridoMin: promedioEvento, sugeridoMax: promedioEvento * FACTOR_STOCK_MAX };
}

export function calcularPrioridad(disponible: number, stockMin: number | null, stockMax: number | null) {
  if (disponible <= 0) return 'urgente' as const;
  if (stockMin !== null && disponible < stockMin) return 'alta' as const;
  if (stockMax !== null && disponible < stockMax) return 'media' as const;
  return 'ok' as const;
}
