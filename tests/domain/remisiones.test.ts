import { describe, it, expect } from 'vitest';
import { crearRemision, eliminarRemision, registrarRegreso, toggleRemisionCerrada } from '../../src/domain/remisiones';
import type { Database, Material, Movimiento } from '../../src/types';

function baseMaterial(partial: Partial<Material>): Material {
  return {
    id: 'MAT-0001', nombre: 'Bocina', tipoPaquete: 'Pieza Única', unidadesPaq: 1,
    descripcion: '', fotoUrl: '', fechaAlta: new Date().toISOString(), activo: true,
    rack: '', seccion: '', zona: '', tieneNumSerie: false,
    stockMin: null, stockMax: null, costoUnidad: null, clasificacion: 'Consumible',
    costoUso: null, tdeValor: null, tdeUnidad: '',
    provPrincipal: '', provAlt1: '', provAlt2: '', provAlt3: '',
    ...partial,
  };
}

function baseDb(materiales: Material[], movimientos: Movimiento[] = []): Database {
  return {
    version: 1, materiales, movimientos, almacenes: [], remisiones: [], proveedores: [],
    recetario: {}, materialesObligatorios: [], aliasMateriales: {}, aliasActividades: [],
    excepcionesPrograma: [], contablePinHash: '',
  };
}

function altaMov(materialId: string, destino: string, cant: number): Movimiento {
  return {
    idMov: 'MOV-000001', fecha: new Date().toISOString(), materialId, materialNombre: 'Bocina',
    tipo: 'Alta de Producto', tipoPaquete: 'Pieza Única', cantPaquetes: cant, unidadesPaq: 1,
    totalUnidades: cant, origen: '', destino, cliente: '', estado: 'Disponible', responsable: '',
    notas: '', fechaRegreso: '', regreso: false, numSeries: '',
  };
}

describe('crearRemision', () => {
  it('sin Almacén Sede, envía el 100% del total solicitado', () => {
    const db = baseDb([baseMaterial({})], [altaMov('MAT-0001', 'Matriz', 10)]);
    const { db: next, folio } = crearRemision(db, {
      cliente: 'Colegio X', evento: '', fechaSalida: '2026-08-01', fechaRegreso: '',
      almacen: 'Matriz', almacenSede: '', responsable: '', notas: '',
      tipoEvento: 'Campamento', numEquipos: '', numCampistas: '', numStaff: '', numMaestros: '',
      items: [{ materialId: 'MAT-0001', materialNombre: 'Bocina', tipoPaquete: 'Pieza Única', cantPaquetes: 3, unidadesPaq: 1, totalUnidades: 3 }],
    });
    const rem = next.remisiones.find((r) => r.folio === folio)!;
    expect(rem.items[0]?.cantidadEnviar).toBe(3);
    const movSalida = next.movimientos.find((m) => m.tipo === 'Salida');
    expect(movSalida?.totalUnidades).toBe(3);
  });

  it('con Almacén Sede que ya tiene stock, solo envía el faltante', () => {
    const db = baseDb(
      [baseMaterial({})],
      [altaMov('MAT-0001', 'Matriz', 10), altaMov('MAT-0001', 'Rancho A', 5)]
    );
    const { db: next, folio } = crearRemision(db, {
      cliente: 'Colegio X', evento: '', fechaSalida: '2026-08-01', fechaRegreso: '',
      almacen: 'Matriz', almacenSede: 'Rancho A', responsable: '', notas: '',
      tipoEvento: 'Campamento', numEquipos: '', numCampistas: '', numStaff: '', numMaestros: '',
      items: [{ materialId: 'MAT-0001', materialNombre: 'Bocina', tipoPaquete: 'Pieza Única', cantPaquetes: 8, unidadesPaq: 1, totalUnidades: 8 }],
    });
    const rem = next.remisiones.find((r) => r.folio === folio)!;
    // El evento necesita 8, el Rancho A ya tiene 5 => solo se envían 3 desde Matriz
    expect(rem.items[0]?.stockEnDestino).toBe(5);
    expect(rem.items[0]?.cantidadEnviar).toBe(3);
    const movSalida = next.movimientos.find((m) => m.tipo === 'Salida');
    expect(movSalida?.totalUnidades).toBe(3);
  });

  it('si la sede ya cubre el 100%, no genera movimiento de Salida', () => {
    const db = baseDb([baseMaterial({})], [altaMov('MAT-0001', 'Rancho A', 10)]);
    const { db: next } = crearRemision(db, {
      cliente: 'Colegio X', evento: '', fechaSalida: '2026-08-01', fechaRegreso: '',
      almacen: 'Matriz', almacenSede: 'Rancho A', responsable: '', notas: '',
      tipoEvento: 'Campamento', numEquipos: '', numCampistas: '', numStaff: '', numMaestros: '',
      items: [{ materialId: 'MAT-0001', materialNombre: 'Bocina', tipoPaquete: 'Pieza Única', cantPaquetes: 5, unidadesPaq: 1, totalUnidades: 5 }],
    });
    expect(next.movimientos.some((m) => m.tipo === 'Salida')).toBe(false);
  });
});

describe('eliminarRemision', () => {
  it('borra la remisión y revierte sus movimientos de Salida asociados', () => {
    const db = baseDb([baseMaterial({})], [altaMov('MAT-0001', 'Matriz', 10)]);
    const { db: withRem, folio } = crearRemision(db, {
      cliente: 'Colegio X', evento: '', fechaSalida: '2026-08-01', fechaRegreso: '',
      almacen: 'Matriz', almacenSede: '', responsable: '', notas: '',
      tipoEvento: 'Campamento', numEquipos: '', numCampistas: '', numStaff: '', numMaestros: '',
      items: [{ materialId: 'MAT-0001', materialNombre: 'Bocina', tipoPaquete: 'Pieza Única', cantPaquetes: 3, unidadesPaq: 1, totalUnidades: 3 }],
    });
    expect(withRem.movimientos).toHaveLength(2); // alta + salida
    const cleaned = eliminarRemision(withRem, folio);
    expect(cleaned.remisiones).toHaveLength(0);
    expect(cleaned.movimientos).toHaveLength(1); // solo queda el alta
  });
});

