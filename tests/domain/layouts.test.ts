import { describe, it, expect } from 'vitest';
import { obtenerLayoutItems, extractRackNumber, buscarRackItem, DEFAULT_LAYOUT_ITEMS } from '../../src/domain/layouts';
import type { Database } from '../../src/types';

function baseDb(overrides: Partial<Database> = {}): Database {
  return {
    version: 1, materiales: [], movimientos: [], almacenes: [], remisiones: [], proveedores: [],
    recetario: {}, materialesObligatorios: [], aliasMateriales: {}, aliasActividades: [],
    excepcionesPrograma: [], contablePinHash: '',
    ...overrides,
  };
}

describe('extractRackNumber', () => {
  it('extrae el número de textos como "Rack 7"', () => {
    expect(extractRackNumber('Rack 7')).toBe(7);
  });
  it('regresa null si no hay número', () => {
    expect(extractRackNumber('Sin rack')).toBeNull();
  });
});

describe('obtenerLayoutItems', () => {
  it('usa el set default si no hay nada guardado', () => {
    const items = obtenerLayoutItems(baseDb(), 'baja');
    expect(items.some((i) => i.numero === '1' && i.tipo === 'rack')).toBe(true);
    expect(items.some((i) => i.etiqueta === 'Extintor')).toBe(true);
  });

  it('usa los items guardados por el usuario si existen', () => {
    const custom = [{ id: 'x', floor: 'baja' as const, tipo: 'zona' as const, numero: '', etiqueta: 'Mi zona custom', icono: '📦', x: 0, y: 0, w: 10, h: 10 }];
    const db = baseDb({ uiConfig: { layoutItems: custom } });
    const items = obtenerLayoutItems(db, 'baja');
    expect(items).toHaveLength(1);
    expect(items[0]?.etiqueta).toBe('Mi zona custom');
  });

  it('separa correctamente por planta', () => {
    const baja = obtenerLayoutItems(baseDb(), 'baja');
    const alta = obtenerLayoutItems(baseDb(), 'alta');
    expect(baja.every((i) => i.floor === 'baja')).toBe(true);
    expect(alta.every((i) => i.floor === 'alta')).toBe(true);
  });
});

describe('buscarRackItem', () => {
  it('encuentra el rack correcto por número, sin importar la planta', () => {
    const r22 = buscarRackItem(baseDb(), 22);
    expect(r22?.floor).toBe('alta');
    const r3 = buscarRackItem(baseDb(), 3);
    expect(r3?.floor).toBe('baja');
  });
  it('regresa null si el número no existe', () => {
    expect(buscarRackItem(baseDb(), 999)).toBeNull();
  });
});

describe('DEFAULT_LAYOUT_ITEMS', () => {
  it('incluye los indicadores de seguridad esperados', () => {
    const etiquetas = DEFAULT_LAYOUT_ITEMS.map((i) => i.etiqueta);
    expect(etiquetas).toContain('Extintor');
    expect(etiquetas).toContain('Caja Alto Voltaje');
    expect(etiquetas).toContain('Escaleras');
    expect(etiquetas).toContain('Salida de Emergencia');
  });
});
