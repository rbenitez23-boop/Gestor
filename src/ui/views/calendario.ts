import type { Database } from '../../types';
import { store } from '../../services/store';
import { openModal, closeModal, toast, esc, showLoader, hideLoader } from '../helpers';
import {
  TIPOS_EVENTO_CALENDARIO,
  type EventoCalendario,
  type EventoCalendarioInput,
  type TipoEventoCalendario,
  type Verificacion,
  listarEventos,
  eventosDelDia,
  urgenciaDe,
  textoFaltante,
  fechaLocalISO,
  validarEvento,
  agregarEvento,
  editarEvento,
  eliminarEvento,
  fijarVerificacion,
  nuevoIdEvento,
  partesFecha,
} from '../../domain/calendario';

// El mes visible se conserva entre re-pintados (al guardar se repinta toda la app).
let mesVisible: { y: number; m: number } | null = null;

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const ICONO: Record<TipoEventoCalendario, string> = { Campamento: '🏕️', Evento: '🎉', Excursión: '🚌' };

const ESTILOS = `
  .cal-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:16px}
  .cal-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:14px 16px;border-bottom:1px solid var(--gris)}
  .cal-nav{display:flex;align-items:center;gap:6px}
  .cal-mes{font-size:17px;font-weight:800;min-width:170px;text-align:center}
  .cal-leyenda{display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--gris-med);align-items:center}
  .cal-leyenda i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:4px;vertical-align:-1px}
  .cal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}
  .cal-dow{font-size:11px;font-weight:700;color:var(--gris-med);text-transform:uppercase;letter-spacing:.04em;padding:8px;text-align:center;border-bottom:1px solid var(--gris)}
  .cal-dia{min-height:118px;padding:6px;border-right:1px solid var(--gris);border-bottom:1px solid var(--gris);cursor:pointer;transition:background var(--transition);display:flex;flex-direction:column;gap:4px;min-width:0}
  .cal-dia:nth-child(7n){border-right:none}
  .cal-dia:hover{background:#f6f8fb}
  .cal-dia.fuera{background:#fafbfc}
  .cal-dia.fuera .cal-num{color:#c8cfda}
  .cal-num{font-size:12px;font-weight:700;width:24px;height:24px;display:grid;place-items:center;border-radius:50%;flex-shrink:0}
  .cal-dia.hoy .cal-num{background:var(--azul);color:#fff}
  .cal-chip{border-radius:6px;padding:4px 6px;font-size:11px;line-height:1.3;border-left:3px solid;cursor:pointer;min-width:0}
  .cal-chip-nombre{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .cal-chip.cont{opacity:.7}
  .cal-chip.cont .cal-chip-nombre{font-weight:600}
  .u-verde{background:#eaf6e2;border-color:var(--verde)}
  .u-amarillo{background:#fff6d6;border-color:#E5B800}
  .u-rojo{background:#fde8e7;border-color:var(--rojo)}
  .u-pasado{background:#f0f2f5;border-color:var(--gris-med);color:var(--gris-med)}
  .cal-checks{display:flex;gap:3px;margin-top:4px;flex-wrap:wrap}
  .cal-chk{border:none;border-radius:999px;padding:2px 7px;font-size:10px;font-weight:700;color:#fff;cursor:pointer;line-height:1.5;font-family:inherit;transition:background var(--transition),opacity var(--transition)}
  .cal-chk.no{background:var(--rojo)}
  .cal-chk.si{background:#2E9E44}
  .cal-chk:disabled{opacity:.5;cursor:wait}
  .cal-mas{font-size:10px;color:var(--gris-med);font-weight:700;padding-left:4px}
  .cal-lista-item{display:flex;gap:14px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--gris);flex-wrap:wrap}
  .cal-lista-item:last-child{border-bottom:none}
  .cal-lista-fecha{width:96px;flex-shrink:0;font-size:12px;font-weight:700;color:var(--gris-med)}
  .cal-lista-info{flex:1;min-width:180px;cursor:pointer}
  .cal-badge{font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;border-left:none;white-space:nowrap}
  .cal-lista-item .cal-chk{font-size:11px;padding:5px 11px}
  @media (max-width:760px){
    .cal-dia{min-height:64px;padding:3px}
    .cal-num{font-size:11px;width:20px;height:20px}
    .cal-chip{padding:2px 4px;font-size:9px;border-left-width:2px}
    .cal-dia .cal-checks{display:none}
    .cal-dow{padding:6px 2px;font-size:9px}
    .cal-mes{min-width:0;font-size:15px}
  }`;

function formatoFecha(iso: string): string {
  const [y, m, d] = partesFecha(iso);
  return `${d} ${(MESES[m - 1] || '').slice(0, 3).toLowerCase()} ${y}`;
}

