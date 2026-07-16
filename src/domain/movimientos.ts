import type { Database, Movimiento } from '../types';
import { generarIdSecuencial } from './materiales';

export interface NuevoMovimientoInput {
  materialId: string;
  materialNombre: string;
  tipo: Movimiento['tipo'];
  fecha: string;
  tipoPaquete: Movimiento['tipoPaquete'];
  cantPaquetes: number;
  unidadesPaq: number;
  origen: string;
  destino: string;
  cliente: string;
  estado: Movimiento['estado'];
  responsable: string;
  notas: string;
  fechaRegreso: string;
  numSeries: string;
}

/** Puerto de saveMovimiento(): agrega un movimiento nuevo, calculando total de unidades. */
export function agregarMovimiento(db: Database, input: NuevoMovimientoInput): { db: Database; idMov: string } {
  const idMov = generarIdSecuencial(db.movimientos.map((m) => m.idMov), 'MOV-', 6);
  const totalUnidades = (Number(input.cantPaquetes) || 0) * (Number(input.unidadesPaq) || 0);
  const nuevo: Movimiento = {
    idMov,
    fecha: input.fecha || new Date().toISOString(),
    materialId: input.materialId,
    materialNombre: input.materialNombre,
    tipo: input.tipo,
    tipoPaquete: input.tipoPaquete,
    cantPaquetes: Number(input.cantPaquetes) || 0,
    unidadesPaq: Number(input.unidadesPaq) || 0,
    totalUnidades,
    origen: input.origen || '',
    destino: input.destino || '',
    cliente: input.cliente || '',
    estado: input.estado || 'Disponible',
    responsable: input.responsable || '',
    notas: input.notas || '',
    fechaRegreso: input.fechaRegreso || '',
    regreso: false,
    numSeries: input.numSeries || '',
  };
  return { db: { ...db, movimientos: [...db.movimientos, nuevo] }, idMov };
}

/** Puerto de deleteMovimiento(): quita un movimiento por su ID. */
export function eliminarMovimiento(db: Database, idMov: string): Database {
  return { ...db, movimientos: db.movimientos.filter((m) => m.idMov !== idMov) };
}
