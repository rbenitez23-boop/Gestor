import type { Database, Remision, RemisionItem, Movimiento, TipoPaquete } from '../types';
import { generarIdSecuencial } from './materiales';
import { calcularStockPorAlmacen } from './stock';

export interface NuevaRemisionInput {
  cliente: string;
  evento: string;
  fechaSalida: string;
  fechaRegreso: string;
  almacen: string;
  almacenSede: string;
  responsable: string;
  notas: string;
  tipoEvento: string;
  numEquipos: number | '';
  numCampistas: number | '';
  numStaff: number | '';
  numMaestros: number | '';
  items: { materialId: string; materialNombre: string; tipoPaquete: TipoPaquete; cantPaquetes: number; unidadesPaq: number; totalUnidades: number; numSeries?: string }[];
}

/** Puerto de enriquecerItemsConCosto(): calcula el costo de cada item según su clasificación (consumible/depreciable). */
function enriquecerItemsConCosto(db: Database, items: NuevaRemisionInput['items']): RemisionItem[] {
  const porId = new Map(db.materiales.map((m) => [m.id, m]));
  return items.map((item) => {
    const m = porId.get(item.materialId);
    let costoUnitario: number | null = null;
    let clasificacion: RemisionItem['clasificacion'] = 'Consumible';
    let costoTotalItem: number | null = null;
    if (m) {
      clasificacion = m.clasificacion || 'Consumible';
      const costoPorPieza = m.costoUnidad !== null ? m.costoUnidad / (m.unidadesPaq || 1) : null;
      costoUnitario = clasificacion === 'Depreciable' ? (m.costoUso ?? 0) : costoPorPieza;
      if (costoUnitario !== null) costoTotalItem = Math.round(costoUnitario * item.totalUnidades * 100) / 100;
    }
    return { ...item, costoUnitario, clasificacion, costoTotalItem };
  });
}

/**
 * Puerto de enriquecerItemsConStockDestino() (Fase 3 del original): calcula
 * cuánto YA hay en el Almacén Sede y cuánto realmente hace falta enviar
 * desde el Almacén de Origen — "totalUnidades" sigue siendo lo que ocupa
 * el evento completo; "cantidadEnviar" es lo que de verdad sale de Matriz.
 */
function enriquecerItemsConStockDestino(db: Database, items: RemisionItem[], almacenOrigen: string, almacenSede: string): RemisionItem[] {
  const haySede = almacenSede && almacenSede !== almacenOrigen;
  return items.map((item) => {
    const unidadesPaq = item.unidadesPaq || 1;
    let stockEnDestino = 0;
    if (haySede && item.materialId) {
      const info = calcularStockPorAlmacen(item.materialId, db.movimientos);
      stockEnDestino = Math.max(0, info.porAlmacen[almacenSede] || 0);
    }
    const cantidadEnviar = Math.max(0, item.totalUnidades - stockEnDestino);
    const cantPaquetesEnviar = Math.ceil(cantidadEnviar / unidadesPaq);
    return { ...item, stockEnDestino, cantidadEnviar, cantPaquetesEnviar };
  });
}

function crearMovimientoInterno(db: Database, data: Omit<Movimiento, 'idMov' | 'totalUnidades' | 'regreso'>): { db: Database; mov: Movimiento } {
  const idMov = generarIdSecuencial(db.movimientos.map((m) => m.idMov), 'MOV-', 6);
  const totalUnidades = (Number(data.cantPaquetes) || 0) * (Number(data.unidadesPaq) || 0);
  const mov: Movimiento = { ...data, idMov, totalUnidades, regreso: false };
  return { db: { ...db, movimientos: [...db.movimientos, mov] }, mov };
}