function rangoTexto(ev: EventoCalendario): string {
  return ev.fechaFin && ev.fechaFin !== ev.fechaInicio ? `${formatoFecha(ev.fechaInicio)} → ${formatoFecha(ev.fechaFin)}` : formatoFecha(ev.fechaInicio);
}

function botonesVerificacion(ev: EventoCalendario, largo: boolean): string {
  const prog = largo ? '📋 Programa recibido' : '📋 Programa';
  const lista = largo ? '📦 Lista de materiales hecha' : '📦 Lista';
  return `
    <button class="cal-chk ${ev.programaRecibido ? 'si' : 'no'}" data-chk="programaRecibido" data-id="${esc(ev.id)}" title="Programa recibido: ${ev.programaRecibido ? 'SÍ ✓ (clic para desmarcar)' : 'pendiente (clic para marcar)'}">${prog}</button>
    <button class="cal-chk ${ev.listaHecha ? 'si' : 'no'}" data-chk="listaHecha" data-id="${esc(ev.id)}" title="Lista de materiales: ${ev.listaHecha ? 'HECHA ✓ (clic para desmarcar)' : 'pendiente (clic para marcar)'}">${lista}</button>`;
}

export function renderCalendario(container: HTMLElement, db: Database, onChanged: () => void) {
  const hoy = fechaLocalISO();
  if (!mesVisible) {
    const d = new Date();
    mesVisible = { y: d.getFullYear(), m: d.getMonth() };
  }
  const { y, m } = mesVisible;
  const eventos = listarEventos(db);

  // Cuadrícula: desde el domingo de la semana del día 1 hasta completar la última semana del mes.
  const primero = new Date(y, m, 1);
  const inicioGrid = new Date(y, m, 1 - primero.getDay());
  const diasEnMes = new Date(y, m + 1, 0).getDate();
  const totalCeldas = Math.ceil((primero.getDay() + diasEnMes) / 7) * 7;
  const MAX_POR_DIA = 3;

  const celdas: string[] = [];
  for (let i = 0; i < totalCeldas; i++) {
    const d = new Date(inicioGrid.getFullYear(), inicioGrid.getMonth(), inicioGrid.getDate() + i);
    const iso = fechaLocalISO(d);
    const delDia = eventosDelDia(eventos, iso);
    const esPrimeraCelda = i === 0;
    const chips = delDia
      .slice(0, MAX_POR_DIA)
      .map((ev) => {
        // El nombre completo y los botones van en el día de inicio (o en la primera
        // celda visible, si el evento empezó antes); los demás días se ven como continuación.
        const esInicio = ev.fechaInicio === iso || (esPrimeraCelda && ev.fechaInicio < iso);
        return `<div class="cal-chip u-${urgenciaDe(ev, hoy)} ${esInicio ? '' : 'cont'}" data-editar="${esc(ev.id)}" title="${esc(`${ev.tipo}: ${ev.nombre} · ${rangoTexto(ev)} · ${textoFaltante(ev, hoy)}`)}">
          <div class="cal-chip-nombre">${esInicio ? ICONO[ev.tipo] + ' ' : '↳ '}${esc(ev.nombre)}</div>
          ${esInicio ? `<div class="cal-checks">${botonesVerificacion(ev, false)}</div>` : ''}
        </div>`;
      })
      .join('');
    const extra = delDia.length > MAX_POR_DIA ? `<div class="cal-mas">+${delDia.length - MAX_POR_DIA} más</div>` : '';
    const clases = ['cal-dia', d.getMonth() !== m ? 'fuera' : '', iso === hoy ? 'hoy' : ''].join(' ');
    celdas.push(`<div class="${clases}" data-dia="${iso}" title="Clic para agendar en este día"><div class="cal-num">${d.getDate()}</div>${chips}${extra}</div>`);
  }

  // Lista del mes (con los botones con texto completo; en celular es la forma principal de usarlo).
  const inicioMes = fechaLocalISO(primero);
  const finMes = fechaLocalISO(new Date(y, m, diasEnMes));
  const delMes = eventos.filter((ev) => ev.fechaInicio <= finMes && (ev.fechaFin || ev.fechaInicio) >= inicioMes);
  const pendientes = delMes.filter((ev) => urgenciaDe(ev, hoy) !== 'pasado' && (!ev.programaRecibido || !ev.listaHecha)).length;

  container.innerHTML = `
    <style>${ESTILOS}</style>
    <div class="cal-top">
      <div><h1 style="font-size:22px;font-weight:800">📅 Calendario</h1><p style="color:var(--gris-med);font-size:13px">Campamentos, eventos y excursiones · clic en un día para agendar</p></div>
      <button class="btn btn-primary" id="cal-nuevo">+ Agendar evento</button>
    </div>

    <div class="card" style="margin-bottom:20px;overflow:hidden">
      <div class="cal-bar">
        <div class="cal-nav">
          <button class="btn btn-ghost btn-sm" id="cal-prev" title="Mes anterior">◀</button>
          <div class="cal-mes">${MESES[m]} ${y}</div>
          <button class="btn btn-ghost btn-sm" id="cal-next" title="Mes siguiente">▶</button>
          <button class="btn btn-ghost btn-sm" id="cal-hoy">Hoy</button>
        </div>
        <div class="cal-leyenda">
          <span><i style="background:var(--verde)"></i>16+ días</span>
          <span><i style="background:#E5B800"></i>9 a 15 días</span>
          <span><i style="background:var(--rojo)"></i>8 días o menos</span>
          <span><i style="background:var(--gris-med)"></i>Terminó</span>
          <span style="border-left:1px solid var(--gris);padding-left:12px">Botones: <b style="color:var(--rojo)">rojo</b> pendiente · <b style="color:#2E9E44">verde</b> listo</span>
        </div>
      </div>
      <div class="cal-grid">
        ${DIAS.map((d) => `<div class="cal-dow">${d}</div>`).join('')}
        ${celdas.join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">Eventos de ${MESES[m]}</span>
        ${pendientes ? `<span style="font-size:12px;color:var(--rojo);font-weight:700">${pendientes} con pendientes</span>` : delMes.length ? '<span style="font-size:12px;color:#2E9E44;font-weight:700">Todo al día ✓</span>' : ''}
      </div>
      ${
        delMes.length
          ? delMes
              .map(
                (ev) => `
        <div class="cal-lista-item">
          <div class="cal-lista-fecha">${rangoTexto(ev).replace(' → ', '<br>→ ')}</div>
          <div class="cal-lista-info" data-editar="${esc(ev.id)}" title="Clic para editar">
            <div style="font-weight:800;font-size:14px">${ICONO[ev.tipo]} ${esc(ev.nombre)}</div>
            <div style="font-size:12px;color:var(--gris-med)">${esc(ev.tipo)}${ev.notas ? ' · ' + esc(ev.notas) : ''}</div>
          </div>
          <span class="cal-badge u-${urgenciaDe(ev, hoy)}">${textoFaltante(ev, hoy)}</span>
          <div class="cal-checks" style="margin-top:0">${botonesVerificacion(ev, true)}</div>
        </div>`
              )
              .join('')
          : '<div class="empty-state" style="padding:28px">No hay eventos agendados este mes. Da clic en un día del calendario para agregar uno.</div>'
      }
    </div>`;

  // ── Navegación de meses ──
  const irA = (yy: number, mm: number) => {
    const d = new Date(yy, mm, 1);
    mesVisible = { y: d.getFullYear(), m: d.getMonth() };
    renderCalendario(container, store.current || db, onChanged);
  };
  container.querySelector('#cal-prev')?.addEventListener('click', () => irA(y, m - 1));
  container.querySelector('#cal-next')?.addEventListener('click', () => irA(y, m + 1));
  container.querySelector('#cal-hoy')?.addEventListener('click', () => {
    const d = new Date();
    irA(d.getFullYear(), d.getMonth());
  });

  // ── Agendar / editar ──
  container.querySelector('#cal-nuevo')?.addEventListener('click', () => abrirModalEvento(db, null, hoy, onChanged));
  container.querySelectorAll<HTMLElement>('[data-dia]').forEach((celda) =>
    celda.addEventListener('click', () => abrirModalEvento(db, null, celda.dataset.dia || hoy, onChanged))
  );
  container.querySelectorAll<HTMLElement>('[data-editar]').forEach((el) =>
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const ev = eventos.find((x) => x.id === el.dataset.editar);
      if (ev) abrirModalEvento(db, ev, ev.fechaInicio, onChanged);
    })
  );

  // ── Botones de verificación (rojo → verde) ──
  container.querySelectorAll<HTMLButtonElement>('[data-chk]').forEach((btn) =>
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id || '';
      const campo = btn.dataset.chk as Verificacion;
      const ev = eventos.find((x) => x.id === id);
      if (!ev) return;
      const nuevoValor = !ev[campo];
      // Cambio visual inmediato en todos los botones de ese evento/campo; se confirma al guardar.
      const gemelos = container.querySelectorAll<HTMLButtonElement>(`[data-chk="${campo}"][data-id="${CSS.escape(id)}"]`);
      gemelos.forEach((b) => {
        b.classList.toggle('si', nuevoValor);
        b.classList.toggle('no', !nuevoValor);
        b.disabled = true;
      });
      const etiqueta = campo === 'programaRecibido' ? 'Programa recibido' : 'Lista de materiales hecha';
      try {
        await store.mutate(
          (current) => fijarVerificacion(current, id, campo, nuevoValor),
          `Calendario: ${etiqueta} ${nuevoValor ? '✓' : '✗'} — ${ev.nombre}`
        );
        toast(`${etiqueta}: ${nuevoValor ? 'listo ✓' : 'pendiente'}`, 's');
        onChanged();
      } catch (err) {
        gemelos.forEach((b) => {
          b.classList.toggle('si', !nuevoValor);
          b.classList.toggle('no', nuevoValor);
          b.disabled = false;
        });
        toast('No se pudo guardar: ' + (err as Error).message, 'e');
      }
    })
  );
}

