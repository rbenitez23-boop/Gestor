import type { LayoutItem, LayoutItemTipo, Database } from '../types';

export interface ItemPreset {
  key: string;
  tipo: LayoutItemTipo;
  etiquetaDefault: string;
  icono: string;
  w: number;
  h: number;
}

/** Catálogo de elementos "de ley" que cualquier almacén necesita señalar — se agregan desde el botón "+ Agregar elemento" en modo edición. */
export const ITEM_PRESETS: ItemPreset[] = [
  { key: 'rack', tipo: 'rack', etiquetaDefault: 'Nueva sección', icono: '', w: 150, h: 70 },
  { key: 'puerta', tipo: 'zona', etiquetaDefault: 'Puerta', icono: '🚪', w: 60, h: 70 },
  { key: 'entrada', tipo: 'zona', etiquetaDefault: 'Entrada de Material', icono: '➡️', w: 140, h: 60 },
  { key: 'salida', tipo: 'zona', etiquetaDefault: 'Salida de Material', icono: '⬅️', w: 140, h: 60 },
  { key: 'escalera', tipo: 'zona', etiquetaDefault: 'Escaleras', icono: '🪜', w: 180, h: 55 },
  { key: 'extintor', tipo: 'zona', etiquetaDefault: 'Extintor', icono: '🧯', w: 60, h: 55 },
  { key: 'voltaje', tipo: 'zona', etiquetaDefault: 'Caja Alto Voltaje', icono: '⚡', w: 75, h: 55 },
  { key: 'camara', tipo: 'zona', etiquetaDefault: 'Cámara', icono: '📷', w: 65, h: 50 },
  { key: 'emergencia', tipo: 'zona', etiquetaDefault: 'Salida de Emergencia', icono: '🚨', w: 170, h: 45 },
  { key: 'generico', tipo: 'zona', etiquetaDefault: 'Zona / Bodega', icono: '📦', w: 130, h: 60 },
];

function item(floor: 'baja' | 'alta', tipo: LayoutItemTipo, numero: string, etiqueta: string, icono: string, x: number, y: number, w: number, h: number): LayoutItem {
  // El ID incluye la posición para garantizar unicidad incluso cuando dos
  // elementos comparten la misma etiqueta (ej. los dos "Garrafones" del
  // almacén) — antes esto causaba que ambos compartieran el mismo ID de
  // DOM y el sistema se confundiera al arrastrar/editar uno de los dos.
  const base = `${floor}-${tipo}-${numero || etiqueta}-${x}-${y}`;
  return { id: base.toLowerCase().replace(/\s+/g, '-'), floor, tipo, numero, etiqueta, icono, x, y, w, h };
}

/**
 * Set inicial — mismas coordenadas y elementos que el diseño original
 * (racks numerados + puertas, escaleras, extintor, alto voltaje, cámara,
 * salidas de emergencia y zonas de almacenaje). El usuario puede editar,
 * mover, redimensionar, agregar o borrar cualquiera de estos desde el
 * modo edición — se guardan compartidos para todo el equipo.
 */
