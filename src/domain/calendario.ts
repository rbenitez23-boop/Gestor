/**
 * Calendario de eventos (campamentos, eventos y excursiones).
 *
 * Se guarda en db.json bajo la llave `calendario` — bases de datos creadas
 * antes de esta versión no la traen, por eso todo aquí la trata como
 * opcional y la crea al primer guardado.
 *
 * Reglas de color por cercanía (según la fecha de inicio):
 *   16 días o más → verde · 9 a 15 → amarillo · 8 o menos → rojo
 *   en curso (ya empezó, no ha terminado) → rojo · ya terminó → gris
 */
import type { Database } from '../types';

export type TipoEventoCalendario = 'Campamento' | 'Evento' | 'Excursión';
export const TIPOS_EVENTO_CALENDARIO: TipoEventoCalendario[] = ['Campamento', 'Evento', 'Excursión'];

export interface EventoCalendario {
  id: string;
  nombre: string;
  tipo: TipoEventoCalendario;
  fechaInicio: string; // YYYY-MM-DD
  fechaFin: string; // YYYY-MM-DD (igual a fechaInicio si es de un día)
  notas: string;
  programaRecibido: boolean;
  listaHecha: boolean;
  creado: string; // ISO
}

export type EventoCalendarioInput = Pick<EventoCalendario, 'nombre' | 'tipo' | 'fechaInicio' | 'fechaFin' | 'notas'>;

export type Urgencia = 'verde' | 'amarillo' | 'rojo' | 'pasado';

type DbConCalendario = Database & { calendario?: EventoCalendario[] };

// ── Fechas (siempre en fecha local, sin horas, para no brincar de día por zona horaria) ──

export function fechaLocalISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

/** "2026-10-05" → [2026, 10, 5] */
export function partesFecha(iso: string): [number, number, number] {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number);
  return [y, m, d];
}

function aDiaNumero(iso: string): number {
  const [y, m, d] = partesFecha(iso);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Días que faltan para `fecha` contados desde `hoy` (negativo si ya pasó). */
export function diasEntre(hoy: string, fecha: string): number {
  return aDiaNumero(fecha) - aDiaNumero(hoy);
}

export function urgenciaDe(ev: EventoCalendario, hoy: string = fechaLocalISO()): Urgencia {
  if (diasEntre(hoy, ev.fechaFin || ev.fechaInicio) < 0) return 'pasado';
  const faltan = diasEntre(hoy, ev.fechaInicio);
  if (faltan >= 16) return 'verde';
  if (faltan >= 9) return 'amarillo';
  return 'rojo';
}

/** Texto corto de cuánto falta: "Faltan 12 días", "Mañana", "Hoy", "En curso", "Terminó". */
export function textoFaltante(ev: EventoCalendario, hoy: string = fechaLocalISO()): string {
  if (diasEntre(hoy, ev.fechaFin || ev.fechaInicio) < 0) return 'Terminó';
  const faltan = diasEntre(hoy, ev.fechaInicio);
  if (faltan < 0) return 'En curso';
  if (faltan === 0) return 'Hoy';
  if (faltan === 1) return 'Mañana';
  return `Faltan ${faltan} días`;
}

// ── Lectura ──

export function listarEventos(db: Database): EventoCalendario[] {
  return [...((db as DbConCalendario).calendario || [])].sort(
    (a, b) => a.fechaInicio.localeCompare(b.fechaInicio) || a.nombre.localeCompare(b.nombre, 'es')
  );
}

/** Eventos que tocan el día `fecha` (incluye los de varios días). */
export function eventosDelDia(eventos: EventoCalendario[], fecha: string): EventoCalendario[] {
  return eventos.filter((ev) => ev.fechaInicio <= fecha && fecha <= (ev.fechaFin || ev.fechaInicio));
}

// ── Escritura (devuelven una copia nueva de la base, igual que el resto del dominio) ──

function conCalendario(db: Database, eventos: EventoCalendario[]): Database {
  return { ...db, calendario: eventos } as DbConCalendario;
}

export function validarEvento(input: EventoCalendarioInput): string | null {
  if (!input.nombre.trim()) return 'Escribe el nombre del evento';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fechaInicio)) return 'Elige la fecha de inicio';
  if (input.fechaFin && input.fechaFin < input.fechaInicio) return 'La fecha de fin no puede ser antes del inicio';
  return null;
}

export function agregarEvento(db: Database, input: EventoCalendarioInput, id: string): Database {
  const nuevo: EventoCalendario = {
    id,
    nombre: input.nombre.trim(),
    tipo: input.tipo,
    fechaInicio: input.fechaInicio,
    fechaFin: input.fechaFin || input.fechaInicio,
    notas: input.notas.trim(),
    programaRecibido: false,
    listaHecha: false,
    creado: new Date().toISOString(),
  };
  return conCalendario(db, [...listarEventos(db), nuevo]);
}

export function editarEvento(db: Database, id: string, input: EventoCalendarioInput): Database {
  return conCalendario(
    db,
    listarEventos(db).map((ev) =>
      ev.id === id
        ? {
            ...ev,
            nombre: input.nombre.trim(),
            tipo: input.tipo,
            fechaInicio: input.fechaInicio,
            fechaFin: input.fechaFin || input.fechaInicio,
            notas: input.notas.trim(),
          }
        : ev
    )
  );
}

export function eliminarEvento(db: Database, id: string): Database {
  return conCalendario(
    db,
    listarEventos(db).filter((ev) => ev.id !== id)
  );
}

export type Verificacion = 'programaRecibido' | 'listaHecha';

/** Fija una verificación al valor indicado (no "alterna": así un reintento por conflicto no la invierte dos veces). */
export function fijarVerificacion(db: Database, id: string, campo: Verificacion, valor: boolean): Database {
  return conCalendario(
    db,
    listarEventos(db).map((ev) => (ev.id === id ? { ...ev, [campo]: valor } : ev))
  );
}

export function nuevoIdEvento(): string {
  return `CAL-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}
