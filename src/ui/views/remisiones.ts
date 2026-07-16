import type { Database, TipoPaquete } from '../../types';
import { crearRemision, eliminarRemision, toggleRemisionCerrada, registrarRegreso, actualizarChecklistItem, type NuevaRemisionInput, type ItemRegreso } from '../../domain/remisiones';
import { store } from '../../services/store';
import { openModal, closeModal, toast, esc, downloadCsv, showLoader, hideLoader } from '../helpers';

export function renderRemisiones(container: HTMLElement, db: Database, onChanged: () => void) {
  drawLista(container, db, onChanged);
}

function drawLista(container: HTMLElement, db: Database, onChanged: () => void) {
  const remisiones = [...db.remisiones].reverse();

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
      <div><h1 style="font-size:22px;font-weight:800">Remisiones</h1><p style="color:var(--gris-med);font-size:13px">Material enviado por evento</p></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" id="btn-export-rem">⬇️ Descargar Excel</button>
        <button class="btn btn-primary" id="btn-new-rem">+ Nueva remisión</button>
      </div>
    </div>
    <div class="card"><div class="tbl-wrap"><table>
      <thead><tr><th>Folio</th><th>Cliente/Evento</th><th>Fecha Salida</th><th>Items</th><th>Estado</th><th></th></tr></thead>
      <tbody>${
        remisiones.length
          ? remisiones
              .map(
                (r) => `<tr>
              <td style="font-weight:700">${r.folio}</td>
              <td>${esc(r.cliente)}${r.evento ? ' — ' + esc(r.evento) : ''}</td>
              <td>${esc(r.fechaSalida)}</td>
              <td>${r.items.length}</td>
              <td><span class="semaforo ${r.cerrada ? 'sem-ok' : 'sem-media'}">${r.cerrada ? 'Cerrada' : 'Activa'}</span></td>
              <td><div style="display:flex;gap:6px">
                <button class="btn btn-primary btn-sm" data-view="${r.folio}">Ver / Imprimir</button>
                <button class="btn btn-ghost btn-sm" data-del="${r.folio}">Eliminar</button>
              </div></td>
            </tr>`
              )
              .join('')
          : '<tr><td colspan="6" class="empty-state">Sin remisiones</td></tr>'
      }</tbody>
    </table></div></div>`;

  container.querySelectorAll<HTMLElement>('[data-view]').forEach((el) =>
    el.addEventListener('click', () => renderRemisionDetalle(container, db, el.dataset.view!, onChanged))
  );
  container.querySelectorAll<HTMLElement>('[data-del]').forEach((el) =>
    el.addEventListener('click', async () => {
      const folio = el.dataset.del!;
      if (!confirm(`¿Eliminar la remisión ${folio}? También se revierten sus movimientos de salida.`)) return;
      showLoader('Eliminando…');
      try {
        await store.mutate((current) => eliminarRemision(current, folio), `Eliminar remisión ${folio}`);
        toast('Remisión eliminada', 's');
        onChanged();
      } catch (e) {
        toast('Error: ' + (e as Error).message, 'e');
      } finally {
        hideLoader();
      }
    })
  );

  container.querySelector('#btn-new-rem')?.addEventListener('click', () => openNuevaRemisionModal(db, onChanged));

  container.querySelector('#btn-export-rem')?.addEventListener('click', () => {
    downloadCsv(
      'remisiones',
      ['Folio', 'Cliente', 'Evento', 'Fecha Salida', 'Fecha Regreso', 'Almacén', 'Sede', 'Responsable', 'Tipo Evento', 'Equipos', 'Campistas', 'Staff', 'Maestros', 'Items', 'Estado', 'Notas'],
      remisiones.map((r) => [r.folio, r.cliente, r.evento, r.fechaSalida, r.fechaRegreso, r.almacen, r.almacenSede, r.responsable, r.tipoEvento, r.numEquipos, r.numCampistas, r.numStaff, r.numMaestros, r.items.length, r.cerrada ? 'Cerrada' : 'Activa', r.notas])
    );
  });
}

// ── MODAL: NUEVA REMISIÓN ────────────────────────────────────────────
let itemCount = 0;

function openNuevaRemisionModal(db: Database, onChanged: () => void) {
  itemCount = 0;
  const almacenOptions = db.almacenes.filter((a) => a.activo !== false).map((a) => `<option value="${esc(a.nombre)}">${esc(a.nombre)}</option>`).join('');

  const body = `
    <div class="frow">
      <div class="fg"><label class="fl">Cliente / Colegio <span>*</span></label><input class="fc" id="rm-cliente"/></div>
      <div class="fg"><label class="fl">Evento</label><input class="fc" id="rm-evento"/></div>
    </div>
    <div class="frow">
      <div class="fg"><label class="fl">Fecha de salida <span>*</span></label><input type="date" class="fc" id="rm-salida" value="${new Date().toISOString().slice(0, 10)}"/></div>
      <div class="fg"><label class="fl">Fecha de regreso esperada</label><input type="date" class="fc" id="rm-regreso"/></div>
    </div>
    <div class="frow">
      <div class="fg"><label class="fl">Almacén de origen</label><select class="fc" id="rm-almacen">${almacenOptions}</select></div>
      <div class="fg"><label class="fl">Responsable</label><input class="fc" id="rm-resp"/></div>
    </div>
    <div class="fg"><label class="fl">Almacén sede (opcional)</label><select class="fc" id="rm-almacen-sede"><option value="">Sin sede fija</option>${almacenOptions}</select></div>
    <div class="fg"><label class="fl">Notas</label><textarea class="fc" id="rm-notas" rows="2"></textarea></div>

    <div class="section-title">Datos del evento</div>
    <div class="frow">
      <div class="fg"><label class="fl">Tipo de evento</label>
        <select class="fc" id="rm-tipo-evento"><option>Campamento</option><option>Excursión</option><option>Evento</option></select>
      </div>
      <div class="fg"><label class="fl">Número de equipos</label><input type="number" class="fc" id="rm-equipos" min="0" placeholder="Ej: 4"/></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
      <div class="fg"><label class="fl">Campistas</label><input type="number" class="fc" id="rm-campistas" min="0" placeholder="Ej: 20"/></div>
      <div class="fg"><label class="fl">Staff</label><input type="number" class="fc" id="rm-staff" min="0" placeholder="Ej: 6"/></div>
      <div class="fg"><label class="fl">Maestros</label><input type="number" class="fc" id="rm-maestros" min="0" placeholder="Ej: 2"/></div>
    </div>
    <div style="margin-top:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-weight:700;font-size:13px">Materiales</span>
        <button class="btn btn-success btn-sm" id="rm-add-item">+ Agregar material</button>
      </div>
      <div id="rm-items-list"></div>
    </div>`;
  const footer = `<button class="btn btn-ghost" data-close-modal>Cancelar</button><button class="btn btn-primary" id="rm-save">Crear remisión</button>`;
  const modal = openModal('Nueva remisión', body, footer);

  const addItemRow = () => {
    const i = itemCount++;
    const matOptions = db.materiales.filter((m) => m.activo !== false).map((m) => `<option value="${m.id}" data-tipo="${m.tipoPaquete}" data-uds="${m.unidadesPaq}">${esc(m.nombre)}</option>`).join('');
    const row = document.createElement('div');
    row.id = `rm-item-${i}`;
    row.style.cssText = 'display:grid;grid-template-columns:2fr 1fr auto;gap:8px;margin-bottom:8px;align-items:end';
    row.innerHTML = `
      <div><label class="fl">Material</label><select class="fc" data-rm-mat>${matOptions}</select></div>
      <div><label class="fl">Cantidad (total que ocupa el evento)</label><input type="number" class="fc" data-rm-cant value="1" min="1"/></div>
      <button class="btn btn-ghost btn-sm" data-remove-item>✕</button>`;
    modal.querySelector('#rm-items-list')!.appendChild(row);
    row.querySelector('[data-remove-item]')?.addEventListener('click', () => row.remove());
  };
  modal.querySelector('#rm-add-item')?.addEventListener('click', addItemRow);
  addItemRow();

  modal.querySelector('#rm-save')?.addEventListener('click', async () => {
    const cliente = (document.getElementById('rm-cliente') as HTMLInputElement).value.trim();
    const fechaSalida = (document.getElementById('rm-salida') as HTMLInputElement).value;
    if (!cliente || !fechaSalida) {
      toast('Cliente y fecha de salida son requeridos', 'e');
      return;
    }
    const items: NuevaRemisionInput['items'] = [];
    modal.querySelectorAll('[id^="rm-item-"]').forEach((row) => {
      const sel = row.querySelector('[data-rm-mat]') as HTMLSelectElement;
      const cantInput = row.querySelector('[data-rm-cant]') as HTMLInputElement;
      const opt = sel.selectedOptions[0];
      if (!opt) return;
      const uds = Number(opt.dataset.uds) || 1;
      const totalUnidades = Number(cantInput.value) || 0;
      if (totalUnidades <= 0) return;
      items.push({
        materialId: opt.value,
        materialNombre: opt.textContent || '',
        tipoPaquete: (opt.dataset.tipo || 'Pieza Única') as TipoPaquete,
        cantPaquetes: Math.ceil(totalUnidades / uds),
        unidadesPaq: uds,
        totalUnidades,
      });
    });
    if (!items.length) {
      toast('Agrega al menos un material', 'e');
      return;
    }

    showLoader('Guardando en GitHub…');
    try {
      let folioCreado = '';
      await store.mutate((current) => {
        const { db: next, folio } = crearRemision(current, {
          cliente,
          evento: (document.getElementById('rm-evento') as HTMLInputElement).value,
          fechaSalida,
          fechaRegreso: (document.getElementById('rm-regreso') as HTMLInputElement).value,
          almacen: (document.getElementById('rm-almacen') as HTMLSelectElement).value,
          almacenSede: (document.getElementById('rm-almacen-sede') as HTMLSelectElement).value,
          responsable: (document.getElementById('rm-resp') as HTMLInputElement).value,
          notas: (document.getElementById('rm-notas') as HTMLTextAreaElement).value,
          tipoEvento: (document.getElementById('rm-tipo-evento') as HTMLSelectElement).value,
          numEquipos: Number((document.getElementById('rm-equipos') as HTMLInputElement).value) || '',
          numCampistas: Number((document.getElementById('rm-campistas') as HTMLInputElement).value) || '',
          numStaff: Number((document.getElementById('rm-staff') as HTMLInputElement).value) || '',
          numMaestros: Number((document.getElementById('rm-maestros') as HTMLInputElement).value) || '',
          items,
        });
        folioCreado = folio;
        return next;
      }, `Nueva remisión: ${cliente}`);
      toast(`Remisión ${folioCreado} creada ✓`, 's');
      closeModal();
      onChanged();
    } catch (e) {
      toast('Error: ' + (e as Error).message, 'e');
    } finally {
      hideLoader();
    }
  });
}

// ── VISTA: DOCUMENTO COMPLETO DE LA REMISIÓN (ver / imprimir) ────────
function renderRemisionDetalle(container: HTMLElement, db: Database, folio: string, onChanged: () => void) {
  const rem = db.remisiones.find((r) => r.folio === folio);
  if (!rem) return;

  const totalOcupa = rem.items.reduce((s, it) => s + it.totalUnidades, 0);
  const totalEnvia = rem.items.reduce((s, it) => s + (it.cantidadEnviar ?? it.totalUnidades), 0);
  const logo = db.uiConfig?.logoDataUrl || '';
  const disabled = rem.cerrada ? 'disabled' : '';

  container.innerHTML = `
    <div class="no-print" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <button class="btn btn-ghost btn-sm" id="rd-volver">← Volver</button>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${!rem.cerrada ? `<button class="btn btn-success" id="rd-regreso">Registrar regreso</button>` : ''}
        <button class="btn btn-ghost" id="rd-toggle">${rem.cerrada ? '🔓 Reabrir' : '🔒 Cerrar'}</button>
        <button class="btn btn-orange" id="rd-print">🖨️ Imprimir / Descargar PDF</button>
      </div>
    </div>

    <div class="print-doc" id="rd-doc">
      <div class="print-header">
        <div style="display:flex;align-items:center;gap:12px">
          <div class="print-logo">${logo ? `<img src="${logo}"/>` : '🏕️'}</div>
          <div><div class="print-empresa">Peña Grande</div><div class="print-sub">Lista de Inventario</div></div>
        </div>
        <div style="text-align:right;font-size:12px;color:var(--gris-med)">
          <div>Folio: <strong style="color:var(--texto)">${rem.folio}</strong></div>
          <div>Fecha: <strong style="color:var(--texto)">${new Date().toLocaleDateString('es-MX')}</strong></div>
        </div>
      </div>

      <div class="print-info-grid">
        <div><div class="print-label">Cliente</div><div class="print-val">${esc(rem.cliente)}</div></div>
        <div><div class="print-label">Evento</div><div class="print-val">${esc(rem.evento || '—')}</div></div>
        <div><div class="print-label">Fecha Salida</div><div class="print-val">${esc(rem.fechaSalida)}</div></div>
        <div><div class="print-label">Almacén Origen</div><div class="print-val">${esc(rem.almacen)}</div></div>
        <div><div class="print-label">Sede / Rancho</div><div class="print-val">${esc(rem.almacenSede || '—')}</div></div>
        <div><div class="print-label">Responsable</div><div class="print-val">${esc(rem.responsable || '—')}</div></div>
      </div>

      <div class="print-info-grid" style="grid-template-columns:repeat(5,1fr)">
        <div><div class="print-label">Tipo</div><div class="print-val" style="font-size:12px">${esc(rem.tipoEvento || '—')}</div></div>
        <div><div class="print-label">Equipos</div><div class="print-val" style="font-size:12px">${rem.numEquipos || '—'}</div></div>
        <div><div class="print-label">Campistas</div><div class="print-val" style="font-size:12px">${rem.numCampistas || '—'}</div></div>
        <div><div class="print-label">Staff</div><div class="print-val" style="font-size:12px">${rem.numStaff || '—'}</div></div>
        <div><div class="print-label">Maestros</div><div class="print-val" style="font-size:12px">${rem.numMaestros || '—'}</div></div>
      </div>

      <div class="tbl-wrap">
      <table class="print-table">
        <thead><tr>
          <th>#</th><th class="no-print">Salida ✓</th><th class="no-print">Regreso ✓</th>
          <th>Material</th><th>Se envía</th>${rem.almacenSede ? '<th>Ya en sede</th>' : ''}<th>Total</th><th>Núm. Serie</th>
        </tr></thead>
        <tbody>${rem.items
          .map(
            (it, i) => `<tr>
            <td>${i + 1}</td>
            <td class="no-print" style="text-align:center"><input type="checkbox" data-check="checkSalida" data-idx="${i}" ${it.checkSalida ? 'checked' : ''} ${disabled}/></td>
            <td class="no-print" style="text-align:center"><input type="checkbox" data-check="checkRegreso" data-idx="${i}" ${it.checkRegreso ? 'checked' : ''} ${disabled}/></td>
            <td style="font-weight:700">${esc(it.materialNombre)}</td>
            <td style="font-weight:700;color:var(--azul)">${it.cantidadEnviar ?? it.totalUnidades}</td>
            ${rem.almacenSede ? `<td>${it.stockEnDestino || 0}</td>` : ''}
            <td>${it.totalUnidades}</td>
            <td style="font-size:11px">${esc(it.numSeries || '—')}</td>
          </tr>`
          )
          .join('')}</tbody>
      </table>
      </div>
      <div style="text-align:right;font-size:12px;color:var(--gris-med);margin-bottom:20px">
        Se envían ${totalEnvia} de ${totalOcupa} unidades que ocupa el evento
      </div>

      ${rem.notas ? `<div class="print-notas"><div class="print-label">Observaciones</div><div style="font-size:13px;white-space:pre-wrap">${esc(rem.notas)}</div></div>` : ''}

      <div class="print-clausula">
        <div class="print-label" style="color:var(--texto)">Cláusula de Aceptación de Responsabilidad</div>
        <div style="font-size:11px;line-height:1.5;color:var(--gris-med);text-align:justify">
          Al firmar esta Remisión, el staff responsable declara: (1) haber recibido el material descrito en perfectas condiciones,
          (2) aceptar la responsabilidad total sobre dicho material durante el período de préstamo, y (3) comprometerse a
          devolver cada artículo completo, limpio y en el mismo estado en que fue recibido. En caso de pérdida, daño o robo
          imputable a negligencia, el firmante asume la responsabilidad administrativa y/o económica que determine la
          coordinación general.
        </div>
      </div>

      <div class="print-firmas">
        <div class="print-firma-box"><div class="print-firma-titulo">Quien entrega:</div><div class="print-firma-linea"></div><div class="print-firma-nota">— ${esc(rem.responsable || 'Peña Grande')} —</div></div>
        <div class="print-firma-box"><div class="print-firma-titulo">Quien recibe:</div><div class="print-firma-linea"></div><div class="print-firma-nota">— ${esc(rem.cliente)} —</div></div>
      </div>

      <div class="print-evaluacion">
        <div class="print-eval-titulo">Evaluación del Material — a llenar por el director/encargado al regresar</div>
        <div class="print-eval-preg"><span>¿Recibí mi material en tiempo y forma?</span><span>☐ Sí</span><span>☐ No</span></div>
        <div class="print-eval-preg"><span>¿Me saltó material?</span><span>☐ Sí</span><span>☐ No</span></div>
        <div class="print-eval-preg"><span>¿Qué me faltó?</span><span class="print-eval-linea"></span></div>
        <div class="print-eval-preg"><span>¿Cómo evaluarías tu material en el campamento?</span><span>☐ Mal</span><span>☐ Regular</span><span>☐ Bien</span><span>☐ Excelente</span></div>
      </div>
    </div>`;

  container.querySelector('#rd-volver')?.addEventListener('click', () => drawLista(container, db, onChanged));
  container.querySelector('#rd-print')?.addEventListener('click', () => window.print());

  container.querySelectorAll<HTMLInputElement>('[data-check]').forEach((chk) => {
    chk.addEventListener('change', async () => {
      const idx = Number(chk.dataset.idx);
      const campo = chk.dataset.check as 'checkSalida' | 'checkRegreso';
      try {
        await store.mutate((current) => actualizarChecklistItem(current, folio, idx, campo, chk.checked), `Checklist ${folio} item ${idx}`);
      } catch (e) {
        toast('Error guardando checklist: ' + (e as Error).message, 'e');
        chk.checked = !chk.checked;
      }
    });
  });

  container.querySelector('#rd-toggle')?.addEventListener('click', async () => {
    showLoader();
    try {
      await store.mutate((current) => toggleRemisionCerrada(current, folio, !rem.cerrada), `${rem.cerrada ? 'Reabrir' : 'Cerrar'} remisión ${folio}`);
      toast('Actualizado ✓', 's');
      onChanged();
    } catch (e) {
      toast('Error: ' + (e as Error).message, 'e');
    } finally {
      hideLoader();
    }
  });

  container.querySelector('#rd-regreso')?.addEventListener('click', () => openRegresoModal(rem.folio, db, onChanged));
}

// ── MODAL: REGISTRAR REGRESO ─────────────────────────────────────────
function openRegresoModal(folio: string, db: Database, onChanged: () => void) {
  const rem = db.remisiones.find((r) => r.folio === folio);
  if (!rem) return;

  const body = `
    <div style="font-size:12px;color:var(--gris-med);margin-bottom:12px">Indica cuánto regresa de cada material. Pon 0 si se consumió por completo.</div>
    <div id="reg-items">${rem.items
      .map((it, i) => {
        const salieron = it.cantidadEnviar ?? it.totalUnidades;
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--gris)">
          <div><div style="font-weight:700;font-size:13px">${esc(it.materialNombre)}</div><div style="font-size:11px;color:var(--gris-med)">Salieron: ${salieron}</div></div>
          <input type="number" class="fc" style="width:80px" id="reg-cant-${i}" value="${salieron}" min="0" max="${salieron}"/>
        </div>`;
      })
      .join('')}</div>
    <div class="frow" style="margin-top:12px">
      <div class="fg"><label class="fl">Responsable del regreso</label><input class="fc" id="reg-resp" value="${esc(rem.responsable)}"/></div>
      <div class="fg"><label class="fl">Notas</label><input class="fc" id="reg-notas"/></div>
    </div>`;
  const footer = `<button class="btn btn-ghost" data-close-modal>Cancelar</button><button class="btn btn-success" id="reg-save">Confirmar regreso y cerrar</button>`;
  const modal = openModal(`Registrar regreso — ${folio}`, body, footer);

  modal.querySelector('#reg-save')?.addEventListener('click', async () => {
    const items: ItemRegreso[] = rem.items.map((it, i) => ({
      materialId: it.materialId,
      materialNombre: it.materialNombre,
      tipoPaquete: it.tipoPaquete,
      unidadesPaq: it.unidadesPaq,
      cantidadRegresa: Number((document.getElementById(`reg-cant-${i}`) as HTMLInputElement).value) || 0,
    }));
    const responsable = (document.getElementById('reg-resp') as HTMLInputElement).value;
    const notas = (document.getElementById('reg-notas') as HTMLInputElement).value;

    showLoader('Guardando en GitHub…');
    try {
      await store.mutate((current) => registrarRegreso(current, folio, items, responsable, notas), `Regreso remisión ${folio}`);
      toast('Regreso registrado ✓', 's');
      closeModal();
      onChanged();
    } catch (e) {
      toast('Error: ' + (e as Error).message, 'e');
    } finally {
      hideLoader();
    }
  });
}
