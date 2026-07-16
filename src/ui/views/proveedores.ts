import type { Database, Proveedor } from '../../types';
import { listarProveedoresActivos, agregarProveedor, editarProveedor, eliminarProveedor, type ProveedorInput } from '../../domain/proveedores';
import { store } from '../../services/store';
import { openModal, closeModal, toast, esc, downloadCsv, showLoader, hideLoader } from '../helpers';

export function renderProveedores(container: HTMLElement, db: Database, onChanged: () => void) {
  const proveedores = listarProveedoresActivos(db);

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
      <div><h1 style="font-size:22px;font-weight:800">Proveedores</h1><p style="color:var(--gris-med);font-size:13px">Directorio y costos de referencia</p></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" id="btn-export-prov">⬇️ Descargar Excel</button>
        <button class="btn btn-primary" id="btn-new-prov">+ Nuevo proveedor</button>
      </div>
    </div>
    <div class="card"><div class="tbl-wrap"><table>
      <thead><tr><th>Nombre</th><th>Contacto</th><th>Qué vende</th><th>Costo ref.</th><th>Tiempo entrega</th><th></th></tr></thead>
      <tbody id="prov-tbody"></tbody>
    </table></div></div>`;

  function renderRows() {
    const tbody = container.querySelector('#prov-tbody')!;
    if (!proveedores.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Sin proveedores registrados</td></tr>`;
      return;
    }
    tbody.innerHTML = proveedores
      .map(
        (p) => `<tr>
          <td style="font-weight:700">${esc(p.nombre)}</td>
          <td>${esc(p.contacto || '—')}</td>
          <td style="max-width:220px">${esc(p.queVende || '—')}</td>
          <td>${esc(p.costoReferencia || '—')}</td>
          <td>${esc(p.tiempoEntrega || '—')}</td>
          <td><div style="display:flex;gap:6px">
            <button class="btn btn-ghost btn-sm" data-edit="${p.id}">Editar</button>
            <button class="btn btn-ghost btn-sm" data-del="${p.id}">Eliminar</button>
          </div></td>
        </tr>`
      )
      .join('');
    tbody.querySelectorAll<HTMLElement>('[data-edit]').forEach((el) =>
      el.addEventListener('click', () => {
        const p = proveedores.find((x) => x.id === el.dataset.edit);
        if (p) openProveedorModal(p, onChanged);
      })
    );
    tbody.querySelectorAll<HTMLElement>('[data-del]').forEach((el) =>
      el.addEventListener('click', async () => {
        if (!confirm('¿Eliminar este proveedor?')) return;
        showLoader('Eliminando…');
        try {
          await store.mutate((current) => eliminarProveedor(current, el.dataset.del!), `Eliminar proveedor ${el.dataset.del}`);
          toast('Proveedor eliminado', 's');
          onChanged();
        } catch (e) {
          toast('Error: ' + (e as Error).message, 'e');
        } finally {
          hideLoader();
        }
      })
    );
  }

  renderRows();
  container.querySelector('#btn-new-prov')?.addEventListener('click', () => openProveedorModal(null, onChanged));

  container.querySelector('#btn-export-prov')?.addEventListener('click', () => {
    downloadCsv(
      'proveedores',
      ['Nombre', 'Contacto', 'Qué Vende', 'Dónde/Link', 'Costo Referencia', 'Tiempo Entrega', 'Notas'],
      proveedores.map((p) => [p.nombre, p.contacto, p.queVende, p.dondeLink, p.costoReferencia, p.tiempoEntrega, p.notas])
    );
  });
}

function openProveedorModal(proveedor: Proveedor | null, onChanged: () => void) {
  const isEdit = !!proveedor;
  const body = `
    <div class="fg"><label class="fl">Nombre <span>*</span></label><input class="fc" id="pv-nombre" value="${esc(proveedor?.nombre || '')}"/></div>
    <div class="fg"><label class="fl">Contacto</label><input class="fc" id="pv-contacto" value="${esc(proveedor?.contacto || '')}" placeholder="Teléfono, email, WhatsApp…"/></div>
    <div class="fg"><label class="fl">Qué vende</label><textarea class="fc" id="pv-que-vende" rows="2">${esc(proveedor?.queVende || '')}</textarea></div>
    <div class="fg"><label class="fl">Dónde comprar / Link</label><input class="fc" id="pv-donde" value="${esc(proveedor?.dondeLink || '')}"/></div>
    <div class="frow">
      <div class="fg"><label class="fl">Costo de referencia</label><input class="fc" id="pv-costo" value="${esc(proveedor?.costoReferencia || '')}"/></div>
      <div class="fg"><label class="fl">Tiempo de entrega</label><input class="fc" id="pv-tiempo" value="${esc(proveedor?.tiempoEntrega || '')}"/></div>
    </div>
    <div class="fg"><label class="fl">Notas / historial</label><textarea class="fc" id="pv-notas" rows="2">${esc(proveedor?.notas || '')}</textarea></div>`;

  const footer = `<button class="btn btn-ghost" data-close-modal>Cancelar</button><button class="btn btn-primary" id="pv-save">Guardar</button>`;
  const modal = openModal(isEdit ? 'Editar proveedor' : 'Nuevo proveedor', body, footer);

  modal.querySelector('#pv-save')?.addEventListener('click', async () => {
    const nombre = (document.getElementById('pv-nombre') as HTMLInputElement).value.trim();
    if (!nombre) {
      toast('El nombre es requerido', 'e');
      return;
    }
    const input: ProveedorInput = {
      nombre,
      contacto: (document.getElementById('pv-contacto') as HTMLInputElement).value,
      queVende: (document.getElementById('pv-que-vende') as HTMLTextAreaElement).value,
      dondeLink: (document.getElementById('pv-donde') as HTMLInputElement).value,
      costoReferencia: (document.getElementById('pv-costo') as HTMLInputElement).value,
      tiempoEntrega: (document.getElementById('pv-tiempo') as HTMLInputElement).value,
      notas: (document.getElementById('pv-notas') as HTMLTextAreaElement).value,
    };
    showLoader('Guardando en GitHub…');
    try {
      await store.mutate(
        (current) => (isEdit && proveedor ? editarProveedor(current, proveedor.id, input) : agregarProveedor(current, input).db),
        isEdit ? `Editar proveedor: ${nombre}` : `Alta de proveedor: ${nombre}`
      );
      toast(isEdit ? 'Proveedor actualizado ✓' : 'Proveedor creado ✓', 's');
      closeModal();
      onChanged();
    } catch (e) {
      toast('Error: ' + (e as Error).message, 'e');
    } finally {
      hideLoader();
    }
  });
}
