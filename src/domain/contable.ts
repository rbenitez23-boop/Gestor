import type { Database } from '../types';
import { sha256 } from '../services/crypto';

export interface RemisionCosteada {
  folio: string;
  cliente: string;
  evento: string;
  fechaSalida: string;
  cerrada: boolean;
  numItems: number;
  costoConsumibles: number;
  costoDepreciables: number;
  costoTotal: number;
}

export interface ReporteContable {
  remisiones: RemisionCosteada[];
  totales: { consumibles: number; depreciables: number; total: number };
}

/** Puerto de getRemisionesContables(): desglosa el costo real de cada remisión — para eso están capturados costoUnidad/costoUso en el catálogo. */
export function calcularReporteContable(db: Database): ReporteContable {
  let totalConsumibles = 0;
  let totalDepreciables = 0;

  const remisiones: RemisionCosteada[] = db.remisiones.map((r) => {
    let costoConsumibles = 0;
    let costoDepreciables = 0;
    r.items.forEach((it) => {
      const costo = it.costoTotalItem || 0;
      if (it.clasificacion === 'Depreciable') costoDepreciables += costo;
      else costoConsumibles += costo;
    });
    totalConsumibles += costoConsumibles;
    totalDepreciables += costoDepreciables;
    return {
      folio: r.folio,
      cliente: r.cliente,
      evento: r.evento,
      fechaSalida: r.fechaSalida,
      cerrada: r.cerrada,
      numItems: r.items.length,
      costoConsumibles: Math.round(costoConsumibles * 100) / 100,
      costoDepreciables: Math.round(costoDepreciables * 100) / 100,
      costoTotal: Math.round((costoConsumibles + costoDepreciables) * 100) / 100,
    };
  });

  return {
    remisiones: remisiones.reverse(),
    totales: {
      consumibles: Math.round(totalConsumibles * 100) / 100,
      depreciables: Math.round(totalDepreciables * 100) / 100,
      total: Math.round((totalConsumibles + totalDepreciables) * 100) / 100,
    },
  };
}

export async function verificarPin(db: Database, pin: string): Promise<boolean> {
  return (await sha256(pin)) === db.contablePinHash;
}

export async function cambiarPin(db: Database, pinActual: string, pinNuevo: string): Promise<Database> {
  if (!(await verificarPin(db, pinActual))) throw new Error('El PIN actual no es correcto');
  if (!pinNuevo || pinNuevo.length < 4) throw new Error('El nuevo PIN debe tener al menos 4 caracteres');
  return { ...db, contablePinHash: await sha256(pinNuevo) };
}
