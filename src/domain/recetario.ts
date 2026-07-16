import type { Database, Actividad, RecetaMaterial } from '../types';

export function listarActividades(db: Database): { nombre: string; actividad: Actividad }[] {
  return Object.entries(db.recetario)
    .map(([nombre, actividad]) => ({ nombre, actividad }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export function guardarActividad(db: Database, nombreOriginal: string | null, nombreNuevo: string, actividad: Actividad): Database {
  const recetario = { ...db.recetario };
  if (nombreOriginal && nombreOriginal !== nombreNuevo) delete recetario[nombreOriginal];
  recetario[nombreNuevo] = actividad;
  return { ...db, recetario };
}

export function eliminarActividad(db: Database, nombre: string): Database {
  const recetario = { ...db.recetario };
  delete recetario[nombre];
  return { ...db, recetario };
}

export function nuevoMaterialReceta(): RecetaMaterial {
  return { material: '', cantidad: 1, escala: 'Campamento', notas: '', tipoUso: 'Consumible' };
}
