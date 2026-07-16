import type { Database, Material, Clasificacion, UnidadTDE } from '../../types';
import { listarMaterialesConStock, generarIdSecuencial } from '../../domain/materiales';
import { store } from '../../services/store';
import { openModal, closeModal, toast, esc, fmtMoney, lightbox, downloadCsv, showLoader, hideLoader } from '../helpers';
import { generarQrDataUrl } from '../../services/qr';

function semaforoHtml(prioridad: string, stockMin: number | null): string {
  const map: Record<string, string> = {
    urgente: '<span class="semaforo sem-urgente">🔴 Sin stock</span>',
    alta: '<span class="semaforo sem-alta">🟠 Bajo mínimo</span>',
    media: '<span class="semaforo sem-media">🟡 Bajo máximo</span>',
    ok: '<span class="semaforo sem-ok">✅ OK</span>',
  };
  if (map[prioridad]) return map[prioridad];
  return stockMin === null ? '<span class="semaforo sem-sin">Sin mín</span>' : '<span class="semaforo sem-ok">✅ OK</span>';
}

/** Convierte un archivo de imagen a data URL (base64) — se guarda directo en el material, sin depender de ningún servicio externo de almacenamiento. */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Redimensiona/comprime la imagen en el navegador antes de guardarla, para no inflar data/db.json con fotos pesadas. */
function comprimirImagen(dataUrl: string, maxDim = 480, calidad = 0.72): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', calidad));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function thumbHtml(fotoUrl: string, size = 38, clickable = false): string {
  if (fotoUrl) {
    const cursor = clickable ? 'cursor:zoom-in' : '';
    const dataAttr = clickable ? `data-ver-foto="${esc(fotoUrl)}"` : '';
    return `<img src="${esc(fotoUrl)}" ${dataAttr} style="width:${size}px;height:${size}px;object-fit:cover;border-radius:6px;border:1.5px solid var(--gris);${cursor}"/>`;
  }
  return `<div style="width:${size}px;height:${size}px;border-radius:6px;border:1.5px dashed var(--gris);display:grid;place-items:center;color:var(--gris-med);font-size:14px">🖼️</div>`;
}

export function renderMateriales(container: HTMLElement, db: Database, onChanged: () => void) {
  const materiales = listarMaterialesConStock(db);
  const materialesById = new Map(db.materiales.map((m) => [m.id, m]));

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
      <div><h1 style="font-size:22px;font-weight:800">Materiales</h1><p style="color:var(--gris-med);font-size:13px">Catálogo completo — ${materiales.length} activos</p></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" id="btn-export-mat">⬇️ Descargar Excel</button>
        <button class="btn btn-primary" id="btn-new-mat">+ Nuevo material</button>
      </div>
    </div>
    <div class="card" style="padding:12px 14px;margin-bottom:14px"><input class="fc" id="mat-filter" placeholder="Filtrar materiales…"/></div>
    <div class="card"><div class="tbl-wrap"><table>
      <thead><tr><th>Foto</th><th>Material</th><th>Ubicación</th><th>Tipo</th><th>Disponible</th><th>Total</th><th>Costo</th><th>Estado</th><th></th></tr></thead>
      <tbody id="mat-tbody"></tbody>
    </table></div></div>`;

  function renderRows(list: typeof materiales) {
    const tbody = container.querySelector('#mat-tbody')!;
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Sin materiales</td></tr>`;
      return;
    }
    tbody.innerHTML = list
      .map((m) => {
        const disp = m.stockDisponible;
        const color = disp <= 0 ? 'var(--rojo)' : m.stockMin !== null && disp < m.stockMin ? 'var(--naranja)' : 'var(--verde)';
        return `<tr>
          <td>${thumbHtml(m.fotoUrl, 38, true)}</td>
          <td><div style="font-weight:700">${esc(m.nombre)}${m.tieneNumSerie ? ' <span class="badge badge-cons">#</span>' : ''}</div><div style="font-size:11px;color:var(--gris-med)">${m.id}</div></td>
          <td>${m.rack ? esc(m.rack) + (m.seccion ? ' §' + esc(m.seccion) : '') : '<span style="color:var(--gris-med)">—</span>'}</td>
          <td>${esc(m.tipoPaquete)}</td>
          <td><span style="font-weight:700;font-size:16px;color:${color}">${disp}</span></td>
          <td>${m.stockTotal}</td>
          <td style="font-size:12px">${m.costoUnidad !== null ? fmtMoney(m.costoUnidad) : '<span style="color:var(--gris-med)">—</span>'}</td>
          <td>${semaforoHtml(m.prioridad, m.stockMin)}</td>
          <td><div style="display:flex;gap:6px"><button class="btn btn-ghost btn-sm" data-qr="${m.id}" data-nombre="${esc(m.nombre)}" title="Ver código QR">🏷️</button><button class="btn btn-ghost btn-sm" data-edit="${m.id}">Editar</button></div></td>
        </tr>`;
      })
      .join('');
    tbody.querySelectorAll<HTMLElement>('[data-qr]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        mostrarQrModal(el.dataset.qr!, el.dataset.nombre || '');
      });
    });
    tbody.querySelectorAll<HTMLElement>('[data-ver-foto]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        lightbox(el.dataset.verFoto!);
      });
    });
    tbody.querySelectorAll<HTMLElement>('[data-edit]').forEach((el) => {
      el.addEventListener('click', () => {
        const mat = materialesById.get(el.dataset.edit!);
        if (mat) openMaterialModal(mat, db, onChanged);
      });
    });
  }

  renderRows(materiales);

  container.querySelector('#mat-filter')?.addEventListener('input', (e) => {
    const q = (e.target as HTMLInputElement).value.toLowerCase();
    renderRows(materiales.filter((m) => m.nombre.toLowerCase().includes(q) || (m.rack || '').toLowerCase().includes(q)));
  });

  container.querySelector('#btn-new-mat')?.addEventListener('click', () => openMaterialModal(null, db, onChanged));

  container.querySelector('#btn-export-mat')?.addEventListener('click', () => {
    downloadCsv(
      'materiales',
      ['ID', 'Nombre', 'Tipo Paquete', 'Rack', 'Sección', 'Zona', 'Disponible', 'Total', 'Stock Mín', 'Stock Máx', 'Costo Unidad', 'Clasificación', 'Costo Uso', 'Tiempo Entrega', 'Proveedor Principal'],
      materiales.map((m) => [m.id, m.nombre, m.tipoPaquete, m.rack, m.seccion, m.zona, m.stockDisponible, m.stockTotal, m.stockMin ?? '', m.stockMax ?? '', m.costoUnidad ?? '', m.clasificacion, m.costoUso ?? '', m.tdeValor ? `${m.tdeValor} ${m.tdeUnidad}` : '', m.provPrincipal])
    );
  });
}

