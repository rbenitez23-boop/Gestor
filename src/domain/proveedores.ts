import type { Database, Proveedor } from '../types';
import { generarIdSecuencial } from './materiales';

export interface ProveedorInput {
  nombre: string;
  contacto: string;
  queVende: string;
  dondeLink: string;
  costoReferencia: string;
  tiempoEntrega: string;
  notas: string;
}

export function listarProveedoresActivos(db: Database): Proveedor[] {
  return db.proveedores.filter((p) => p.activo !== false);
}

export function agregarProveedor(db: Database, input: ProveedorInput): { db: Database; id: string } {
  const id = generarIdSecuencial(db.proveedores.map((p) => p.id), 'PROV-', 3);
  const nuevo: Proveedor = {
    id,
    nombre: input.nombre,
    contacto: input.contacto || '',
    queVende: input.queVende || '',
    dondeLink: input.dondeLink || '',
    costoReferencia: input.costoReferencia || '',
    tiempoEntrega: input.tiempoEntrega || '',
    notas: input.notas || '',
    activo: true,
    fechaAlta: new Date().toISOString(),
  };
  return { db: { ...db, proveedores: [...db.proveedores, nuevo] }, id };
}

export function editarProveedor(db: Database, id: string, input: ProveedorInput): Database {
  return {
    ...db,
    proveedores: db.proveedores.map((p) =>
      p.id === id
        ? {
            ...p,
            nombre: input.nombre,
            contacto: input.contacto || '',
            queVende: input.queVende || '',
            dondeLink: input.dondeLink || '',
            costoReferencia: input.costoReferencia || '',
            tiempoEntrega: input.tiempoEntrega || '',
            notas: input.notas || '',
          }
        : p
    ),
  };
}

/** Baja lógica — igual que el original: nunca se borra la fila, se marca activo=false para no perder historial. */
export function eliminarProveedor(db: Database, id: string): Database {
  return { ...db, proveedores: db.proveedores.map((p) => (p.id === id ? { ...p, activo: false } : p)) };
}
