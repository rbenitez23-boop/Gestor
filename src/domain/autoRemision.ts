import type { Database, RecetaMaterial } from '../types';

// ── NORMALIZACIÓN ──────────────────────────────────────────────
export function normText(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function singularizar(w: string): string {
  return String(w || '').replace(/e?s$/, '');
}

function compactar(s: string): string {
  return normText(s).replace(/\s+/g, '');
}

function contieneCompacto(objetivo: string, contenedor: string): boolean {
  const a = compactar(objetivo);
  const b = compactar(contenedor);
  if (a.length < 6) return false;
  return b.includes(a);
}

function tieneComoPalabra(lineaNorm: string, palabra: string): boolean {
  const palabraSing = singularizar(palabra);
  const tokenMatch = lineaNorm.split(' ').some((w) => w && (w === palabra || singularizar(w) === palabraSing));
  if (tokenMatch) return true;
  return contieneCompacto(palabra, lineaNorm);
}

function buscarFraseConLimites(lineaNorm: string, frase: string): boolean {
  let desde = 0;
  let pos: number;
  while ((pos = lineaNorm.indexOf(frase, desde)) !== -1) {
    const antes = pos === 0 ? ' ' : lineaNorm[pos - 1];
    const idxFin = pos + frase.length;
    const despues = idxFin >= lineaNorm.length ? ' ' : lineaNorm[idxFin];
    if (!/[a-z0-9]/.test(antes || ' ') && !/[a-z0-9]/.test(despues || ' ')) return true;
    desde = pos + frase.length;
  }
  return false;
}

function raizPalabra(w: string): string {
  return String(w || '')
    .replace(/(aciones|ación|amente|mente|ando|iendo|arse|erse|irse|ados|adas|idos|idas|ado|ada|ido|ida)$/, '')
    .replace(/(ar|er|ir|es|os|as|o|a|e|s)$/, '');
}

function compartenRaiz(lineaNorm: string, palabraExcepcion: string): boolean {
  const raizObjetivo = raizPalabra(palabraExcepcion);
  if (!raizObjetivo) return false;
  const tokenMatch = lineaNorm.split(' ').some((w) => w && (w === palabraExcepcion || raizPalabra(w) === raizObjetivo));
  if (tokenMatch) return true;
  return contieneCompacto(palabraExcepcion, lineaNorm);
}

function lineaEsExcepcion(lineaNorm: string, excepcionesPalabras: string[][]): boolean {
  return excepcionesPalabras.some((palabras) => palabras.some((pw) => compartenRaiz(lineaNorm, pw)));
}

function extraerHorario(lineaOriginal: string): string | null {
  const m = String(lineaOriginal || '').match(/^\s*(\d{1,2}:\d{2})/);
  return m ? (m[1] ?? null) : null;
}

const STOPWORDS_ES = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'o', 'en', 'con', 'a', 'para', 'un', 'una', 'al', 'su', 'sus', 'tu', 'tus']);

export interface ActividadDetectada {
  nombre: string;
  idxLinea: number;
  horario: string | null;
  orden: number;
}

export interface ResultadoBusqueda {
  actividades: ActividadDetectada[];
  advertencias: string[];
}

/**
 * Puerto de buscarActividadesEnTexto(): detecta actividades del Recetario
 * dentro del texto del programa por (1) alias exactos, (2) frase exacta,
 * (3) todas las palabras clave presentes en la misma línea.
 */
export function buscarActividadesEnTexto(
  texto: string,
  actividadesConocidas: string[],
  aliasActividades: { variante: string; canonica: string; variantNorm?: string }[],
  excepcionesPrograma: string[]
): ResultadoBusqueda {
  const lineasOriginales = String(texto).split(/\r?\n/);
  const lineasNorm = lineasOriginales.map((l) => normText(l));
  const encontradas: ActividadDetectada[] = [];
  const yaMarcado = new Set<string>();

  const marcar = (nombreAct: string, idxLinea: number) => {
    const key = nombreAct + '|' + idxLinea;
    if (yaMarcado.has(key)) return;
    yaMarcado.add(key);
    encontradas.push({ nombre: nombreAct, idxLinea, horario: extraerHorario(lineasOriginales[idxLinea] || ''), orden: 0 });
  };

  const actConocidasSet = new Set(actividadesConocidas);
  lineasNorm.forEach((lineaNorm, idxLinea) => {
    if (!lineaNorm) return;
    aliasActividades.forEach((a) => {
      const variantNorm = a.variantNorm ?? normText(a.variante);
      if (!variantNorm || !actConocidasSet.has(a.canonica)) return;
      if (buscarFraseConLimites(lineaNorm, variantNorm)) marcar(a.canonica, idxLinea);
    });
  });

  actividadesConocidas.forEach((nombreAct) => {
    const actNorm = normText(nombreAct);
    if (!actNorm) return;
    const palabrasSignificativas = actNorm.split(' ').filter((w) => w && !STOPWORDS_ES.has(w));
    if (!palabrasSignificativas.length) return;

    lineasNorm.forEach((lineaNorm, idxLinea) => {
      if (!lineaNorm) return;
      let match = buscarFraseConLimites(lineaNorm, actNorm);
      if (!match && palabrasSignificativas.length >= 2) {
        match = palabrasSignificativas.every((pw) => tieneComoPalabra(lineaNorm, pw));
      }
      if (match) marcar(nombreAct, idxLinea);
    });
  });

  encontradas.sort((a, b) => a.idxLinea - b.idxLinea);
  encontradas.forEach((a, i) => (a.orden = i + 1));

  const lineasConMatch = new Set(encontradas.map((a) => a.idxLinea));
  const excepcionesPalabras = excepcionesPrograma.map((t) => normText(t).split(' ').filter(Boolean));
  const advertencias: string[] = [];
  lineasOriginales.forEach((linea, idxLinea) => {
    if (lineasConMatch.has(idxLinea)) return;
    const m = linea.match(/^\s*\d{1,2}:\d{2}\s*[-–—]?\s*(.+)$/);
    if (!m) return;
    const posible = (m[1] || '').trim();
    if (!posible || posible.length < 3) return;
    if (lineaEsExcepcion(lineasNorm[idxLinea] || '', excepcionesPalabras)) return;
    advertencias.push(`Línea con horario no reconocida como actividad: "${posible}" — agrégala al Recetario, a Alias Actividades, o a Excepciones si nunca será una actividad.`);
  });

  return { actividades: encontradas, advertencias };
}