async function mostrarQrModal(materialId: string, nombre: string) {
  const body = `<div id="qrm-body" style="text-align:center;padding:10px">Generando…</div>`;
  const footer = `<button class="btn btn-ghost" data-close-modal>Cerrar</button><button class="btn btn-primary" id="qrm-descargar">⬇️ Descargar PNG</button>`;
  const modal = openModal(`Código QR — ${nombre}`, body, footer);
  const dataUrl = await generarQrDataUrl(materialId, 300);
  modal.querySelector('#qrm-body')!.innerHTML = `
    <img src="${dataUrl}" style="width:220px;height:220px;margin:0 auto;display:block"/>
    <div style="font-weight:700;margin-top:10px">${esc(nombre)}</div>
    <div style="font-size:12px;color:var(--gris-med)">${esc(materialId)}</div>`;
  modal.querySelector('#qrm-descargar')?.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `QR_${materialId}.png`;
    a.click();
  });
}

function openMaterialModal(material: Material | null, db: Database, onChanged: () => void) {
  const isEdit = !!material;
  let fotoActual = material?.fotoUrl || '';

  const proveedorOptions = (selectedId: string) =>
    '<option value="">— Ninguno —</option>' +
    db.proveedores
      .filter((p) => p.activo !== false)
      .map((p) => `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${esc(p.nombre)}</option>`)
      .join('');

  const body = `
    <input type="hidden" id="mm-id" value="${material?.id || ''}"/>

    <div class="fg">
      <label class="fl">Foto</label>
      <div style="display:flex;align-items:center;gap:12px">
        <div id="mm-foto-preview">${thumbHtml(fotoActual, 76)}</div>
        <div>
          <input type="file" accept="image/*" id="mm-foto-input" style="display:none"/>
          <button type="button" class="btn btn-ghost btn-sm" id="mm-foto-ver" style="display:${fotoActual ? '' : 'none'}">👁 Ver foto</button>
          <button type="button" class="btn btn-ghost btn-sm" id="mm-foto-btn">📷 ${fotoActual ? 'Cambiar foto' : 'Subir foto'}</button>
          <button type="button" class="btn btn-ghost btn-sm" id="mm-foto-quitar" style="display:${fotoActual ? '' : 'none'}">✕ Quitar</button>
          <div style="font-size:11px;color:var(--gris-med);margin-top:4px">Se comprime automáticamente antes de guardar.</div>
        </div>
      </div>
    </div>

    <div class="fg"><label class="fl">Nombre <span>*</span></label><input class="fc" id="mm-nombre" value="${esc(material?.nombre || '')}"/></div>
    <div class="frow">
      <div class="fg"><label class="fl">Tipo de paquete</label>
        <select class="fc" id="mm-tipo-paq">
          ${['Bolsa', 'Caja', 'Paquete Armado', 'Pieza Única'].map((t) => `<option value="${t}" ${material?.tipoPaquete === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="fg"><label class="fl">Unidades por paquete</label><input type="number" class="fc" id="mm-uds" value="${material?.unidadesPaq ?? 1}" min="1"/></div>
    </div>
    <div class="frow">
      <div class="fg"><label class="fl">Rack</label><input class="fc" id="mm-rack" value="${esc(material?.rack || '')}"/></div>
      <div class="fg"><label class="fl">Zona</label><input class="fc" id="mm-zona" value="${esc(material?.zona || '')}"/></div>
    </div>
    <div class="frow">
      <div class="fg"><label class="fl">Stock Mínimo</label><input type="number" class="fc" id="mm-min" value="${material?.stockMin ?? ''}" min="0"/></div>
      <div class="fg"><label class="fl">Stock Máximo</label><input type="number" class="fc" id="mm-max" value="${material?.stockMax ?? ''}" min="0"/></div>
    </div>
    <div class="fg"><label class="fl">Descripción</label><textarea class="fc" id="mm-desc" rows="2">${esc(material?.descripcion || '')}</textarea></div>

    <div class="section-title" style="margin-top:14px">💰 Control financiero</div>
    <div class="frow">
      <div class="fg"><label class="fl">Costo por pieza/paquete</label><input type="number" class="fc" id="mm-costo" value="${material?.costoUnidad ?? ''}" min="0" step="0.01" placeholder="Ej: 200.00"/></div>
      <div class="fg"><label class="fl">Clasificación</label>
        <select class="fc" id="mm-clasificacion">
          <option value="Consumible" ${(!material || material.clasificacion === 'Consumible') ? 'selected' : ''}>Consumible</option>
          <option value="Depreciable" ${material?.clasificacion === 'Depreciable' ? 'selected' : ''}>Depreciable</option>
        </select>
      </div>
    </div>
    <div class="frow" id="mm-costouso-row" style="display:${material?.clasificacion === 'Depreciable' ? '' : 'none'}">
      <div class="fg"><label class="fl">Costo de uso (por cada vez que sale)</label><input type="number" class="fc" id="mm-costouso" value="${material?.costoUso ?? ''}" min="0" step="0.01"/></div>
      <div></div>
    </div>
    <div class="frow">
      <div class="fg"><label class="fl">Tiempo de entrega</label><input type="number" class="fc" id="mm-tde-valor" value="${material?.tdeValor ?? ''}" min="0"/></div>
      <div class="fg"><label class="fl">Unidad</label>
        <select class="fc" id="mm-tde-unidad">
          ${['Días', 'Semanas', 'Meses'].map((u) => `<option value="${u}" ${material?.tdeUnidad === u ? 'selected' : ''}>${u}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="section-title" style="margin-top:14px">Proveedores</div>
    <div class="frow">
      <div class="fg"><label class="fl">Principal</label><select class="fc" id="mm-prov-principal">${proveedorOptions(material?.provPrincipal || '')}</select></div>
      <div class="fg"><label class="fl">Alterno 1</label><select class="fc" id="mm-prov-alt1">${proveedorOptions(material?.provAlt1 || '')}</select></div>
    </div>
    ${db.proveedores.length === 0 ? '<div style="font-size:11px;color:var(--gris-med)">No tienes proveedores dados de alta todavía — ve a la sección Proveedores primero.</div>' : ''}`;

  const footer = `<button class="btn btn-ghost" data-close-modal>Cancelar</button><button class="btn btn-primary" id="mm-save">Guardar</button>`;
  const modal = openModal(isEdit ? 'Editar material' : 'Nuevo material', body, footer);

  // ── Foto: subir / ver / quitar ──
  const fotoInput = modal.querySelector('#mm-foto-input') as HTMLInputElement;
  modal.querySelector('#mm-foto-btn')?.addEventListener('click', () => fotoInput.click());
  modal.querySelector('#mm-foto-ver')?.addEventListener('click', () => lightbox(fotoActual));
  fotoInput.addEventListener('change', async () => {
    const file = fotoInput.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast('La imagen es muy pesada (máx 8MB antes de comprimir)', 'e');
      return;
    }
    showLoader('Procesando imagen…');
    try {
      const raw = await fileToDataUrl(file);
      fotoActual = await comprimirImagen(raw);
      modal.querySelector('#mm-foto-preview')!.innerHTML = thumbHtml(fotoActual, 76);
      (modal.querySelector('#mm-foto-ver') as HTMLElement).style.display = '';
      (modal.querySelector('#mm-foto-quitar') as HTMLElement).style.display = '';
      (modal.querySelector('#mm-foto-btn') as HTMLElement).textContent = '📷 Cambiar foto';
    } catch {
      toast('No se pudo procesar la imagen', 'e');
    } finally {
      hideLoader();
    }
  });
  modal.querySelector('#mm-foto-quitar')?.addEventListener('click', () => {
    fotoActual = '';
    modal.querySelector('#mm-foto-preview')!.innerHTML = thumbHtml('', 76);
    (modal.querySelector('#mm-foto-ver') as HTMLElement).style.display = 'none';
    (modal.querySelector('#mm-foto-quitar') as HTMLElement).style.display = 'none';
    (modal.querySelector('#mm-foto-btn') as HTMLElement).textContent = '📷 Subir foto';
  });

  // ── Mostrar/ocultar "Costo de uso" según clasificación ──
  modal.querySelector('#mm-clasificacion')?.addEventListener('change', (e) => {
    const row = modal.querySelector('#mm-costouso-row') as HTMLElement;
    row.style.display = (e.target as HTMLSelectElement).value === 'Depreciable' ? '' : 'none';
  });

  modal.querySelector('#mm-save')?.addEventListener('click', async () => {
    const nombre = (document.getElementById('mm-nombre') as HTMLInputElement).value.trim();
    if (!nombre) {
      toast('El nombre es requerido', 'e');
      return;
    }
    const minRaw = (document.getElementById('mm-min') as HTMLInputElement).value;
    const maxRaw = (document.getElementById('mm-max') as HTMLInputElement).value;
    const costoRaw = (document.getElementById('mm-costo') as HTMLInputElement).value;
    const costoUsoRaw = (document.getElementById('mm-costouso') as HTMLInputElement).value;
    const tdeRaw = (document.getElementById('mm-tde-valor') as HTMLInputElement).value;

    const camposComunes = {
      nombre,
      tipoPaquete: (document.getElementById('mm-tipo-paq') as HTMLSelectElement).value as Material['tipoPaquete'],
      unidadesPaq: Number((document.getElementById('mm-uds') as HTMLInputElement).value) || 1,
      rack: (document.getElementById('mm-rack') as HTMLInputElement).value,
      zona: (document.getElementById('mm-zona') as HTMLInputElement).value,
      stockMin: minRaw !== '' ? Number(minRaw) : null,
      stockMax: maxRaw !== '' ? Number(maxRaw) : null,
      descripcion: (document.getElementById('mm-desc') as HTMLTextAreaElement).value,
      fotoUrl: fotoActual,
      costoUnidad: costoRaw !== '' ? Number(costoRaw) : null,
      clasificacion: (document.getElementById('mm-clasificacion') as HTMLSelectElement).value as Clasificacion,
      costoUso: costoUsoRaw !== '' ? Number(costoUsoRaw) : null,
      tdeValor: tdeRaw !== '' ? Number(tdeRaw) : null,
      tdeUnidad: (document.getElementById('mm-tde-unidad') as HTMLSelectElement).value as UnidadTDE,
      provPrincipal: (document.getElementById('mm-prov-principal') as HTMLSelectElement).value,
      provAlt1: (document.getElementById('mm-prov-alt1') as HTMLSelectElement).value,
    };

    showLoader('Guardando en GitHub…');
    try {
      await store.mutate((current) => {
        if (isEdit && material) {
          return {
            ...current,
            materiales: current.materiales.map((m) => (m.id === material.id ? { ...m, ...camposComunes } : m)),
          };
        }
        const id = generarIdSecuencial(current.materiales.map((m) => m.id), 'MAT-', 4);
        const nuevo: Material = {
          id,
          ...camposComunes,
          fechaAlta: new Date().toISOString(),
          activo: true,
          seccion: '',
          tieneNumSerie: false,
          provAlt2: '',
          provAlt3: '',
        };
        return { ...current, materiales: [...current.materiales, nuevo] };
      }, isEdit ? `Editar material: ${nombre}` : `Alta de material: ${nombre}`);
      toast(isEdit ? 'Material actualizado ✓' : 'Material creado ✓', 's');
      closeModal();
      onChanged();
    } catch (e) {
      toast('Error: ' + (e as Error).message, 'e');
    } finally {
      hideLoader();
    }
  });
}
