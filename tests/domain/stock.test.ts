import { describe, it, expect } from 'vitest';
import { calcularStockPorAlmacen, calcularStockTodosLosMateriales, calcularPrioridad, tdeADias } from '../../src/domain/stock';
import type { Movimiento } from '../../src/types';

function mov(partial: Partial<Movimiento>): Movimiento {
  return {
    idMov: 'MOV-000001',
    fecha: new Date().toISOString(),
    materialId: 'MAT-0001',
    materialNombre: 'Bocina',
    tipo: 'Entrada',
    tipoPaquete: 'Pieza Única',
    cantPaquetes: 1,
    unidadesPaq: 1,
    totalUnidades: 1,
    origen: '',
    destino: '',
    cliente: '',
    estado: 'Disponible',
    responsable: '',
    notas: '',
    fechaRegreso: '',
    regreso: false,
    numSeries: '',
    ...partial,
  };
}

describe('calcularStockPorAlmacen', () => {
  it('una Alta de Producto suma al almacén destino', () => {
    const info = calcularStockPorAlmacen('MAT-0001', [
      mov({ tipo: 'Alta de Producto', destino: 'Matriz', totalUnidades: 10 }),
    ]);
    expect(info.porAlmacen['Matriz']).toBe(10);
    expect(info.totalDisponible).toBe(10);
  });

  it('una Salida sin regreso resta del origen y suma a "fuera"', () => {
    const info = calcularStockPorAlmacen('MAT-0001', [
      mov({ tipo: 'Alta de Producto', destino: 'Matriz', totalUnidades: 10 }),
      mov({ tipo: 'Salida', origen: 'Matriz', cliente: 'Colegio X', totalUnidades: 4 }),
    ]);
    expect(info.porAlmacen['Matriz']).toBe(6);
    expect(info.fuera).toBe(4);
    expect(info.clientes['Colegio X']).toBe(4);
    expect(info.totalDisponible).toBe(6);
  });

  it('un Regreso revierte la Salida correctamente', () => {
    const info = calcularStockPorAlmacen('MAT-0001', [
      mov({ tipo: 'Alta de Producto', destino: 'Matriz', totalUnidades: 10 }),
      mov({ tipo: 'Salida', origen: 'Matriz', cliente: 'Colegio X', totalUnidades: 4 }),
      mov({ tipo: 'Regreso', destino: 'Matriz', cliente: 'Colegio X', totalUnidades: 4 }),
    ]);
    expect(info.porAlmacen['Matriz']).toBe(10);
    expect(info.fuera).toBe(0);
    expect(info.clientes['Colegio X']).toBe(0);
  });

  it('un Traspaso mueve stock entre almacenes sin cambiar el total', () => {
    const info = calcularStockPorAlmacen('MAT-0001', [
      mov({ tipo: 'Alta de Producto', destino: 'Matriz', totalUnidades: 10 }),
      mov({ tipo: 'Traspaso', origen: 'Matriz', destino: 'Rancho A', totalUnidades: 3 }),
    ]);
    expect(info.porAlmacen['Matriz']).toBe(7);
    expect(info.porAlmacen['Rancho A']).toBe(3);
    expect(info.totalFisico).toBe(10);
  });

  it('Fuera de Servicio resta del disponible pero no del total físico', () => {
    const info = calcularStockPorAlmacen('MAT-0001', [
      mov({ tipo: 'Alta de Producto', destino: 'Matriz', totalUnidades: 10 }),
      mov({ tipo: 'Fuera de Servicio', origen: 'Matriz', totalUnidades: 2 }),
    ]);
    expect(info.totalFisico).toBe(10);
    expect(info.totalFueraServ).toBe(2);
    expect(info.totalDisponible).toBe(8);
  });

  it('el disponible nunca es negativo', () => {
    const info = calcularStockPorAlmacen('MAT-0001', [
      mov({ tipo: 'Salida', origen: 'Matriz', totalUnidades: 5 }),
    ]);
    expect(info.totalDisponible).toBe(0);
  });
});

describe('calcularStockTodosLosMateriales', () => {
  it('calcula varios materiales en una sola pasada de forma independiente', () => {
    const movs = [
      mov({ materialId: 'MAT-0001', tipo: 'Alta de Producto', destino: 'Matriz', totalUnidades: 10 }),
      mov({ materialId: 'MAT-0002', tipo: 'Alta de Producto', destino: 'Matriz', totalUnidades: 5 }),
      mov({ materialId: 'MAT-0001', tipo: 'Salida', origen: 'Matriz', totalUnidades: 2 }),
    ];
    const resultado = calcularStockTodosLosMateriales(movs);
    expect(resultado['MAT-0001']?.totalDisponible).toBe(8);
    expect(resultado['MAT-0002']?.totalDisponible).toBe(5);
  });
});

describe('calcularPrioridad', () => {
  it('marca urgente cuando el disponible es 0 o menos', () => {
    expect(calcularPrioridad(0, 5, 10)).toBe('urgente');
  });
  it('marca alta cuando está por debajo del mínimo', () => {
    expect(calcularPrioridad(3, 5, 10)).toBe('alta');
  });
  it('marca media cuando está por debajo del máximo pero sobre el mínimo', () => {
    expect(calcularPrioridad(7, 5, 10)).toBe('media');
  });
  it('marca ok cuando está en o sobre el máximo', () => {
    expect(calcularPrioridad(12, 5, 10)).toBe('ok');
  });
});

describe('tdeADias', () => {
  it('convierte semanas y meses a días', () => {
    expect(tdeADias(2, 'Semanas')).toBe(14);
    expect(tdeADias(1, 'Meses')).toBe(30);
    expect(tdeADias(5, 'Días')).toBe(5);
    expect(tdeADias(null, 'Días')).toBeNull();
  });
});
