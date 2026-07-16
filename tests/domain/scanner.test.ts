import { describe, it, expect } from 'vitest';
import { resolverCodigoEscaneado } from '../../src/domain/scanner';
import type { Database, Material } from '../../src/types';

function baseMaterial(partial: Partial<Material>): Material {
  return {
    id: 'MAT-0001', nombre: 'Bocina', tipoPaquete: 'Pieza Única', unidadesPaq: 1,
    descripcion: '', fotoUrl: '', fechaAlta: '', activo: true,
    rack: '', seccion: '', zona: '', tieneNumSerie: false,
    stockMin: null, stockMax: null, costoUnidad: null, clasificacion: 'Consumible',
    costoUso: null, tdeValor: null, tdeUnidad: '',
    provPrincipal: '', provAlt1: '', provAlt2: '', provAlt3: '',
    ...partial,
  };
}

function baseDb(materiales: Material[]): Database {
  return {
    version: 1, materiales, movimientos: [], almacenes: [], remisiones: [], proveedores: [],
    recetario: {}, materialesObligatorios: [], aliasMateriales: {}, aliasActividades: [],
    excepcionesPrograma: [], contablePinHash: '',
  };
}

describe('resolverCodigoEscaneado', () => {
  it('encuentra el material cuando el código coincide con un ID exacto', () => {
    const db = baseDb([baseMaterial({ id: 'MAT-0042', nombre: 'Cono alto' })]);
    const m = resolverCodigoEscaneado(db, 'MAT-0042');
    expect(m?.nombre).toBe('Cono alto');
  });

  it('ignora espacios extra al inicio/final del texto escaneado', () => {
    const db = baseDb([baseMaterial({ id: 'MAT-0042' })]);
    expect(resolverCodigoEscaneado(db, '  MAT-0042  ')).not.toBeNull();
  });

  it('regresa null si el código no corresponde a ningún material', () => {
    const db = baseDb([baseMaterial({ id: 'MAT-0042' })]);
    expect(resolverCodigoEscaneado(db, 'MAT-9999')).toBeNull();
  });

  it('regresa null si el material existe pero está inactivo (dado de baja)', () => {
    const db = baseDb([baseMaterial({ id: 'MAT-0042', activo: false })]);
    expect(resolverCodigoEscaneado(db, 'MAT-0042')).toBeNull();
  });

  it('regresa null con texto vacío', () => {
    const db = baseDb([baseMaterial({ id: 'MAT-0042' })]);
    expect(resolverCodigoEscaneado(db, '')).toBeNull();
  });
});