// ── CONSOLIDACIÓN DE MATERIALES ────────────────────────────────
const MATERIALES_REUTILIZABLES_DEFAULT = new Set([
  'bocina', 'extension', 'proyector', 'computadora', 'aspiradora', 'microfono',
  'paracaidas', 'pelota inflable gigante', 'pelota inflable grande', 'pelota gigante',
  'gato gigante', 'jenga gigante', 'dado gigante', 'lona de maraton', 'lona stop',
  'lona de basta', 'resbalin', 'peluca afro', 'baul vacio', 'pizarron',
  'mochila de disfraces', 'laberinto suspendido', 'paddle board',
  'cuerda naranja', 'cuerda de tirolesa', 'resorte',
]);

function calcularMultiplicador(escala: string, numEquipos: number, numCampistas: number, numStaff: number, numMaestros: number): number {
  const s = normText(escala);
  if (s.includes('equipo')) return numEquipos || 1;
  const tieneCampista = s.includes('campista');
  const tieneStaff = s.includes('staff');
  const tieneMaestro = s.includes('maestro');
  if (tieneCampista || tieneStaff || tieneMaestro) {
    let total = 0;
    if (tieneCampista) total += numCampistas || 0;
    if (tieneStaff) total += numStaff || 0;
    if (tieneMaestro) total += numMaestros || 0;
    return total || 1;
  }
  return 1;
}

export interface MaterialConsolidado {
  material: string;
  cantidadTotal: number;
  actividades: string[];
  esReutilizable: boolean;
  esObligatorio?: boolean;
}

/**
 * Puerto de consolidarMateriales(): los reutilizables se agrupan por
 * bloque de horario simultáneo (se suman entre sí en el mismo horario,
 * pero se toma el MÁXIMO contra otros horarios); los consumibles se
 * suman siempre.
 */
export function consolidarMateriales(
  actividades: ActividadDetectada[],
  recetario: Database['recetario'],
  numEquipos: number,
  numCampistas: number,
  numStaff: number,
  numMaestros: number
): MaterialConsolidado[] {
  const registros: Record<string, { material: string; esReutilizable: boolean; bloques: Record<string, number>; sumaConsumible: number; actividades: string[] }> = {};
  let solaCounter = 0;

  actividades.forEach((a) => {
    const receta = recetario[a.nombre];
    if (!receta) return;
    const horarioKey = a.horario || '__sola__' + solaCounter++;

    receta.materiales.forEach((m: RecetaMaterial) => {
      const key = normText(m.material);
      const mult = calcularMultiplicador(m.escala, numEquipos, numCampistas, numStaff, numMaestros);
      const cantReal = (m.cantidad || 1) * mult;
      const esEscalaCampamento = normText(m.escala || '') === 'campamento';
      const esReutilizable = esEscalaCampamento || m.tipoUso === 'Reutilizable' || (!m.tipoUso && MATERIALES_REUTILIZABLES_DEFAULT.has(key));

      if (!registros[key]) registros[key] = { material: m.material, esReutilizable, bloques: {}, sumaConsumible: 0, actividades: [] };
      const reg = registros[key];
      if (esReutilizable) reg.bloques[horarioKey] = (reg.bloques[horarioKey] || 0) + cantReal;
      else reg.sumaConsumible += cantReal;
      if (!reg.actividades.includes(a.nombre)) reg.actividades.push(a.nombre);
    });
  });

  return Object.values(registros)
    .map((r) => ({
      material: r.material,
      cantidadTotal: r.esReutilizable ? Math.max(0, ...Object.values(r.bloques)) : r.sumaConsumible,
      actividades: r.actividades,
      esReutilizable: r.esReutilizable,
    }))
    .sort((a, b) => a.material.localeCompare(b.material));
}