export const DEFAULT_LAYOUT_ITEMS: LayoutItem[] = [
  // ── Planta Baja (viewBox 0 0 680 800) ──
  item('baja', 'rack', '1', 'Entrada de Material', '', 18, 284, 148, 110),
  item('baja', 'rack', '2', 'Entrada de Material', '', 18, 118, 148, 100),
  item('baja', 'rack', '3', 'Desechables + Electrónicos', '', 174, 18, 160, 80),
  item('baja', 'rack', '4', 'Materiales cocina + Bocinas', '', 342, 18, 172, 80),
  item('baja', 'rack', '5', 'Salida de Material', '', 524, 300, 148, 110),
  item('baja', 'rack', '6', 'Salida de Material', '', 524, 420, 148, 110),
  item('baja', 'zona', '', 'Puerta Oficina', '🚪', 600, 18, 62, 80),
  item('baja', 'zona', '', 'Puerta Calle', '🚪', 18, 560, 50, 100),
  item('baja', 'zona', '', 'Baúles', '📦', 524, 118, 148, 60),
  item('baja', 'zona', '', 'Papelería', '📦', 524, 184, 148, 52),
  item('baja', 'zona', '', 'Garrafones', '📦', 524, 242, 148, 50),
  item('baja', 'zona', '', 'Garrafones', '📦', 18, 226, 148, 50),
  item('baja', 'zona', '', 'Medicamentos', '📦', 524, 650, 148, 60),
  item('baja', 'zona', '', 'Salida de Emergencia', '🚨', 68, 580, 160, 40),
  item('baja', 'zona', '', 'Escaleras', '🪜', 174, 710, 490, 70),
  item('baja', 'zona', '', 'Extintor', '🧯', 18, 710, 64, 60),
  item('baja', 'zona', '', 'Caja Alto Voltaje', '⚡', 90, 710, 80, 60),
  item('baja', 'zona', '', 'Cámara', '📷', 598, 595, 74, 46),

  // ── Planta Alta (viewBox 0 0 700 870) ──
  item('alta', 'rack', '22', 'Casas de Campaña', '', 18, 18, 202, 72),
  item('alta', 'rack', '23', 'Casas de Campaña', '', 228, 18, 202, 72),
  item('alta', 'rack', '24', 'Casas de Campaña', '', 438, 18, 244, 72),
  item('alta', 'rack', '21', 'Equipo de Seguridad + Extras', '', 18, 100, 160, 130),
  item('alta', 'rack', '25', 'Souvenirs Do It', '', 538, 100, 144, 130),
  item('alta', 'rack', '20', 'Souvenirs (PG)', '', 18, 244, 155, 60),
  item('alta', 'rack', '19', 'Clínica de tiro', '', 181, 244, 155, 60),
  item('alta', 'rack', '17', 'Resorteras', '', 18, 312, 155, 58),
  item('alta', 'rack', '18', 'Clínica de tiro', '', 181, 312, 155, 58),
  item('alta', 'rack', '26', 'Paddle Board', '', 538, 244, 144, 130),
  item('alta', 'rack', '16', 'Acuáticos', '', 18, 400, 155, 58),
  item('alta', 'rack', '15', 'Acuáticos', '', 181, 400, 155, 58),
  item('alta', 'rack', '13', 'Juegos de mesa', '', 18, 466, 155, 58),
  item('alta', 'rack', '14', 'Cocina y Telas', '', 181, 466, 155, 58),
  item('alta', 'rack', '27', 'Paddle Board', '', 538, 384, 144, 130),
  item('alta', 'rack', '12', 'Noche Disco', '', 18, 554, 155, 58),
  item('alta', 'rack', '11', 'Papelería talleres', '', 181, 554, 155, 58),
  item('alta', 'rack', '9', 'Noche Disco', '', 18, 620, 155, 58),
  item('alta', 'rack', '10', 'Papelería talleres', '', 181, 620, 155, 58),
  item('alta', 'rack', '28', 'Paddle Board', '', 538, 524, 144, 130),
  item('alta', 'rack', '8', 'Deportes', '', 18, 698, 155, 60),
  item('alta', 'rack', '7', 'Deportes', '', 181, 698, 155, 60),
  item('alta', 'zona', '', 'Bolsa de Balones', '📦', 538, 664, 144, 52),
  item('alta', 'zona', '', 'Cuerdas de Algodón', '📦', 538, 722, 144, 52),
  item('alta', 'zona', '', 'Salida de Emergencia', '🚨', 344, 748, 180, 42),
  item('alta', 'zona', '', 'Extintor', '🧯', 18, 786, 56, 52),
  item('alta', 'zona', '', 'Caja Alto Voltaje', '⚡', 82, 786, 56, 52),
  item('alta', 'zona', '', 'Escaleras', '🪜', 344, 796, 194, 46),
];

export function obtenerLayoutItems(db: Database, floor: 'baja' | 'alta'): LayoutItem[] {
  const guardados = db.uiConfig?.layoutItems;
  const fuente = guardados && guardados.length ? guardados : DEFAULT_LAYOUT_ITEMS;
  return fuente.filter((i) => i.floor === floor);
}

export function nuevoItemId(): string {
  return 'item-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function extractRackNumber(rackText: string): number | null {
  if (!rackText) return null;
  const m = String(rackText).match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

/** Encuentra el item de rack (en cualquier planta) que corresponde al rack de un material — para el buscador. */
export function buscarRackItem(db: Database, numero: number): LayoutItem | null {
  const todos = db.uiConfig?.layoutItems?.length ? db.uiConfig.layoutItems : DEFAULT_LAYOUT_ITEMS;
  return todos.find((i) => i.tipo === 'rack' && parseInt(i.numero, 10) === numero) || null;
}