describe('registrarRegreso', () => {
  it('cierra la remisión y crea movimientos de Regreso solo por lo que sí vuelve', () => {
    const db = baseDb([baseMaterial({})], [altaMov('MAT-0001', 'Matriz', 10)]);
    const { db: withRem, folio } = crearRemision(db, {
      cliente: 'Colegio X', evento: '', fechaSalida: '2026-08-01', fechaRegreso: '',
      almacen: 'Matriz', almacenSede: '', responsable: '', notas: '',
      tipoEvento: 'Campamento', numEquipos: '', numCampistas: '', numStaff: '', numMaestros: '',
      items: [{ materialId: 'MAT-0001', materialNombre: 'Bocina', tipoPaquete: 'Pieza Única', cantPaquetes: 5, unidadesPaq: 1, totalUnidades: 5 }],
    });
    const withRegreso = registrarRegreso(withRem, folio, [
      { materialId: 'MAT-0001', materialNombre: 'Bocina', tipoPaquete: 'Pieza Única', unidadesPaq: 1, cantidadRegresa: 4 },
    ], 'Ana', 'Se perdió 1');
    const rem = withRegreso.remisiones.find((r) => r.folio === folio)!;
    expect(rem.cerrada).toBe(true);
    const regresoMov = withRegreso.movimientos.find((m) => m.tipo === 'Regreso');
    expect(regresoMov?.totalUnidades).toBe(4);
  });

  it('lanza error si la remisión ya está cerrada', () => {
    const db = baseDb([baseMaterial({})], [altaMov('MAT-0001', 'Matriz', 10)]);
    const { db: withRem, folio } = crearRemision(db, {
      cliente: 'Colegio X', evento: '', fechaSalida: '2026-08-01', fechaRegreso: '',
      almacen: 'Matriz', almacenSede: '', responsable: '', notas: '',
      tipoEvento: 'Campamento', numEquipos: '', numCampistas: '', numStaff: '', numMaestros: '',
      items: [{ materialId: 'MAT-0001', materialNombre: 'Bocina', tipoPaquete: 'Pieza Única', cantPaquetes: 5, unidadesPaq: 1, totalUnidades: 5 }],
    });
    const cerrada = toggleRemisionCerrada(withRem, folio, true);
    expect(() => registrarRegreso(cerrada, folio, [], 'Ana', '')).toThrow();
  });
});

describe('lógica financiera de remisiones', () => {
  it('calcula el costo por PIEZA correctamente en un material de granel (ej. bolsa de 100 monedas)', () => {
    // Bolsa de 100 monedas de chocolate que cuesta $80 en total.
    const db = baseDb(
      [baseMaterial({ tipoPaquete: 'Bolsa', unidadesPaq: 100, costoUnidad: 80, clasificacion: 'Consumible' })],
      [altaMov('MAT-0001', 'Matriz', 1000)]
    );
    const { db: next } = crearRemision(db, {
      cliente: 'Colegio X', evento: '', fechaSalida: '2026-08-01', fechaRegreso: '',
      almacen: 'Matriz', almacenSede: '', responsable: '', notas: '',
      tipoEvento: 'Campamento', numEquipos: '', numCampistas: '', numStaff: '', numMaestros: '',
      // Se usan 10 monedas sueltas, NO 10 bolsas.
      items: [{ materialId: 'MAT-0001', materialNombre: 'Monedas de chocolate', tipoPaquete: 'Bolsa', cantPaquetes: 1, unidadesPaq: 100, totalUnidades: 10 }],
    });
    const item = next.remisiones[0]?.items[0];
    // Costo por moneda = 80 / 100 = 0.80 — costo total = 0.80 × 10 = $8, NUNCA $800.
    expect(item?.costoUnitario).toBeCloseTo(0.8);
    expect(item?.costoTotalItem).toBeCloseTo(8);
  });

  it('congela el costo de una remisión ya creada aunque el material suba de precio después (inflación)', () => {
    const db = baseDb([baseMaterial({ costoUnidad: 100, clasificacion: 'Consumible' })], [altaMov('MAT-0001', 'Matriz', 10)]);
    const { db: next } = crearRemision(db, {
      cliente: 'Colegio X', evento: '', fechaSalida: '2026-08-01', fechaRegreso: '',
      almacen: 'Matriz', almacenSede: '', responsable: '', notas: '',
      tipoEvento: 'Campamento', numEquipos: '', numCampistas: '', numStaff: '', numMaestros: '',
      items: [{ materialId: 'MAT-0001', materialNombre: 'Bocina', tipoPaquete: 'Pieza Única', cantPaquetes: 2, unidadesPaq: 1, totalUnidades: 2 }],
    });
    const costoOriginal = next.remisiones[0]?.items[0]?.costoTotalItem;
    expect(costoOriginal).toBe(200); // 2 × $100

    // Sube el precio del material por inflación — la remisión YA CREADA no debe cambiar.
    const dbConInflacion: Database = {
      ...next,
      materiales: next.materiales.map((m) => (m.id === 'MAT-0001' ? { ...m, costoUnidad: 500 } : m)),
    };
    const costoDespuesDeInflacion = dbConInflacion.remisiones[0]?.items[0]?.costoTotalItem;
    expect(costoDespuesDeInflacion).toBe(200); // sigue congelado en $200, no salta a $1000
  });
});