/** Fusiona los materiales obligatorios por Tipo de Evento — siempre mandan su propia cantidad, sin duplicar. */
export function mergeObligatorios(consolidados: MaterialConsolidado[], db: Database, tipoEvento: string): MaterialConsolidado[] {
  const obligatorios = db.materialesObligatorios.filter((o) => normText(o.tipoEvento) === normText(tipoEvento));
  if (!obligatorios.length) return consolidados;

  const porNombre = new Map(consolidados.map((c) => [normText(c.material), c]));
  const etiqueta = 'Obligatorio — ' + tipoEvento;
  obligatorios.forEach((o) => {
    const key = normText(o.material);
    const existente = porNombre.get(key);
    if (existente) {
      existente.cantidadTotal = o.cantidad;
      existente.esObligatorio = true;
      if (!existente.actividades.includes(etiqueta)) existente.actividades.push(etiqueta);
    } else {
      const nuevo: MaterialConsolidado = { material: o.material, cantidadTotal: o.cantidad, actividades: [etiqueta], esReutilizable: true, esObligatorio: true };
      consolidados.push(nuevo);
      porNombre.set(key, nuevo);
    }
  });
  return consolidados;
}

// ── MATCHING CONTRA INVENTARIO ──────────────────────────────────
function materialesCoinciden(nombreA: string, nombreB: string): boolean {
  const a = normText(nombreA).split(' ').filter(Boolean).map((w) => w.replace(/e?s$/, ''));
  const b = normText(nombreB).split(' ').filter(Boolean).map((w) => w.replace(/e?s$/, ''));
  if (a.length === 0 || b.length === 0) return false;
  if (a.join(' ') === b.join(' ')) return true;
  if (contieneCompacto(nombreA, nombreB) || contieneCompacto(nombreB, nombreA)) return true;
  const setB = new Set(b);
  const coincidencias = a.filter((w) => setB.has(w)).length;
  return coincidencias / Math.min(a.length, b.length) >= 0.75;
}

export interface ItemAutoRemision {
  materialId: string | null;
  materialNombre: string;
  tipoPaquete: string;
  unidadesPaq: number;
  totalUnidades: number;
  cantPaquetes: number;
  enInventario: boolean;
  matchAproximado: boolean;
  esReutilizable: boolean;
  esObligatorio: boolean;
  actividades: string[];
}

export interface ResultadoAutoRemision {
  actividadesDetectadas: ActividadDetectada[];
  items: ItemAutoRemision[];
  advertencias: {
    sinInventario: string[];
    advertenciasLectura: string[];
  };
}

/** Puerto de analizarProgramaIA() — sin IA, motor determinista de texto. */
export function analizarPrograma(
  db: Database,
  texto: string,
  tipoEvento: string,
  numEquipos: number,
  numCampistas: number,
  numStaff: number,
  numMaestros: number
): ResultadoAutoRemision {
  const actividadesConocidas = Object.keys(db.recetario);
  const { actividades, advertencias } = buscarActividadesEnTexto(texto, actividadesConocidas, db.aliasActividades, db.excepcionesPrograma);

  let consolidados = consolidarMateriales(actividades, db.recetario, numEquipos, numCampistas, numStaff, numMaestros);
  consolidados = mergeObligatorios(consolidados, db, tipoEvento);

  const inventario = new Map(db.materiales.filter((m) => m.activo !== false).map((m) => [normText(m.nombre), m]));

  const items: ItemAutoRemision[] = consolidados.map((item) => {
    const normNombre = normText(item.material);
    const aliasNombreCat = db.aliasMateriales[normNombre];
    let matKey: string | null = null;
    let esAproximado = false;

    if (aliasNombreCat && inventario.has(normText(aliasNombreCat))) matKey = normText(aliasNombreCat);
    if (!matKey && inventario.has(normNombre)) matKey = normNombre;
    if (!matKey) {
      for (const [k, m] of inventario) {
        if (materialesCoinciden(item.material, m.nombre)) {
          matKey = k;
          esAproximado = true;
          break;
        }
      }
    }

    const inv = matKey ? inventario.get(matKey) : undefined;
    const unidadesPaq = inv?.unidadesPaq || 1;
    const totalUnidades = Math.ceil(item.cantidadTotal);
    const cantPaquetes = Math.ceil(totalUnidades / unidadesPaq);

    return {
      materialId: inv?.id ?? null,
      materialNombre: inv?.nombre ?? item.material,
      tipoPaquete: inv?.tipoPaquete ?? 'Pieza Única',
      unidadesPaq,
      totalUnidades,
      cantPaquetes,
      enInventario: !!inv,
      matchAproximado: esAproximado,
      esReutilizable: item.esReutilizable,
      esObligatorio: item.esObligatorio || false,
      actividades: item.actividades,
    };
  });

  return {
    actividadesDetectadas: actividades,
    items,
    advertencias: {
      sinInventario: items.filter((i) => !i.enInventario).map((i) => i.materialNombre),
      advertenciasLectura: advertencias,
    },
  };
}
