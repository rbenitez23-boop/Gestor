import { describe, it, expect } from 'vitest';
import { calcularListaCompras } from '../../src/domain/compras';
import type { Database, Material, Movimiento, Remision } from '../../src/types';

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

function baseDb(materiales: Material[], movimientos: Movimiento[] = [], remisiones: Remision[] = []): Database {
  return {
    version: 1, materiales, movimientos, almacenes: [], remisiones, proveedores: [],
    recetario: {}, materialesObligatorios: [], aliasMateriales: {}, aliasActividades: [],
    excepcionesPrograma: [], contablePinHash: '',
  };
}

describe('calcularListaCompras', () => {
  it('no incluye materiales con stock OK y sin demanda', () => {
    const db = baseDb([baseMaterial({ stockMin: 5, stockMax: 10 })], [
      { idMov: 'MOV-000001', fecha: new Date().toISOString(), materialId: 'MAT-0001', materialNombre: 'Bocina', tipo: 'Alta de Producto', tipoPaquete: 'Pieza Única', cantPaquetes: 10, unidadesPaq: 1, totalUnidades: 10, origen: '', destino: 'Matriz', cliente: '', estado: 'Disponible', responsable: '', notas: '', fechaRegreso: '', regreso: false, numSeries: '' },
    ]);
    expect(calcularListaCompras(db)).toHaveLength(0);
  });

  it('marca urgente y pide comprar al menos 1 cuando el stock es 0', () => {
    const db = baseDb([baseMaterial({})]);
    const lista = calcularListaCompras(db);
    expect(lista[0]?.prioridad).toBe('urgente');
    expect(lista[0]?.cantidadComprar).toBeGreaterThanOrEqual(1);
  });

  it('suma la demanda de remisiones activas no cerradas', () => {
    const db = baseDb(
      [baseMaterial({ stockMin: 2, stockMax: 8 })],
      [{ idMov: 'MOV-000001', fecha: new Date().toISOString(), materialId: 'MAT-0001', materialNombre: 'Bocina', tipo: 'Alta de Producto', tipoPaquete: 'Pieza Única', cantPaquetes: 5, unidadesPaq: 1, totalUnidades: 5, origen: '', destino: 'Matriz', cliente: '', estado: 'Disponible', responsable: '', notas: '', fechaRegreso: '', regreso: false, numSeries: '' }],
      [{
        folio: 'REM-0001', cliente: 'Colegio X', evento: '', fechaSalida: '', fechaRegreso: '',
        almacen: 'Matriz', almacenSede: '', responsable: '', notas: '', fotos: [], cerrada: false,
        fechaCreacion: '', tipoEvento: '', numEquipos: '', numCampistas: '', numStaff: '', numMaestros: '',
        items: [{ materialId: 'MAT-0001', materialNombre: 'Bocina', tipoPaquete: 'Pieza Única', cantPaquetes: 7, unidadesPaq: 1, totalUnidades: 7, cantidadEnviar: 7 }],
      }]
    );
    const lista = calcularListaCompras(db);
    // Demanda (7) - disponible (5) = 2 a comprar por demanda
    expect(lista[0]?.demandaActiva).toBe(7);
    expect(lista[0]?.cantidadComprar).toBeGreaterThanOrEqual(2);
  });

  it('ignora la demanda de remisiones ya cerradas', () => {
    const db = baseDb(
      [baseMaterial({ stockMin: 2, stockMax: 5 })],
      [{ idMov: 'MOV-000001', fecha: new Date().toISOString(), materialId: 'MAT-0001', materialNombre: 'Bocina', tipo: 'Alta de Producto', tipoPaquete: 'Pieza Única', cantPaquetes: 5, unidadesPaq: 1, totalUnidades: 5, origen: '', destino: 'Matriz', cliente: '', estado: 'Disponible', responsable: '', notas: '', fechaRegreso: '', regreso: false, numSeries: '' }],
      [{
        folio: 'REM-0001', cliente: 'Colegio X', evento: '', fechaSalida: '', fechaRegreso: '',
        almacen: 'Matriz', almacenSede: '', responsable: '', notas: '', fotos: [], cerrada: true,
        fechaCreacion: '', tipoEvento: '', numEquipos: '', numCampistas: '', numStaff: '', numMaestros: '',
        items: [{ materialId: 'MAT-0001', materialNombre: 'Bocina', tipoPaquete: 'Pieza Única', cantPaquetes: 7, unidadesPaq: 1, totalUnidades: 7, cantidadEnviar: 7 }],
      }]
    );
    // disponible (5) >= stockMax (5) => prioridad 'ok', y sin demanda activa
    // (la remisión está cerrada) cantidadComprar es 0 => no aparece en la lista.
    expect(calcularListaCompras(db)).toHaveLength(0);
  });

  it('ordena por prioridad y luego por cantidad a comprar', () => {
    const db = baseDb([
      baseMaterial({ id: 'MAT-0001', nombre: 'A', stockMin: 5, stockMax: 10 }),
      baseMaterial({ id: 'MAT-0002', nombre: 'B' }),
    ]);
    const lista = calcularListaCompras(db);
    expect(lista[0]?.prioridad).toBe('urgente');
  });
});
