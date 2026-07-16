import { describe, it, expect } from 'vitest';
import { guardarActividad, eliminarActividad, listarActividades } from '../../src/domain/recetario';
import type { Database } from '../../src/types';

function baseDb(): Database {
  return {
    version: 1, materiales: [], movimientos: [], almacenes: [], remisiones: [], proveedores: [],
    recetario: {}, materialesObligatorios: [], aliasMateriales: {}, aliasActividades: [],
    excepcionesPrograma: [], contablePinHash: '',
  };
}

describe('recetario', () => {
  it('agrega una actividad nueva', () => {
    const db = guardarActividad(baseDb(), null, 'Aros musicales', { categoria: 'Activa', materiales: [{ material: 'Aros', cantidad: 5, escala: 'Equipo', notas: '', tipoUso: 'Reutilizable' }] });
    expect(listarActividades(db)).toHaveLength(1);
    expect(db.recetario['Aros musicales']?.materiales[0]?.material).toBe('Aros');
  });

  it('al editar y renombrar, quita el nombre viejo y deja solo el nuevo', () => {
    let db = guardarActividad(baseDb(), null, 'Aros musicales', { categoria: 'Activa', materiales: [] });
    db = guardarActividad(db, 'Aros musicales', 'Aros musicales v2', { categoria: 'Activa', materiales: [] });
    expect(db.recetario['Aros musicales']).toBeUndefined();
    expect(db.recetario['Aros musicales v2']).toBeDefined();
  });

  it('elimina una actividad', () => {
    let db = guardarActividad(baseDb(), null, 'Fogata', { categoria: 'Nocturna', materiales: [] });
    db = eliminarActividad(db, 'Fogata');
    expect(listarActividades(db)).toHaveLength(0);
  });
});
