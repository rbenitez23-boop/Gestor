import type { Database, Material } from '../types';

/**
 * El QR de cada material solo codifica su ID (ej. "MAT-0001") — nunca una
 * URL completa. Decisión deliberada: si el repositorio o el dominio de
 * GitHub Pages cambiara de nombre en el futuro (ya ha pasado en este
 * proyecto), todas las etiquetas físicas impresas seguirían funcionando
 * sin necesidad de reimprimir nada, porque el ID de un material nunca
 * cambia una vez asignado.
 */
export function resolverCodigoEscaneado(db: Database, codigo: string): Material | null {
  const limpio = String(codigo || '').trim();
  if (!limpio) return null;
  return db.materiales.find((m) => m.id === limpio && m.activo !== false) || null;
}

/** Tipos de movimiento que tienen sentido registrar rápido desde el escáner (se excluyen Alta/Baja de producto, que requieren más contexto). */
export const TIPOS_MOV_ESCANER = ['Salida', 'Entrada', 'Préstamo', 'Regreso', 'Traspaso', 'Fuera de Servicio', 'En Reparación'] as const;