/** Puerto de saveRemision(): crea la remisión y sus movimientos de Salida reales (solo lo que se envía, no lo ya presente en la sede). */
export function crearRemision(db: Database, input: NuevaRemisionInput): { db: Database; folio: string } {
  const folio = generarIdSecuencial(db.remisiones.map((r) => r.folio), 'REM-', 4);
  const almacenOrigen = input.almacen || 'Matriz';
  const almacenSede = input.almacenSede || '';

  let items = enriquecerItemsConCosto(db, input.items);
  items = enriquecerItemsConStockDestino(db, items, almacenOrigen, almacenSede);

  const nuevaRemision: Remision = {
    folio,
    cliente: input.cliente,
    evento: input.evento,
    fechaSalida: input.fechaSalida,
    fechaRegreso: input.fechaRegreso,
    almacen: almacenOrigen,
    almacenSede,
    responsable: input.responsable,
    notas: input.notas,
    items,
    fotos: [],
    cerrada: false,
    fechaCreacion: new Date().toISOString(),
    tipoEvento: input.tipoEvento,
    numEquipos: input.numEquipos,
    numCampistas: input.numCampistas,
    numStaff: input.numStaff,
    numMaestros: input.numMaestros,
  };

  let next: Database = { ...db, remisiones: [...db.remisiones, nuevaRemision] };
  const fechaSalida = input.fechaSalida ? new Date(input.fechaSalida).toISOString() : new Date().toISOString();

  items.forEach((item) => {
    if (!item.cantidadEnviar || item.cantidadEnviar <= 0) return;
    const r = crearMovimientoInterno(next, {
      fecha: fechaSalida,
      materialId: item.materialId,
      materialNombre: item.materialNombre,
      tipo: 'Salida',
      tipoPaquete: item.tipoPaquete,
      cantPaquetes: item.cantPaquetesEnviar || 0,
      unidadesPaq: item.unidadesPaq,
      origen: almacenOrigen,
      destino: '',
      cliente: input.cliente,
      estado: 'Ocupado',
      responsable: input.responsable,
      notas: `Remisión ${folio}${input.evento ? ' — ' + input.evento : ''}`,
      fechaRegreso: input.fechaRegreso,
      numSeries: item.numSeries || '',
    });
    next = r.db;
  });

  return { db: next, folio };
}

/** Puerto de deleteRemision(): borra la remisión Y los movimientos de Salida que generó (identificados por la nota "Remisión <folio>"). */
export function eliminarRemision(db: Database, folio: string): Database {
  return {
    ...db,
    remisiones: db.remisiones.filter((r) => r.folio !== folio),
    movimientos: db.movimientos.filter((m) => !m.notas.includes(`Remisión ${folio}`)),
  };
}

export function toggleRemisionCerrada(db: Database, folio: string, cerrada: boolean): Database {
  return { ...db, remisiones: db.remisiones.map((r) => (r.folio === folio ? { ...r, cerrada } : r)) };
}

export function actualizarChecklistItem(db: Database, folio: string, itemIndex: number, campo: 'checkSalida' | 'checkRegreso', valor: boolean): Database {
  return {
    ...db,
    remisiones: db.remisiones.map((r) => {
      if (r.folio !== folio) return r;
      const items = r.items.map((it, i) => (i === itemIndex ? { ...it, [campo]: valor } : it));
      return { ...r, items };
    }),
  };
}

export interface ItemRegreso {
  materialId: string;
  materialNombre: string;
  tipoPaquete: TipoPaquete;
  unidadesPaq: number;
  cantidadRegresa: number;
}

/** Puerto de registrarRegresoRemision(): crea movimientos de Regreso por lo que sí vuelve, y cierra la remisión. */
export function registrarRegreso(db: Database, folio: string, items: ItemRegreso[], responsable: string, notas: string): Database {
  const remision = db.remisiones.find((r) => r.folio === folio);
  if (!remision) throw new Error('Remisión no encontrada');
  if (remision.cerrada) throw new Error('Esta remisión ya está cerrada');

  let next = db;
  const fechaRegreso = new Date().toISOString();

  items.forEach((item) => {
    if (!item.cantidadRegresa || item.cantidadRegresa <= 0) return;
    const r = crearMovimientoInterno(next, {
      fecha: fechaRegreso,
      materialId: item.materialId,
      materialNombre: item.materialNombre,
      tipo: 'Regreso',
      tipoPaquete: item.tipoPaquete,
      cantPaquetes: item.cantidadRegresa,
      unidadesPaq: item.unidadesPaq || 1,
      origen: '',
      destino: remision.almacen || 'Matriz',
      cliente: remision.cliente || '',
      estado: 'Disponible',
      responsable,
      notas: `Regreso remisión ${folio}${notas ? ' — ' + notas : ''}`,
      fechaRegreso: '',
      numSeries: '',
    });
    next = r.db;
  });

  const notaRegreso = 'Regreso registrado: ' + (notas || '');
  return {
    ...next,
    remisiones: next.remisiones.map((r) =>
      r.folio === folio ? { ...r, fechaRegreso: fechaRegreso, cerrada: true, notas: r.notas ? r.notas + '\n' + notaRegreso : notaRegreso } : r
    ),
  };
}

