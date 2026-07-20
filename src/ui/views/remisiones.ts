import type { Database, TipoPaquete, Remision } from '../../types';
import { crearRemision, eliminarRemision, toggleRemisionCerrada, registrarRegreso, actualizarChecklistItem, registrarSalidaEscaneada, registrarRegresoEscaneado, editarRemision, type NuevaRemisionInput, type ItemRegreso } from '../../domain/remisiones';
import { resolverCodigoEscaneado } from '../../domain/scanner';
import { store } from '../../services/store';
import { iniciarCamaraQr, type SesionCamara } from '../../services/qrCamera';
import { generarQrDataUrl } from '../../services/qr';
import { openModal, closeModal, toast, esc, downloadCsv, showLoader, hideLoader } from '../helpers';

let sesionEscaneoRem: SesionCamara | null = null;

/** Apaga la cámara del escaneo dentro de una remisión — se llama al navegar fuera de esta pantalla. */
export function detenerEscaneoRemision() {
  sesionEscaneoRem?.detener();
  sesionEscaneoRem = null;
}

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
      <div class="fg"><label class="fl">Fecha de regreso (aproximada)</label><input type="date" class="fc" id="rm-regreso"/></div>
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
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:10px;flex-wrap:wrap">
        <span style="font-weight:700;font-size:13px">Materiales</span>
        <div style="display:flex;gap:8px;align-items:center;flex:1;min-width:180px">
          <input class="fc" id="rm-buscar-item" placeholder="🔍 Buscar en lo ya agregado…" style="flex:1"/>
          <button class="btn btn-success btn-sm" id="rm-add-item">+ Agregar material</button>
        </div>
      </div>
      <div id="rm-items-list"></div>
    </div>`;
  const footer = `<button class="btn btn-ghost" data-close-modal>Cancelar</button><button class="btn btn-primary" id="rm-save">Crear remisión</button>`;
  const modal = openModal('Nueva remisión', body, footer);

  const marcarDuplicados = () => {
    const selects = Array.from(modal.querySelectorAll('[data-rm-mat]')) as HTMLSelectElement[];
    const conteo = new Map<string, number>();
    selects.forEach((s) => conteo.set(s.value, (conteo.get(s.value) || 0) + 1));
    selects.forEach((s) => {
      s.style.borderColor = s.value && (conteo.get(s.value) || 0) > 1 ? 'var(--rojo)' : '';
      s.title = s.value && (conteo.get(s.value) || 0) > 1 ? 'Este material ya está agregado en otra fila' : '';
    });
  };

  const addItemRow = () => {
    const i = itemCount++;
    const matOptions = db.materiales.filter((m) => m.activo !== false).map((m) => `<option value="${m.id}" data-tipo="${m.tipoPaquete}" data-uds="${m.unidadesPaq}" data-serie="${m.tieneNumSerie ? '1' : '0'}">${esc(m.nombre)}</option>`).join('');
    const row = document.createElement('div');
    row.id = `rm-item-${i}`;
    row.style.cssText = 'margin-bottom:8px;';
    row.innerHTML = `
      <div style="display:grid;grid-template-columns:2fr 1fr auto;gap:8px;align-items:end">
        <div><label class="fl">Material</label><select class="fc" data-rm-mat><option value="">— Selecciona un material —</option>${matOptions}</select></div>
        <div><label class="fl">Cantidad (total que ocupa el evento)</label><input type="number" class="fc" data-rm-cant value="1" min="1"/></div>
        <button class="btn btn-ghost btn-sm" data-remove-item>✕</button>
      </div>
      <div data-rm-serie-wrap style="display:none;margin-top:6px">
        <label class="fl">Número(s) de serie / distintivo que se manda (ej. "Botiquín #3", o varios separados por coma)</label>
        <input class="fc" data-rm-serie placeholder="Ej. #3, #4"/>
      </div>`;
    modal.querySelector('#rm-items-list')!.prepend(row);
    row.querySelector('[data-remove-item]')?.addEventListener('click', () => {
      row.remove();
      marcarDuplicados();
    });
    const sel = row.querySelector('[data-rm-mat]') as HTMLSelectElement;
    const serieWrap = row.querySelector('[data-rm-serie-wrap]') as HTMLElement;
    sel.addEventListener('change', () => {
      marcarDuplicados();
      serieWrap.style.display = sel.selectedOptions[0]?.dataset.serie === '1' ? '' : 'none';
    });
  };
  modal.querySelector('#rm-add-item')?.addEventListener('click', addItemRow);
  modal.querySelector('#rm-buscar-item')?.addEventListener('input', (e) => {
    const q = (e.target as HTMLInputElement).value.toLowerCase();
    modal.querySelectorAll<HTMLElement>('[id^="rm-item-"]').forEach((row) => {
      const sel = row.querySelector('[data-rm-mat]') as HTMLSelectElement;

      const nombre = (sel.selectedOptions[0]?.textContent || '').toLowerCase();
      row.style.display = !q || nombre.includes(q) ? '' : 'none';
    });
  });
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
      const serieInput = row.querySelector('[data-rm-serie]') as HTMLInputElement | null;
      const opt = sel.selectedOptions[0];
      if (!opt || !opt.value) return;
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
        numSeries: serieInput?.value.trim() || '',
      });
    });
    if (!items.length) {
      toast('Agrega al menos un material', 'e');
      return;
    }
    items.sort((a, b) => a.materialNombre.localeCompare(b.materialNombre, 'es'));

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

  // Refresca quedándose en ESTA misma remisión (en vez de onChanged(), que
  // regresa a la lista de todas) — usado por las acciones que se hacen
  // desde dentro del detalle (editar, cerrar, escanear, registrar
  // regreso), para no perder el lugar donde estabas trabajando.
  const refrescarDetalle = () => renderRemisionDetalle(container, store.current!, folio, onChanged);

  const totalOcupa = rem.items.reduce((s, it) => s + it.totalUnidades, 0);
  const totalEnvia = rem.items.reduce((s, it) => s + (it.cantidadEnviar ?? it.totalUnidades), 0);
  const logo = db.uiConfig?.logoDataUrl || '';
  const disabled = rem.cerrada ? 'disabled' : '';

  container.innerHTML = `
    <div class="no-print" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <button class="btn btn-ghost btn-sm" id="rd-volver">← Volver</button>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${!rem.cerrada ? `<button class="btn btn-primary" id="rd-scan-salida">📷 Escanear salida</button>` : ''}
        ${!rem.cerrada ? `<button class="btn btn-success" id="rd-scan-regreso">📷 Escanear regreso</button>` : ''}
        ${!rem.cerrada ? `<button class="btn btn-success" id="rd-regreso">Registrar regreso (manual)</button>` : ''}
        ${!rem.cerrada ? `<button class="btn btn-ghost" id="rd-editar">✏️ Editar</button>` : ''}
        <button class="btn btn-ghost" id="rd-etiquetas">🏷️ Etiquetas de esta remisión</button>
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
        <div><div class="print-label">Fecha Regreso (aprox.)</div><div class="print-val">${esc(rem.fechaRegreso || '—')}</div></div>
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
      refrescarDetalle();
    } catch (e) {
      toast('Error: ' + (e as Error).message, 'e');
    } finally {
      hideLoader();
    }
  });

  container.querySelector('#rd-regreso')?.addEventListener('click', () => openRegresoModal(rem.folio, db, refrescarDetalle));
  container.querySelector('#rd-editar')?.addEventListener('click', () => openEditarRemisionModal(rem.folio, db, refrescarDetalle));
  container.querySelector('#rd-etiquetas')?.addEventListener('click', () => renderEtiquetasDeRemision(container, db, rem, onChanged));
  container.querySelector('#rd-scan-salida')?.addEventListener('click', () => openEscaneoSalidaModal(rem.folio, db, refrescarDetalle));
  container.querySelector('#rd-scan-regreso')?.addEventListener('click', () => openEscaneoRegresoModal(rem.folio, db, refrescarDetalle));
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