function abrirModalEvento(db: Database, ev: EventoCalendario | null, fecha: string, onChanged: () => void) {
  const body = `
    <div class="fg"><label class="fl">Nombre del evento, campamento o excursión <span>*</span></label>
      <input class="fc" id="ce-nombre" placeholder="Ej. Washington 2°" value="${esc(ev?.nombre || '')}"/></div>
    <div class="fg"><label class="fl">Tipo</label>
      <select class="fc" id="ce-tipo">${TIPOS_EVENTO_CALENDARIO.map((t) => `<option ${(ev?.tipo || 'Campamento') === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="fg"><label class="fl">Fecha de inicio <span>*</span></label><input type="date" class="fc" id="ce-inicio" value="${esc(ev?.fechaInicio || fecha)}"/></div>
      <div class="fg"><label class="fl">Fecha de fin (si dura varios días)</label><input type="date" class="fc" id="ce-fin" value="${esc(ev && ev.fechaFin !== ev.fechaInicio ? ev.fechaFin : '')}"/></div>
    </div>
    <div class="fg"><label class="fl">Notas (opcional)</label><textarea class="fc" id="ce-notas" rows="2" placeholder="Sede, contacto, número de campistas…">${esc(ev?.notas || '')}</textarea></div>`;
  const footer = `
    ${ev ? '<button class="btn btn-ghost" id="ce-eliminar" style="color:var(--rojo);margin-right:auto">Eliminar</button>' : ''}
    <button class="btn btn-ghost" data-close-modal>Cancelar</button>
    <button class="btn btn-primary" id="ce-guardar">${ev ? 'Guardar cambios' : 'Agendar'}</button>`;
  const modal = openModal(ev ? 'Editar evento' : 'Agendar evento', body, footer);
  (modal.querySelector('#ce-nombre') as HTMLInputElement)?.focus();

  modal.querySelector('#ce-guardar')?.addEventListener('click', async () => {
    const input: EventoCalendarioInput = {
      nombre: (modal.querySelector('#ce-nombre') as HTMLInputElement).value,
      tipo: (modal.querySelector('#ce-tipo') as HTMLSelectElement).value as TipoEventoCalendario,
      fechaInicio: (modal.querySelector('#ce-inicio') as HTMLInputElement).value,
      fechaFin: (modal.querySelector('#ce-fin') as HTMLInputElement).value,
      notas: (modal.querySelector('#ce-notas') as HTMLTextAreaElement).value,
    };
    const error = validarEvento(input);
    if (error) {
      toast(error, 'e');
      return;
    }
    showLoader('Guardando en GitHub…');
    try {
      if (ev) {
        await store.mutate((current) => editarEvento(current, ev.id, input), `Calendario: editar ${input.nombre.trim()}`);
      } else {
        const id = nuevoIdEvento();
        await store.mutate((current) => agregarEvento(current, input, id), `Calendario: agendar ${input.nombre.trim()} (${input.fechaInicio})`);
      }
      // Lleva el calendario al mes del evento, por si se agendó en otro mes.
      const [yy, mm] = partesFecha(input.fechaInicio);
      mesVisible = { y: yy, m: mm - 1 };
      toast(ev ? 'Evento actualizado ✓' : 'Evento agendado ✓', 's');
      closeModal();
      onChanged();
    } catch (e) {
      toast('Error: ' + (e as Error).message, 'e');
    } finally {
      hideLoader();
    }
  });

  modal.querySelector('#ce-eliminar')?.addEventListener('click', async () => {
    if (!ev) return;
    if (!confirm(`¿Eliminar "${ev.nombre}" del calendario?`)) return;
    showLoader('Eliminando…');
    try {
      await store.mutate((current) => eliminarEvento(current, ev.id), `Calendario: eliminar ${ev.nombre}`);
      toast('Evento eliminado', 's');
      closeModal();
      onChanged();
    } catch (e) {
      toast('Error: ' + (e as Error).message, 'e');
    } finally {
      hideLoader();
    }
  });
}