export function agregarFotoRemision(db: Database, folio: string, url: string): Database {
  return {
    ...db,
    remisiones: db.remisiones.map((r) => (r.folio === folio && r.fotos.length < 3 ? { ...r, fotos: [...r.fotos, url] } : r)),
  };
}

export interface ResultadoEscaneoSalida {
  db: Database;
  encontrado: boolean;
  yaEstaba: boolean;
  totalMarcados: number;
  totalItems: number;
}

/** Marca "Salida ✓" en el ítem de la remisión que corresponde a ese material — usado por el escáner al empacar. */
export function marcarSalidaEscaneada(db: Database, folio: string, materialId: string): ResultadoEscaneoSalida {
  const rem = db.remisiones.find((r) => r.folio === folio);
  if (!rem) return { db, encontrado: false, yaEstaba: false, totalMarcados: 0, totalItems: 0 };
  const idx = rem.items.findIndex((it) => it.materialId === materialId);
  if (idx === -1) return { db, encontrado: false, yaEstaba: false, totalMarcados: 0, totalItems: rem.items.length };
  const yaEstaba = rem.items[idx]?.checkSalida === true;

  const next: Database = {
    ...db,
    remisiones: db.remisiones.map((r) =>
      r.folio === folio ? { ...r, items: r.items.map((it, i) => (i === idx ? { ...it, checkSalida: true } : it)) } : r
    ),
  };
  const remActualizada = next.remisiones.find((r) => r.folio === folio)!;
  const totalMarcados = remActualizada.items.filter((it) => it.checkSalida).length;
  return { db: next, encontrado: true, yaEstaba, totalMarcados, totalItems: remActualizada.items.length };
}

export interface ResultadoEscaneoRegreso {
  db: Database;
  encontrado: boolean;
  yaEstaba: boolean;
  remisionCompleta: boolean;
}

/**
 * Registra el regreso de UN material específico (escaneado uno por uno) —
 * crea el movimiento de Regreso real por la cantidad indicada, guarda el
 * estado (Bien/Roto/Perdido/No regresó) en el propio ítem, y si al
 * terminar TODOS los ítems de la remisión ya tienen su regreso marcado,
 * la cierra automáticamente — igual que hacía el flujo manual, pero
 * material por material en vez de todo de un jalón.
 */
export function registrarRegresoEscaneado(
  db: Database,
  folio: string,
  materialId: string,
  cantidadRegresa: number,
  estado: 'Bien' | 'Roto' | 'Perdido' | 'No regresó',
  responsable: string
): ResultadoEscaneoRegreso {
  const rem = db.remisiones.find((r) => r.folio === folio);
  if (!rem) return { db, encontrado: false, yaEstaba: false, remisionCompleta: false };
  const idx = rem.items.findIndex((it) => it.materialId === materialId);
  if (idx === -1) return { db, encontrado: false, yaEstaba: false, remisionCompleta: false };
  const item = rem.items[idx]!;
  const yaEstaba = item.checkRegreso === true;

  let next = db;
  if (cantidadRegresa > 0) {
    const r = crearMovimientoInterno(next, {
      fecha: new Date().toISOString(),
      materialId: item.materialId,
      materialNombre: item.materialNombre,
      tipo: 'Regreso',
      tipoPaquete: item.tipoPaquete,
      cantPaquetes: cantidadRegresa,
      unidadesPaq: item.unidadesPaq,
      origen: '',
      destino: rem.almacen || 'Matriz',
      cliente: rem.cliente || '',
      estado: 'Disponible',
      responsable,
      notas: `Regreso remisión ${folio} (escaneado) — estado: ${estado}`,
      fechaRegreso: '',
      numSeries: '',
    });
    next = r.db;
  }

  next = {
    ...next,
    remisiones: next.remisiones.map((r) =>
      r.folio === folio
        ? { ...r, items: r.items.map((it, i) => (i === idx ? { ...it, checkRegreso: true, cantidadRegresada: cantidadRegresa, estadoRegreso: estado } : it)) }
        : r
    ),
  };

  const remActualizada = next.remisiones.find((r) => r.folio === folio)!;
  const remisionCompleta = remActualizada.items.every((it) => it.checkRegreso === true);
  if (remisionCompleta) {
    next = {
      ...next,
      remisiones: next.remisiones.map((r) => (r.folio === folio ? { ...r, cerrada: true, fechaRegreso: new Date().toISOString() } : r)),
    };
  }

  return { db: next, encontrado: true, yaEstaba, remisionCompleta };
}