// ── EDITAR REMISIÓN ACTIVA (materiales, cantidades, datos del evento) ──
function openEditarRemisionModal(folio: string, db: Database, onChanged: () => void) {
  const rem = db.remisiones.find((r) => r.folio === folio)!;
  itemCount = 0;
  const almacenOptions = db.almacenes.filter((a) => a.activo !== false).map((a) => `<option value="${esc(a.nombre)}">${esc(a.nombre)}</option>`).join('');

  const body = `
    <div class="card" style="padding:10px 14px;margin-bottom:14px;font-size:12px;background:var(--blanco)">✏️ Estás editando <b>${esc(folio)}</b> — al guardar, se recalculan los movimientos de salida con las cantidades nuevas y se reinicia el checklist de empacado.</div>
    <div class="frow">
      <div class="fg"><label class="fl">Cliente / Colegio <span>*</span></label><input class="fc" id="rm-cliente" value="${esc(rem.cliente)}"/></div>
      <div class="fg"><label class="fl">Evento</label><input class="fc" id="rm-evento" value="${esc(rem.evento)}"/></div>
    </div>
    <div class="frow">
      <div class="fg"><label class="fl">Fecha de salida <span>*</span></label><input type="date" class="fc" id="rm-salida" value="${esc(rem.fechaSalida)}"/></div>
      <div class="fg"><label class="fl">Fecha de regreso (aproximada)</label><input type="date" class="fc" id="rm-regreso" value="${esc(rem.fechaRegreso)}"/></div>
    </div>
    <div class="frow">
      <div class="fg"><label class="fl">Almacén de origen</label><select class="fc" id="rm-almacen">${almacenOptions}</select></div>
      <div class="fg"><label class="fl">Responsable</label><input class="fc" id="rm-resp" value="${esc(rem.responsable)}"/></div>
    </div>
    <div class="frow">
      <div class="fg"><label class="fl">Almacén sede (opcional)</label><select class="fc" id="rm-almacen-sede"><option value="">Sin sede fija</option>${almacenOptions}</select></div>
    </div>
    <div class="fg"><label class="fl">Notas</label><textarea class="fc" id="rm-notas" rows="2">${esc(rem.notas)}</textarea></div>

    <div class="section-title">Datos del evento</div>
    <div class="frow">
      <div class="fg"><label class="fl">Tipo de evento</label>
        <select class="fc" id="rm-tipo-evento"><option>Campamento</option><option>Excursión</option><option>Evento</option></select>
      </div>
      <div class="fg"><label class="fl">Número de equipos</label><input type="number" class="fc" id="rm-equipos" min="0" value="${rem.numEquipos || ''}"/></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
      <div class="fg"><label class="fl">Campistas</label><input type="number" class="fc" id="rm-campistas" min="0" value="${rem.numCampistas || ''}"/></div>
      <div class="fg"><label class="fl">Staff</label><input type="number" class="fc" id="rm-staff" min="0" value="${rem.numStaff || ''}"/></div>
      <div class="fg"><label class="fl">Maestros</label><input type="number" class="fc" id="rm-maestros" min="0" value="${rem.numMaestros || ''}"/></div>
    </div>
    <div style="margin-top:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:10px;flex-wrap:wrap">
        <span style="font-weight:700;font-size:13px">Materiales</span>
        <div style="display:flex;gap:8px;align-items:center;flex:1;min-width:180px">
          <input class="fc" id="rm-buscar-item" placeholder="🔍 Buscar en lo ya agregado…" style="flex:1"/>
          <button class="btn btn-success btn-sm" id="rm-add-item">+ Agregar material</button>
        </div>
      </div>
      <div id="rm-items-list"></div>
    </div>`;
  const footer = `<button class="btn btn-ghost" data-close-modal>Cancelar</button><button class="btn btn-primary" id="rm-save">Guardar cambios</button>`;
  const modal = openModal(`Editar remisión ${folio}`, body, footer);

  (modal.querySelector('#rm-tipo-evento') as HTMLSelectElement).value = rem.tipoEvento || 'Campamento';
  (modal.querySelector('#rm-almacen') as HTMLSelectElement).value = rem.almacen || '';
  (modal.querySelector('#rm-almacen-sede') as HTMLSelectElement).value = rem.almacenSede || '';

  const marcarDuplicados = () => {
    const selects = Array.from(modal.querySelectorAll('[data-rm-mat]')) as HTMLSelectElement[];
    const conteo = new Map<string, number>();
    selects.forEach((s) => conteo.set(s.value, (conteo.get(s.value) || 0) + 1));
    selects.forEach((s) => {
      s.style.borderColor = s.value && (conteo.get(s.value) || 0) > 1 ? 'var(--rojo)' : '';
      s.title = s.value && (conteo.get(s.value) || 0) > 1 ? 'Este material ya está agregado en otra fila' : '';
    });
  };

  const addItemRow = (materialId = '', cantidad = 1, numSerieExistente = '') => {
    const i = itemCount++;
    const placeholder = materialId ? '' : '<option value="">— Selecciona un material —</option>';
    const matOptions = db.materiales
      .filter((m) => m.activo !== false)
      .map((m) => `<option value="${m.id}" data-tipo="${m.tipoPaquete}" data-uds="${m.unidadesPaq}" data-serie="${m.tieneNumSerie ? '1' : '0'}" ${m.id === materialId ? 'selected' : ''}>${esc(m.nombre)}</option>`)
      .join('');
    const materialSeleccionado = db.materiales.find((m) => m.id === materialId);
    const mostrarSerie = materialSeleccionado?.tieneNumSerie ? '' : 'display:none';
    const row = document.createElement('div');
    row.id = `rm-item-${i}`;
    row.style.cssText = 'margin-bottom:8px;';
    row.innerHTML = `
      <div style="display:grid;grid-template-columns:2fr 1fr auto;gap:8px;align-items:end">
        <div><label class="fl">Material</label><select class="fc" data-rm-mat>${placeholder}${matOptions}</select></div>
        <div><label class="fl">Cantidad (total que ocupa el evento)</label><input type="number" class="fc" data-rm-cant value="${cantidad}" min="1"/></div>
        <button class="btn btn-ghost btn-sm" data-remove-item>✕</button>
      </div>
      <div data-rm-serie-wrap style="margin-top:6px;${mostrarSerie}">
        <label class="fl">Número(s) de serie / distintivo que se manda</label>
        <input class="fc" data-rm-serie placeholder="Ej. #3, #4" value="${esc(numSerieExistente)}"/>
      </div>`;
    modal.querySelector('#rm-items-list')!.prepend(row);
    row.querySelector('[data-remove-item]')?.addEventListener('click', () => {
      row.remove();
      marcarDuplicados();
    });
    const sel = row.querySelector('[data-rm-mat]') as HTMLSelectElement;
    const serieWrap = row.querySelector('[data-rm-serie-wrap]') as HTMLElement;
    sel.addEventListener('change', () => {
      marcarDuplicados();
      serieWrap.style.display = sel.selectedOptions[0]?.dataset.serie === '1' ? '' : 'none';
    });
  };
  modal.querySelector('#rm-add-item')?.addEventListener('click', () => addItemRow());
  modal.querySelector('#rm-buscar-item')?.addEventListener('input', (e) => {
    const q = (e.target as HTMLInputElement).value.toLowerCase();
    modal.querySelectorAll<HTMLElement>('[id^="rm-item-"]').forEach((row) => {
      const sel = row.querySelector('[data-rm-mat]') as HTMLSelectElement;
      const nombre = (sel.selectedOptions[0]?.textContent || '').toLowerCase();
      row.style.display = !q || nombre.includes(q) ? '' : 'none';
    });
  });
  if (rem.items.length) [...rem.items].reverse().forEach((it) => addItemRow(it.materialId, it.totalUnidades, it.numSeries || ''));
  else addItemRow();
  marcarDuplicados();

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
      const serieInput = row.querySelector('[data-rm-serie]') as HTMLInputElement | null;
      const opt = sel.selectedOptions[0];
      if (!opt || !opt.value) return;
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
        numSeries: serieInput?.value.trim() || '',
      });
    });
    items.sort((a, b) => a.materialNombre.localeCompare(b.materialNombre, 'es'));

    showLoader('Guardando en GitHub…');
    try {
      await store.mutate(
        (current) =>
          editarRemision(current, folio, {
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
          }),
        `Editar remisión ${folio}`
      );
      toast('Remisión actualizada ✓', 's');
      closeModal();
      onChanged();
    } catch (e) {
      toast('Error: ' + (e as Error).message, 'e');
    } finally {
      hideLoader();
    }
  });
}

