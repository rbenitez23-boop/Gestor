import { describe, it, expect } from 'vitest';
import { calcularReporteContable, verificarPin, cambiarPin } from '../../src/domain/contable';
import { sha256 } from '../../src/services/crypto';
import type { Database, Remision } from '../../src/types';

function baseDb(remisiones: Remision[] = [], pinHash = ''): Database {
  return {
    version: 1, materiales: [], movimientos: [], almacenes: [], remisiones, proveedores: [],
    recetario: {}, materialesObligatorios: [], aliasMateriales: {}, aliasActividades: [],
    excepcionesPrograma: [], contablePinHash: pinHash,
  };
}

function rem(partial: Partial<Remision>): Remision {
  return {
    folio: 'REM-0001', cliente: 'Colegio X', evento: '', fechaSalida: '2026-08-01', fechaRegreso: '',
    almacen: 'Matriz', almacenSede: '', responsable: '', notas: '', fotos: [], cerrada: false,
    fechaCreacion: '', tipoEvento: '', numEquipos: '', numCampistas: '', numStaff: '', numMaestros: '',
    items: [],
    ...partial,
  };
}

describe('calcularReporteContable', () => {
  it('separa el costo de consumibles y depreciables correctamente', () => {
    const db = baseDb([
      rem({
        items: [
          { materialId: 'MAT-0001', materialNombre: 'Playera', tipoPaquete: 'Pieza Única', cantPaquetes: 1, unidadesPaq: 1, totalUnidades: 10, clasificacion: 'Consumible', costoTotalItem: 500 },
          { materialId: 'MAT-0002', materialNombre: 'Bocina', tipoPaquete: 'Pieza Única', cantPaquetes: 1, unidadesPaq: 1, totalUnidades: 2, clasificacion: 'Depreciable', costoTotalItem: 40 },
        ],
      }),
    ]);
    const reporte = calcularReporteContable(db);
    expect(reporte.totales.consumibles).toBe(500);
    expect(reporte.totales.depreciables).toBe(40);
    expect(reporte.totales.total).toBe(540);
  });
});

describe('PIN de Remisiones Contables', () => {
  it('verifica correctamente un PIN válido', async () => {
    const db = baseDb([], await sha256('1234'));
    expect(await verificarPin(db, '1234')).toBe(true);
    expect(await verificarPin(db, '9999')).toBe(false);
  });

  it('cambia el PIN solo si el actual es correcto y el nuevo tiene al menos 4 caracteres', async () => {
    const db = baseDb([], await sha256('1234'));
    const updated = await cambiarPin(db, '1234', '5678');
    expect(await verificarPin(updated, '5678')).toBe(true);
    await expect(cambiarPin(db, 'malo', '5678')).rejects.toThrow();
    await expect(cambiarPin(db, '1234', 'ab')).rejects.toThrow();
  });
});
