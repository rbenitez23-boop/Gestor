import type { Database, Actividad, RecetaMaterial } from '../../types';
import { listarActividades, guardarActividad, eliminarActividad, nuevoMaterialReceta } from '../../domain/recetario';
import { store } from '../../services/store';
import { openModal, closeModal, toast, esc, downloadCsv, showLoader, hideLoader } from '../helpers';

const CATEGORIAS = ['Activa', 'Pasiva', 'Taller', 'Acuática', 'Nocturna'];

export function renderRecetario(container: HTMLElement, db: Database, onChanged: () => void) {
  const actividades = listarActividades(db);

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
      <div><h1 style="font-size:22px;font-weight:800">Recetario</h1><p style="color:var(--gris-med);font-size:13px">${actividades.length} actividades — qué material lleva cada una</p></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" id="rec-export">⬇️ Descargar Excel</button>
        <button class="btn btn-primary" id="rec-new">+ Nueva actividad</button>
      </div>
    </div>
    <div class="card" style="padding:12px 14px;margin-bottom:14px"><input class="fc" id="rec-filter" placeholder="Buscar actividad…"/></div>
    <div class="card"><div class="tbl-wrap"><table>
      <thead><tr><th>Actividad</th><th>Categoría</th><th>Materiales</th><th></th></tr></thead>
      <tbody id="rec-tbody"></tbody>
    </table></div></div>`;

  function renderRows(list: typeof actividades) {
    const tbody = container.querySelector('#rec-tbody')!;
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Sin actividades</td></tr>`;
      return;
    }
    tbody.innerHTML = list
      .map(
        ({ nombre, actividad }) => `<tr>
          <td style="font-weight:700">${esc(nombre)}</td>
          <td><span class="badge badge-cons">${esc(actividad.categoria)}</span></td>
          <td style="font-size:12px;color:var(--gris-med);max-width:340px">${actividad.materiales.map((m) => esc(m.material)).join(', ')}</td>
          <td><div style="display:flex;gap:6px">
            <button class="btn btn-ghost btn-sm" data-edit="${esc(nombre)}">Editar</button>
            <button class="btn btn-ghost btn-sm" data-del="${esc(nombre)}">Eliminar</button>
          </div></td>
        </tr>`
      )
      .join('');
    tbody.querySelectorAll<HTMLElement>('[data-edit]').forEach((el) =>
      el.addEventListener('click', () => {
        const nombre = el.dataset.edit!;
        const item = actividades.find((a) => a.nombre === nombre);
        if (item) openActividadModal(item.nombre, item.actividad, db, onChanged);
      })
    );
    tbody.querySelectorAll<HTMLElement>('[data-del]').forEach((el) =>
      el.addEventListener('click', async () => {
        const nombre = el.dataset.del!;
        if (!confirm(`¿Eliminar la actividad "${nombre}" del recetario?`)) return;
        showLoader('Eliminando…');
        try {
          await store.mutate((current) => eliminarActividad(current, nombre), `Eliminar actividad del recetario: ${nombre}`);
          toast('Actividad eliminada', 's');
          onChanged();
        } catch (e) {
          toast('Error: ' + (e as Error).message, 'e');
        } finally {
          hideLoader();
        }
      })
    );
  }

  renderRows(actividades);
  container.querySelector('#rec-filter')?.addEventListener('input', (e) => {
    const q = (e.target as HTMLInputElement).value.toLowerCase();
    renderRows(actividades.filter((a) => a.nombre.toLowerCase().includes(q)));
  });
  container.querySelector('#rec-new')?.addEventListener('click', () => openActividadModal(null, { categoria: 'Activa', materiales: [] }, db, onChanged));

  container.querySelector('#rec-export')?.addEventListener('click', () => {
    downloadCsv(
      'recetario',
      ['Actividad', 'Categoría', 'Materiales'],
      actividades.map(({ nombre, actividad }) => [nombre, actividad.categoria, actividad.materiales.map((m) => `${m.material} (${m.cantidad} — ${m.escala})`).join('; ')])
    );
  });
}

let matRowCount = 0;