// ── ESCANEO DE SALIDA (empacar) ──────────────────────────────────────
function openEscaneoSalidaModal(folio: string, db: Database, onChanged: () => void) {
  const rem = db.remisiones.find((r) => r.folio === folio)!;
  const body = `
    <div style="position:relative;border-radius:var(--radius-sm);overflow:hidden;background:#000;aspect-ratio:1/1;max-width:320px;margin:0 auto">
      <video id="es-video" playsinline muted style="width:100%;height:100%;object-fit:cover;display:block"></video>
      <div style="position:absolute;inset:0;border:3px solid rgba(255,255,255,.5);border-radius:var(--radius-sm);pointer-events:none;box-shadow:inset 0 0 0 30px rgba(0,0,0,.25)"></div>
    </div>
    <div id="es-status" style="text-align:center;font-size:13px;font-weight:700;margin-top:10px">Empacados: ${rem.items.filter((it) => it.checkSalida).length} / ${rem.items.length}</div>
    <div id="es-form"></div>
    <div id="es-lista" style="margin-top:12px;max-height:180px;overflow-y:auto"></div>`;
  const footer = `<button class="btn btn-primary" data-close-modal>Listo</button>`;
  const modal = openModal('Escanear salida — ' + folio, body, footer);

  const pintarLista = (remActual: typeof rem) => {
    modal.querySelector('#es-lista')!.innerHTML = remActual.items
      .map((it) => `<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:12px;border-bottom:1px solid var(--gris)"><span>${it.checkSalida ? '✅' : '⬜'} ${esc(it.materialNombre)}</span>${it.checkSalida ? `<span style="color:var(--gris-med)">${it.cantidadEnviar ?? it.totalUnidades}</span>` : ''}</div>`)
      .join('');
  };
  pintarLista(rem);

  const video = modal.querySelector('#es-video') as HTMLVideoElement;
  const statusEl = modal.querySelector('#es-status') as HTMLElement;
  const formEl = modal.querySelector('#es-form') as HTMLElement;

  iniciarCamaraQr(video, (codigo) => {
    const material = resolverCodigoEscaneado(db, codigo);
    if (!material) return;
    const remActual = store.current!.remisiones.find((r) => r.folio === folio)!;
    const item = remActual.items.find((it) => it.materialId === material.id);
    if (!item) return;
    sesionEscaneoRem?.pausar(true);
    const planeado = item.cantidadEnviar ?? item.totalUnidades;

    formEl.innerHTML = `
      <div class="card" style="padding:12px;margin-top:10px">
        <div style="font-weight:700;margin-bottom:8px">${esc(item.materialNombre)} — la remisión pedía ${planeado}</div>
        <div class="fg"><label class="fl">Cantidad real que se manda</label><input type="number" class="fc" id="es-cant" value="${planeado}" min="0"/></div>
        <button class="btn btn-success" id="es-confirmar" style="width:100%">✅ Confirmar y seguir escaneando</button>
      </div>`;

    formEl.querySelector('#es-confirmar')?.addEventListener('click', async () => {
      const cant = Number((formEl.querySelector('#es-cant') as HTMLInputElement).value) || 0;
      showLoader('Guardando…');
      try {
        await store.mutate((current) => registrarSalidaEscaneada(current, folio, material.id, cant).db, `Escanear salida: ${material.nombre}`);
        const remNueva = store.current!.remisiones.find((r) => r.folio === folio)!;
        const marcados = remNueva.items.filter((it) => it.checkSalida).length;
        statusEl.textContent = `Empacados: ${marcados} / ${remNueva.items.length}`;
        pintarLista(remNueva);
        formEl.innerHTML = '';
        toast(cant === planeado ? `✓ ${material.nombre} empacado` : `✓ ${material.nombre} ajustado a ${cant}`, 's');
        sesionEscaneoRem?.pausar(false);
      } catch (e) {
        toast('Error: ' + (e as Error).message, 'e');
        sesionEscaneoRem?.pausar(false);
      } finally {
        hideLoader();
      }
    });
  })
    .then((sesion) => {
      sesionEscaneoRem = sesion;
    })
    .catch((e: Error) => {
      statusEl.innerHTML = `<span style="color:var(--rojo)">No se pudo acceder a la cámara: ${esc(e.message)}</span>`;
    });

  const observer = new MutationObserver(() => {
    if (!document.body.contains(modal)) {
      detenerEscaneoRemision();
      onChanged();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true });
}

// ── ESCANEO DE REGRESO (con estado por pieza) ────────────────────────
function openEscaneoRegresoModal(folio: string, db: Database, onChanged: () => void) {
  const rem = db.remisiones.find((r) => r.folio === folio)!;
  const body = `
    <div style="position:relative;border-radius:var(--radius-sm);overflow:hidden;background:#000;aspect-ratio:1/1;max-width:320px;margin:0 auto" id="er-camara-wrap">
      <video id="er-video" playsinline muted style="width:100%;height:100%;object-fit:cover;display:block"></video>
      <div style="position:absolute;inset:0;border:3px solid rgba(255,255,255,.5);border-radius:var(--radius-sm);pointer-events:none;box-shadow:inset 0 0 0 30px rgba(0,0,0,.25)"></div>
    </div>
    <div id="er-status" style="text-align:center;font-size:13px;font-weight:700;margin-top:10px">Regresados: ${rem.items.filter((it) => it.checkRegreso).length} / ${rem.items.length}</div>
    <div id="er-form"></div>
    <div id="er-lista" style="margin-top:12px;max-height:180px;overflow-y:auto"></div>`;
  const footer = `<button class="btn btn-primary" data-close-modal>Listo</button>`;
  const modal = openModal('Escanear regreso — ' + folio, body, footer);

  const video = modal.querySelector('#er-video') as HTMLVideoElement;
  const statusEl = modal.querySelector('#er-status') as HTMLElement;
  const formEl = modal.querySelector('#er-form') as HTMLElement;

  const pintarLista = (remActual: typeof rem) => {
    modal.querySelector('#er-lista')!.innerHTML = remActual.items
      .map((it) => `<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:12px;border-bottom:1px solid var(--gris)"><span>${it.checkRegreso ? '✅' : '⬜'} ${esc(it.materialNombre)}</span>${it.checkRegreso ? `<span style="color:var(--gris-med)">${it.cantidadRegresada ?? 0} — ${esc(it.estadoRegreso || '')}</span>` : ''}</div>`)
      .join('');
  };
  pintarLista(rem);

  iniciarCamaraQr(video, (codigo) => {
    const material = resolverCodigoEscaneado(db, codigo);
    if (!material) return;
    const remActual = store.current!.remisiones.find((r) => r.folio === folio)!;
    const item = remActual.items.find((it) => it.materialId === material.id);
    if (!item) return;
    sesionEscaneoRem?.pausar(true);
    const salieron = item.cantidadEnviar ?? item.totalUnidades;

    formEl.innerHTML = `
      <div class="card" style="padding:12px;margin-top:10px">
        <div style="font-weight:700;margin-bottom:8px">${esc(item.materialNombre)} — salieron ${salieron}</div>
        <div class="frow">
          <div class="fg"><label class="fl">Cantidad que regresa</label><input type="number" class="fc" id="er-cant" value="${salieron}" min="0" max="${salieron}"/></div>
          <div class="fg"><label class="fl">Estado</label>
            <select class="fc" id="er-estado">
              <option value="Bien">✅ Bien</option>
              <option value="Roto">🔧 Roto</option>
              <option value="Perdido">❌ Perdido</option>
              <option value="No regresó">🚫 No regresó</option>
            </select>
          </div>
        </div>
        <button class="btn btn-success" id="er-confirmar" style="width:100%">Confirmar y seguir escaneando</button>
      </div>`;

    const estadoSel = formEl.querySelector('#er-estado') as HTMLSelectElement;
    const cantInput = formEl.querySelector('#er-cant') as HTMLInputElement;
    estadoSel.addEventListener('change', () => {
      if (estadoSel.value === 'Perdido' || estadoSel.value === 'No regresó') cantInput.value = '0';
      else if (Number(cantInput.value) === 0) cantInput.value = String(salieron);
    });

    formEl.querySelector('#er-confirmar')?.addEventListener('click', async () => {
      const cant = Number(cantInput.value) || 0;
      const estado = estadoSel.value as 'Bien' | 'Roto' | 'Perdido' | 'No regresó';
      showLoader('Guardando…');
      try {
        let completa = false;
        await store.mutate((current) => {
          const r = registrarRegresoEscaneado(current, folio, material.id, cant, estado, '');
          completa = r.remisionCompleta;
          return r.db;
        }, `Escanear regreso: ${material.nombre}`);
        const remNueva = store.current!.remisiones.find((r) => r.folio === folio)!;
        const marcados = remNueva.items.filter((it) => it.checkRegreso).length;
        statusEl.textContent = `Regresados: ${marcados} / ${remNueva.items.length}`;
        pintarLista(remNueva);
        formEl.innerHTML = '';
        toast(`✓ ${material.nombre} registrado`, 's');
        if (completa) {
          toast('🎉 Remisión completa — se cerró automáticamente', 's');
        }
        sesionEscaneoRem?.pausar(false);
      } catch (e) {
        toast('Error: ' + (e as Error).message, 'e');
        sesionEscaneoRem?.pausar(false);
      } finally {
        hideLoader();
      }
    });
  })
    .then((sesion) => {
      sesionEscaneoRem = sesion;
    })
    .catch((e: Error) => {
      statusEl.innerHTML = `<span style="color:var(--rojo)">No se pudo acceder a la cámara: ${esc(e.message)}</span>`;
    });

  const observer = new MutationObserver(() => {
    if (!document.body.contains(modal)) {
      detenerEscaneoRemision();
      onChanged();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true });
}

// ── HOJA DE ETIQUETAS SOLO DE ESTA REMISIÓN (para imprimir y escanear al empacar/regresar, sin etiquetar todo el almacén) ──
async function renderEtiquetasDeRemision(container: HTMLElement, db: Database, rem: Remision, onChanged: () => void) {
  container.innerHTML = `
    <div class="no-print" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <button class="btn btn-ghost btn-sm" id="etq-volver">← Volver a la remisión</button>
      <button class="btn btn-orange" id="etq-imprimir">🖨️ Imprimir</button>
    </div>
    <div style="margin-bottom:16px"><h1 style="font-size:20px;font-weight:800">Etiquetas — ${esc(rem.folio)}</h1><p style="color:var(--gris-med);font-size:13px">Solo los ${rem.items.length} materiales de esta remisión — imprime, recorta y pega temporalmente para escanear salida/regreso, aunque el material no tenga etiqueta permanente en su rack</p></div>
    <div id="etq-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:14px">
      <div class="no-print" style="grid-column:1/-1;text-align:center;color:var(--gris-med);padding:20px">Generando códigos…</div>
    </div>`;

  container.querySelector('#etq-volver')?.addEventListener('click', () => renderRemisionDetalle(container, db, rem.folio, onChanged));
  container.querySelector('#etq-imprimir')?.addEventListener('click', () => window.print());

  const grid = container.querySelector('#etq-grid')!;
  const htmls: string[] = [];
  for (const it of rem.items) {
    const dataUrl = await generarQrDataUrl(it.materialId, 200);
    htmls.push(`
      <div class="qr-label" style="border:1.5px solid var(--gris);border-radius:8px;padding:10px;background:#fff">
        <img src="${dataUrl}" style="width:100%;aspect-ratio:1/1;object-fit:contain"/>
        <div style="text-align:center;font-weight:700;font-size:12px;margin-top:4px;line-height:1.2">${esc(it.materialNombre)}</div>
        <div style="text-align:center;font-size:10px;color:var(--gris-med)">${esc(it.materialId)} · cant: ${it.cantidadEnviar ?? it.totalUnidades}</div>
      </div>`);
  }
  grid.innerHTML = htmls.join('');
}
