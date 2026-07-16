import { describe, it, expect } from 'vitest';
import { buscarActividadesEnTexto, consolidarMateriales, analizarPrograma } from '../../src/domain/autoRemision';
import type { Database, Recetario } from '../../src/types';

const RECETARIO_TEST: Recetario = {
  'Aros musicales': { categoria: 'Activa', materiales: [{ material: 'Bocina', cantidad: 1, escala: 'Campamento', notas: '', tipoUso: 'Reutilizable' }, { material: 'Aros', cantidad: 5, escala: 'Equipo', notas: '', tipoUso: 'Consumible' }] },
  'Clínica arco': { categoria: 'Taller', materiales: [{ material: 'Flechas', cantidad: 6, escala: 'Campamento', notas: '', tipoUso: 'Consumible' }] },
  'Karaoke': { categoria: 'Nocturna', materiales: [{ material: 'Bocina', cantidad: 1, escala: 'Campamento', notas: '', tipoUso: 'Reutilizable' }] },
};

function baseDb(overrides: Partial<Database> = {}): Database {
  return {
    version: 1, materiales: [], movimientos: [], almacenes: [], remisiones: [], proveedores: [],
    recetario: RECETARIO_TEST, materialesObligatorios: [], aliasMateriales: {}, aliasActividades: [],
    excepcionesPrograma: [], contablePinHash: '',
    ...overrides,
  };
}

describe('buscarActividadesEnTexto', () => {
  it('detecta una actividad por frase exacta', () => {
    const { actividades } = buscarActividadesEnTexto('09:00 Aros musicales\n10:00 Comida', Object.keys(RECETARIO_TEST), [], []);
    expect(actividades.map((a) => a.nombre)).toContain('Aros musicales');
  });

  it('detecta una actividad por alias (sinónimo del programa)', () => {
    const alias = [{ variante: 'tiro con arco', canonica: 'Clínica arco' }];
    const { actividades } = buscarActividadesEnTexto('11:00 Tiro con arco', Object.keys(RECETARIO_TEST), alias, []);
    expect(actividades.map((a) => a.nombre)).toContain('Clínica arco');
  });

  it('no genera advertencia para líneas de logística que están en excepciones', () => {
    const { advertencias } = buscarActividadesEnTexto('13:00 Comida', Object.keys(RECETARIO_TEST), [], ['Comida']);
    expect(advertencias).toHaveLength(0);
  });

  it('advierte sobre una línea con horario que no reconoce ni es excepción', () => {
    const { advertencias } = buscarActividadesEnTexto('15:00 Actividad totalmente inventada xyz', Object.keys(RECETARIO_TEST), [], []);
    expect(advertencias.length).toBeGreaterThan(0);
  });

  it('extrae el horario de cada actividad detectada', () => {
    const { actividades } = buscarActividadesEnTexto('09:30 Aros musicales', Object.keys(RECETARIO_TEST), [], []);
    expect(actividades[0]?.horario).toBe('09:30');
  });
});

describe('consolidarMateriales — reutilizables por bloque de horario', () => {
  it('suma reutilizables en el MISMO horario (se necesitan a la vez)', () => {
    const actividades = [
      { nombre: 'Aros musicales', idxLinea: 0, horario: '09:00', orden: 1 },
      { nombre: 'Karaoke', idxLinea: 1, horario: '09:00', orden: 2 },
    ];
    const consolidado = consolidarMateriales(actividades, RECETARIO_TEST, 4, 20, 6, 2);
    const bocina = consolidado.find((c) => c.material === 'Bocina')!;
    // Ambas actividades ocurren a las 09:00 => se necesitan al mismo tiempo => se suman: 1+1=2
    expect(bocina.cantidadTotal).toBe(2);
  });

  it('toma el MÁXIMO entre bloques de horario distintos, no la suma', () => {
    const actividades = [
      { nombre: 'Aros musicales', idxLinea: 0, horario: '09:00', orden: 1 },
      { nombre: 'Karaoke', idxLinea: 1, horario: '20:00', orden: 2 },
    ];
    const consolidado = consolidarMateriales(actividades, RECETARIO_TEST, 4, 20, 6, 2);
    const bocina = consolidado.find((c) => c.material === 'Bocina')!;
    // Horarios distintos => no se suman, se toma el máximo de cada bloque (1 y 1) = 1
    expect(bocina.cantidadTotal).toBe(1);
  });

  it('multiplica por número de equipos cuando la escala es "Equipo"', () => {
    const actividades = [{ nombre: 'Aros musicales', idxLinea: 0, horario: '09:00', orden: 1 }];
    const consolidado = consolidarMateriales(actividades, RECETARIO_TEST, 4, 20, 6, 2);
    const aros = consolidado.find((c) => c.material === 'Aros')!;
    expect(aros.cantidadTotal).toBe(5 * 4); // 5 aros × 4 equipos
  });
});

describe('analizarPrograma — integración completa', () => {
  it('cruza actividades detectadas contra el inventario real', () => {
    const db = baseDb({
      materiales: [
        { id: 'MAT-0001', nombre: 'Bocina', tipoPaquete: 'Pieza Única', unidadesPaq: 1, descripcion: '', fotoUrl: '', fechaAlta: '', activo: true, rack: '', seccion: '', zona: '', tieneNumSerie: false, stockMin: null, stockMax: null, costoUnidad: null, clasificacion: 'Consumible', costoUso: null, tdeValor: null, tdeUnidad: '', provPrincipal: '', provAlt1: '', provAlt2: '', provAlt3: '' },
      ],
    });
    const resultado = analizarPrograma(db, '09:00 Aros musicales', 'Campamento', 4, 20, 6, 2);
    const bocina = resultado.items.find((i) => i.materialNombre === 'Bocina')!;
    expect(bocina.enInventario).toBe(true);
    const aros = resultado.items.find((i) => i.materialNombre === 'Aros')!;
    expect(aros.enInventario).toBe(false);
    expect(resultado.advertencias.sinInventario).toContain('Aros');
  });

  it('agrega materiales obligatorios del Tipo de Evento aunque no estén en ninguna actividad', () => {
    const db = baseDb({ materialesObligatorios: [{ tipoEvento: 'Campamento', material: 'Botiquín', cantidad: 1 }] });
    const resultado = analizarPrograma(db, '09:00 Aros musicales', 'Campamento', 4, 20, 6, 2);
    const botiquin = resultado.items.find((i) => i.materialNombre === 'Botiquín');
    expect(botiquin?.esObligatorio).toBe(true);
  });
});