function openActividadModal(nombreOriginal: string | null, actividad: Actividad, db: Database, onChanged: () => void) {
  matRowCount = 0;
  const body = `
    <div class="frow">
      <div class="fg"><label class="fl">Nombre de la actividad <span>*</span></label><input class="fc" id="ac-nombre" value="${esc(nombreOriginal || '')}"/></div>
      <div class="fg"><label class="fl">Categoría</label>
        <select class="fc" id="ac-categoria">${CATEGORIAS.map((c) => `<option ${actividad.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
      </div>
    </div>
    <div style="margin-top:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-weight:700;font-size:13px">Materiales que usa</span>
        <button class="btn btn-success btn-sm" id="ac-add-mat">+ Agregar material</button>
      </div>
      <div id="ac-mats"></div>
    </div>
    <datalist id="ac-materiales-catalogo">
      ${db.materiales.filter((m) => m.activo !== false).map((m) => `<option value="${esc(m.nombre)}">`).join('')}
    </datalist>`;
  const footer = `<button class="btn btn-ghost" data-close-modal>Cancelar</button><button class="btn btn-primary" id="ac-save">Guardar</button>`;
  const modal = openModal(nombreOriginal ? 'Editar actividad' : 'Nueva actividad', body, footer);

  const addMatRow = (m: RecetaMaterial) => {
    const i = matRowCount++;
    const row = document.createElement('div');
    row.id = `ac-mat-${i}`;
    row.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:6px;margin-bottom:6px;align-items:center';
    row.innerHTML = `
      <input class="fc" placeholder="Material — empieza a escribir para ver sugerencias" data-mat-nombre value="${esc(m.material)}" list="ac-materiales-catalogo"/>
      <input type="number" class="fc" placeholder="Cant." data-mat-cant value="${m.cantidad}" min="0" step="0.25"/>
      <select class="fc" data-mat-escala>
        ${['Campamento', 'Equipo', 'Campista', 'Campista + Staff', 'Campista + Staff + Maestro'].map((e) => `<option ${m.escala === e ? 'selected' : ''}>${e}</option>`).join('')}
      </select>
      <button class="btn btn-ghost btn-sm" data-remove-mat>✕</button>`;
    modal.querySelector('#ac-mats')!.appendChild(row);
    row.querySelector('[data-remove-mat]')?.addEventListener('click', () => row.remove());
    const inputNombre = row.querySelector('[data-mat-nombre]') as HTMLInputElement;
    const nombresCatalogo = new Set(db.materiales.filter((mm) => mm.activo !== false).map((mm) => mm.nombre.toLowerCase()));
    const checarCoincidencia = () => {
      const v = inputNombre.value.trim().toLowerCase();
      inputNombre.style.borderColor = v && !nombresCatalogo.has(v) ? 'var(--naranja)' : '';
      inputNombre.title = v && !nombresCatalogo.has(v) ? 'Este nombre no coincide exacto con ningún material del catálogo — revisa que no sea un error de dedo (a menos que sea un alias a propósito)' : '';
    };
    inputNombre.addEventListener('input', checarCoincidencia);
    checarCoincidencia();
  };
  modal.querySelector('#ac-add-mat')?.addEventListener('click', () => addMatRow(nuevoMaterialReceta()));
  if (actividad.materiales.length) actividad.materiales.forEach(addMatRow);
  else addMatRow(nuevoMaterialReceta());

  modal.querySelector('#ac-save')?.addEventListener('click', async () => {
    const nombreNuevo = (document.getElementById('ac-nombre') as HTMLInputElement).value.trim();
    if (!nombreNuevo) {
      toast('El nombre de la actividad es requerido', 'e');
      return;
    }
    const materiales: RecetaMaterial[] = [];
    modal.querySelectorAll('[id^="ac-mat-"]').forEach((row) => {
      const nombre = (row.querySelector('[data-mat-nombre]') as HTMLInputElement).value.trim();
      if (!nombre) return;
      materiales.push({
        material: nombre,
        cantidad: Number((row.querySelector('[data-mat-cant]') as HTMLInputElement).value) || 1,
        escala: (row.querySelector('[data-mat-escala]') as HTMLSelectElement).value,
        notas: '',
        tipoUso: 'Consumible',
      });
    });
    // Nota: se permite guardar sin materiales — hay actividades reales
    // (pláticas, dinámicas de grupo, reflexiones) que no ocupan nada del
    // almacén, y forzar a capturar un material inventado generaba datos
    // sucios en el catálogo.
    const nuevaActividad: Actividad = { categoria: (document.getElementById('ac-categoria') as HTMLSelectElement).value, materiales };

    showLoader('Guardando en GitHub…');
    try {
      await store.mutate(
        (current) => guardarActividad(current, nombreOriginal, nombreNuevo, nuevaActividad),
        nombreOriginal ? `Editar actividad: ${nombreNuevo}` : `Nueva actividad: ${nombreNuevo}`
      );
      toast('Actividad guardada ✓', 's');
      closeModal();
      onChanged();
    } catch (e) {
      toast('Error: ' + (e as Error).message, 'e');
    } finally {
      hideLoader();
    }
  });
}
