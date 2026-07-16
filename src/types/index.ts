/**
 * Tipos de dominio — Peña Grande Inventario
 *
 * Estos tipos son el contrato entre la capa de datos (GitHub como base de
 * datos), la lógica de negocio (src/domain) y la interfaz (src/ui).
 * Se mantienen deliberadamente cercanos a los nombres de columnas del
 * Google Sheet original para que la migración de datos sea 1:1 y no haya
 * pérdida ni reinterpretación de información real del negocio.
 */

export type TipoPaquete = 'Bolsa' | 'Caja' | 'Paquete Armado' | 'Pieza Única';

export type EstadoMaterial =
  | 'Disponible'
  | 'Ocupado'
  | 'En Reparación'
  | 'Roto'
  | 'Descompuesto'
  | 'Perdido'
  | 'No Disponible';

export type TipoMovimiento =
  | 'Alta de Producto'
  | 'Baja de Producto'
  | 'Entrada'
  | 'Salida'
  | 'Traspaso'
  | 'Préstamo'
  | 'Regreso'
  | 'Fuera de Servicio'
  | 'En Reparación';

export type Clasificacion = 'Consumible' | 'Depreciable';
export type UnidadTDE = 'Días' | 'Semanas' | 'Meses';
export type Prioridad = 'urgente' | 'alta' | 'media' | 'ok';

export interface Material {
  id: string;
  nombre: string;
  tipoPaquete: TipoPaquete;
  unidadesPaq: number;
  descripcion: string;
  fotoUrl: string;
  fechaAlta: string; // ISO date
  activo: boolean;
  rack: string;
  seccion: string;
  zona: string;
  tieneNumSerie: boolean;
  stockMin: number | null;
  stockMax: number | null;
  costoUnidad: number | null;
  clasificacion: Clasificacion;
  costoUso: number | null;
  tdeValor: number | null;
  tdeUnidad: UnidadTDE | '';
  provPrincipal: string;
  provAlt1: string;
  provAlt2: string;
  provAlt3: string;
}

export interface Movimiento {
  idMov: string;
  fecha: string; // ISO datetime
  materialId: string;
  materialNombre: string;
  tipo: TipoMovimiento;
  tipoPaquete: TipoPaquete;
  cantPaquetes: number;
  unidadesPaq: number;
  totalUnidades: number;
  origen: string;
  destino: string;
  cliente: string;
  estado: EstadoMaterial | '';
  responsable: string;
  notas: string;
  fechaRegreso: string; // ISO date, '' si no aplica
  regreso: boolean;
  numSeries: string;
}

export interface Almacen {
  id: string;
  nombre: string;
  ubicacion: string;
  activo: boolean;
  descripcion: string;
}

export interface RemisionItem {
  materialId: string;
  materialNombre: string;
  tipoPaquete: TipoPaquete;
  cantPaquetes: number;
  unidadesPaq: number;
  totalUnidades: number;
  numSeries?: string;
  fotoUrl?: string;
  costoUnitario?: number | null;
  clasificacion?: Clasificacion;
  costoTotalItem?: number | null;
  stockEnDestino?: number;
  cantidadEnviar?: number;
  cantPaquetesEnviar?: number;
  checkSalida?: boolean;
  checkRegreso?: boolean;
}

export interface Remision {
  folio: string;
  cliente: string;
  evento: string;
  fechaSalida: string;
  fechaRegreso: string;
  almacen: string;
  almacenSede: string;
  responsable: string;
  notas: string;
  items: RemisionItem[];
  fotos: string[];
  cerrada: boolean;
  fechaCreacion: string;
  tipoEvento: string;
  numEquipos: number | '';
  numCampistas: number | '';
  numStaff: number | '';
  numMaestros: number | '';
}

export interface Proveedor {
  id: string;
  nombre: string;
  contacto: string;
  queVende: string;
  dondeLink: string;
  costoReferencia: string;
  tiempoEntrega: string;
  notas: string;
  activo: boolean;
  fechaAlta: string;
}

export interface RecetaMaterial {
  material: string;
  cantidad: number;
  escala: string;
  notas: string;
  tipoUso: 'Reutilizable' | 'Consumible' | '';
}

export interface Actividad {
  categoria: string;
  materiales: RecetaMaterial[];
}

export type Recetario = Record<string, Actividad>;

export interface MaterialObligatorio {
  tipoEvento: string;
  material: string;
  cantidad: number;
}

export interface StockInfo {
  porAlmacen: Record<string, number>;
  fueraServicio: Record<string, number>;
  totalFisico: number;
  totalFueraServ: number;
  totalDisponible: number;
  fuera: number;
  clientes: Record<string, number>;
}

export type LayoutItemTipo = 'rack' | 'zona';

export interface LayoutItem {
  id: string;
  floor: 'baja' | 'alta';
  tipo: LayoutItemTipo;
  numero: string; // solo aplica a racks — vacío para zonas
  etiqueta: string; // texto editable ("Entrada de Material", "Extintor", etc.)
  icono: string; // emoji — vacío para racks (usan "Rack #" como título)
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface UiConfig {
  logoDataUrl?: string;
  layoutItems?: LayoutItem[];
}

/** Estructura completa del "documento" que vive en GitHub. */
export interface Database {
  version: number;
  materiales: Material[];
  movimientos: Movimiento[];
  almacenes: Almacen[];
  remisiones: Remision[];
  proveedores: Proveedor[];
  recetario: Recetario;
  materialesObligatorios: MaterialObligatorio[];
  aliasMateriales: Record<string, string>;
  aliasActividades: { variante: string; canonica: string }[];
  excepcionesPrograma: string[];
  contablePinHash: string; // SHA-256, nunca texto plano
  uiConfig?: UiConfig; // opcional — bases de datos creadas antes de esta versión no lo traen
}
