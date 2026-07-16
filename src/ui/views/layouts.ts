import type { Database, LayoutItem } from '../../types';
import { extractRackNumber, buscarRackItem, nuevoItemId, ITEM_PRESETS, DEFAULT_LAYOUT_ITEMS } from '../../domain/layouts';
import { store } from '../../services/store';
import { openModal, closeModal, toast, esc, showLoader, hideLoader } from '../helpers';

const RESIZE_HIT = 14;

interface DragState {
  id: string;
  mode: 'move' | 'resize';
  startX: number;
  startY: number;
  orig: { x: number; y: number; w: number; h: number };
}

export function renderLayouts(container: HTMLElement, db: Database, onChanged: () => void) {
  const saved = db.uiConfig?.layoutItems;
  let allItems: LayoutItem[] = saved && saved.length ? saved.map((i) => ({ ...i })) : DEFAULT_LAYOUT_ITEMS.map((i) => ({ ...i }));
  let editMode = false;
  let activeFloor: 'baja' | 'alta' = 'baja';
  let drag: DragState | null = null;
  let dragMoved = false;

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px">
      <div><h1 style="font-size:22px;font-weight:800">Layouts</h1><p style="color:var(--gris-med);font-size:13px">Mapa del almacén — busca un material para localizarlo</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost" id="lo-edit-toggle">✏️ Activar edición</button>
        <div style="position:relative;display:none" id="lo-add-wrap">
          <button class="btn btn-ghost" id="lo-add-btn">+ Agregar elemento</button>
          <div id="lo-add-menu" style="display:none;position:absolute;top:110%;right:0;background:#fff;border:1px solid var(--gris);border-radius:8px;box-shadow:var(--shadow-lg);z-index:50;min-width:200px;overflow:hidden"></div>
        </div>
        <button class="btn btn-success" id="lo-save" style="display:none">💾 Guardar</button>
        <button class="btn btn-ghost" id="lo-reset" style="display:none">↩ Restaurar original</button>
      </div>
    </div>
    <div class="card" style="padding:12px 14px;margin-bottom:14px">
      <input class="fc" id="lo-search" placeholder="Buscar material para localizarlo…"/>
      <div id="lo-result" style="margin-top:8px;font-size:13px"></div>
    </div>
    <div class="card" style="padding:8px 16px;margin-bottom:14px;display:flex;gap:0">
      <div class="nav-item" id="lo-tab-baja" style="border-radius:8px 0 0 8px;flex:1;text-align:center;color:var(--texto)">🏪 Planta Baja</div>
      <div class="nav-item" id="lo-tab-alta" style="border-radius:0 8px 8px 0;flex:1;text-align:center;color:var(--texto)">🏬 Planta Alta</div>
    </div>
    <div class="card" style="padding:16px;overflow-x:auto">
      <svg id="lo-svg" width="100%" style="max-width:700px;display:block;margin:0 auto;touch-action:none" xmlns="http://www.w3.org/2000/svg"></svg>
    </div>
    <div class="no-print" style="margin-top:10px;font-size:11px;color:var(--gris-med)" id="lo-hint"></div>`;

  container.querySelector('#lo-add-menu')!.innerHTML = ITEM_PRESETS.map(
    (p) => `<div class="s-item" data-preset="${p.key}" style="display:flex;align-items:center;gap:8px;padding:9px 12px;cursor:pointer">${p.icono || '🗄️'} ${esc(p.etiquetaDefault)}</div>`
  ).join('');

  function svgViewBox() {
    return activeFloor === 'baja' ? '0 0 680 800' : '0 0 700 870';
  }

  function itemsFloor(): LayoutItem[] {
    return allItems.filter((i) => i.floor === activeFloor);
  }

  function drawSvg() {
    const svg = container.querySelector('#lo-svg') as unknown as SVGSVGElement;
    svg.setAttribute('viewBox', svgViewBox());
    const dims = activeFloor === 'baja' ? [680, 800] : [700, 870];
    const bg = `<rect x="0" y="0" width="${dims[0]}" height="${dims[1]}" fill="#e8ecf2" rx="4"/><rect x="8" y="8" width="${dims[0]! - 16}" height="${dims[1]! - 16}" fill="#f5f7fa" rx="3" stroke="#2d4a2d" stroke-width="6"/>`;
    const items = itemsFloor();
    svg.innerHTML = bg + items.map(itemHtml).join('');

    items.forEach((it) => {
      const g = svg.querySelector(`#lo-item-${it.id}`) as SVGGElement;
      if (!g) return;
      g.style.cursor = editMode ? 'move' : 'pointer';
      g.addEventListener('mousedown', (e) => onPointerDown(e, it, svg));
      g.addEventListener('touchstart', (e) => onPointerDown(e, it, svg), { passive: false });
      g.addEventListener('click', (e) => {
        if (dragMoved) {
          dragMoved = false;
          return;
        }
        if (editMode) openEditItemModal(it);
        else toast(`${esc(it.etiqueta)}${it.tipo === 'rack' ? ' — Rack ' + it.numero : ''}`, 'i');
      });
      if (editMode) {
        const del = svg.querySelector(`#lo-del-${it.id}`);
        del?.addEventListener('click', (e) => {
          e.stopPropagation();
          allItems = allItems.filter((x) => x.id !== it.id);
          drawSvg();
        });
      }
    });

    (container.querySelector('#lo-hint') as HTMLElement).textContent = editMode
      ? '🖱 Arrastra para mover · esquina inferior-derecha para redimensionar · clic para editar etiqueta/número · ✕ para borrar'
      : '';
  }

  function itemHtml(it: LayoutItem): string {
    const isRack = it.tipo === 'rack';
    const fill = isRack ? '#D0D8E8' : '#e8dfc8';
    const stroke = isRack ? '#8FA0C0' : '#c8b888';
    const titulo = isRack ? `Rack ${esc(it.numero)}` : `${it.icono} ${esc(it.etiqueta)}`;
    const sub = isRack ? esc(it.etiqueta) : '';
    return `<g id="lo-item-${it.id}">
      <rect class="lo-rect" data-search-num="${isRack ? it.numero : ''}" x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
      <text x="${it.x + it.w / 2}" y="${it.y + it.h / 2 - (sub ? 4 : -4)}" text-anchor="middle" font-family="Inter,sans-serif" font-size="13" font-weight="700" fill="#1A2332">${titulo}</text>
      ${sub ? `<text x="${it.x + it.w / 2}" y="${it.y + it.h / 2 + 13}" text-anchor="middle" font-family="Inter,sans-serif" font-size="9" fill="#5a6a82">${sub}</text>` : ''}
      ${editMode ? `<rect data-handle="1" x="${it.x + it.w - RESIZE_HIT}" y="${it.y + it.h - RESIZE_HIT}" width="${RESIZE_HIT}" height="${RESIZE_HIT}" fill="rgba(242,130,35,.6)" cursor="se-resize"/>` : ''}
      ${editMode ? `<circle id="lo-del-${it.id}" cx="${it.x + it.w - 8}" cy="${it.y + 8}" r="9" fill="#E53935"/><text x="${it.x + it.w - 8}" y="${it.y + 11}" text-anchor="middle" font-size="11" fill="#fff" style="pointer-events:none">✕</text>` : ''}
    </g>`;
  }

  function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  function onPointerDown(e: Event, it: LayoutItem, svg: SVGSVGElement) {
    if (!editMode) return;
    e.preventDefault();
    const ev = e as MouseEvent & TouchEvent;
    const point = ev.touches?.[0] ?? ev;
    const coords = svgPoint(svg, point.clientX, point.clientY);
    const isHandle = (e.target as SVGElement).hasAttribute('data-handle');
    dragMoved = false;
    drag = { id: it.id, mode: isHandle ? 'resize' : 'move', startX: coords.x, startY: coords.y, orig: { x: it.x, y: it.y, w: it.w, h: it.h } };
  }

  function onPointerMove(e: Event) {
    if (!drag) return;
    const svg = container.querySelector('#lo-svg') as unknown as SVGSVGElement | null;
    if (!svg) return;
    const ev = e as MouseEvent & TouchEvent;
    const point = ev.touches?.[0] ?? ev;
    const coords = svgPoint(svg, point.clientX, point.clientY);
    const dx = coords.x - drag.startX;
    const dy = coords.y - drag.startY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved = true;
    const MIN = 28;
    const idx = allItems.findIndex((i) => i.id === drag!.id);
    if (idx === -1) return;
    if (drag.mode === 'move') {
      allItems[idx] = { ...allItems[idx]!, x: drag.orig.x + dx, y: drag.orig.y + dy };
    } else {
      allItems[idx] = { ...allItems[idx]!, w: Math.max(MIN, drag.orig.w + dx), h: Math.max(MIN, drag.orig.h + dy) };
    }
    drawSvg();
  }
  function onPointerUp() {
    drag = null;
  }
  document.addEventListener('mousemove', onPointerMove);
  document.addEventListener('touchmove', onPointerMove, { passive: false });
  document.addEventListener('mouseup', onPointerUp);
  document.addEventListener('touchend', onPointerUp);

  function switchTab(floor: 'baja' | 'alta') {
    activeFloor = floor;
    container.querySelector('#lo-tab-baja')!.classList.toggle('active', floor === 'baja');
    container.querySelector('#lo-tab-alta')!.classList.toggle('active', floor === 'alta');
    drawSvg();
  }
  container.querySelector('#lo-tab-baja')?.addEventListener('click', () => switchTab('baja'));
  container.querySelector('#lo-tab-alta')?.addEventListener('click', () => switchTab('alta'));

  container.querySelector('#lo-edit-toggle')?.addEventListener('click', () => {
    editMode = !editMode;
    (container.querySelector('#lo-edit-toggle') as HTMLElement).textContent = editMode ? '🔒 Desactivar edición' : '✏️ Activar edición';
    (container.querySelector('#lo-save') as HTMLElement).style.display = editMode ? '' : 'none';
    (container.querySelector('#lo-reset') as HTMLElement).style.display = editMode ? '' : 'none';
    (container.querySelector('#lo-add-wrap') as HTMLElement).style.display = editMode ? '' : 'none';
    drawSvg();
  });

  container.querySelector('#lo-add-btn')?.addEventListener('click', () => {
    const menu = container.querySelector('#lo-add-menu') as HTMLElement;
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  });
  container.querySelector('#lo-add-menu')?.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest('[data-preset]') as HTMLElement | null;
    if (!el) return;
    const preset = ITEM_PRESETS.find((p) => p.key === el.dataset.preset);
    if (!preset) return;
    const nuevo: LayoutItem = {
      id: nuevoItemId(),
      floor: activeFloor,
      tipo: preset.tipo,
      numero: preset.tipo === 'rack' ? String(Math.max(0, ...allItems.filter((i) => i.tipo === 'rack').map((i) => parseInt(i.numero, 10) || 0)) + 1) : '',
      etiqueta: preset.etiquetaDefault,
      icono: preset.icono,
      x: 40,
      y: 40,
      w: preset.w,
      h: preset.h,
    };
    allItems = [...allItems, nuevo];
    (container.querySelector('#lo-add-menu') as HTMLElement).style.display = 'none';
    drawSvg();
    toast('Elemento agregado — arrástralo a su lugar y dale clic para editar su etiqueta', 'i');
  });

  container.querySelector('#lo-save')?.addEventListener('click', async () => {
    showLoader('Guardando en GitHub…');
    try {
      await store.mutate((current) => ({ ...current, uiConfig: { ...current.uiConfig, layoutItems: allItems } }), 'Actualizar layout del almacén');
      toast('Layout guardado ✓ — visible para todo el equipo', 's');
      onChanged();
    } catch (e) {
      toast('Error: ' + (e as Error).message, 'e');
    } finally {
      hideLoader();
    }
  });

  container.querySelector('#lo-reset')?.addEventListener('click', async () => {
    if (!confirm('¿Restaurar el layout original para todo el equipo? Se pierden tus cambios personalizados.')) return;
    allItems = DEFAULT_LAYOUT_ITEMS.map((i) => ({ ...i }));
    showLoader('Restaurando…');
    try {
      await store.mutate((current) => ({ ...current, uiConfig: { ...current.uiConfig, layoutItems: [] } }), 'Restaurar layout original');
      toast('Layout restaurado ✓', 's');
      drawSvg();
    } catch (e) {
      toast('Error: ' + (e as Error).message, 'e');
    } finally {
      hideLoader();
    }
  });

  function openEditItemModal(it: LayoutItem) {
    const isRack = it.tipo === 'rack';
    const body = `
      ${isRack ? `<div class="fg"><label class="fl">Número de Rack</label><input class="fc" id="li-numero" value="${esc(it.numero)}"/></div>` : ''}
      <div class="fg"><label class="fl">${isRack ? 'Descripción (lo que se ve abajo del número)' : 'Etiqueta'}</label><input class="fc" id="li-etiqueta" value="${esc(it.etiqueta)}"/></div>
      ${!isRack ? `<div class="fg"><label class="fl">Ícono</label><input class="fc" id="li-icono" value="${esc(it.icono)}" maxlength="4"/></div>` : ''}`;
    const footer = `<button class="btn btn-ghost" data-close-modal>Cancelar</button><button class="btn btn-primary" id="li-save">Guardar</button>`;
    const modal = openModal(isRack ? `Editar Rack ${it.numero}` : 'Editar elemento', body, footer);
    modal.querySelector('#li-save')?.addEventListener('click', () => {
      const idx = allItems.findIndex((x) => x.id === it.id);
      if (idx === -1) return;
      const etiqueta = (document.getElementById('li-etiqueta') as HTMLInputElement).value.trim() || it.etiqueta;
      const numero = isRack ? (document.getElementById('li-numero') as HTMLInputElement).value.trim() : it.numero;
      const icono = !isRack ? (document.getElementById('li-icono') as HTMLInputElement).value.trim() : it.icono;
      allItems[idx] = { ...allItems[idx]!, etiqueta, numero, icono };
      closeModal();
      drawSvg();
    });
  }

  container.querySelector('#lo-search')?.addEventListener('input', (e) => {
    const q = (e.target as HTMLInputElement).value.trim().toLowerCase();
    const resultEl = container.querySelector('#lo-result')!;
    if (!q) {
      resultEl.innerHTML = '';
      return;
    }
    const mat = db.materiales.find((m) => m.activo !== false && m.nombre.toLowerCase().includes(q) && m.rack);
    if (!mat) {
      resultEl.innerHTML = `<span style="color:var(--gris-med)">Sin resultados con rack asignado</span>`;
      return;
    }
    const num = extractRackNumber(mat.rack);
    if (!num) {
      resultEl.innerHTML = `<span style="color:var(--gris-med)">"${esc(mat.nombre)}" no tiene un número de rack reconocible (${esc(mat.rack)})</span>`;
      return;
    }
    const rackItem = buscarRackItem(db, num);
    if (!rackItem) {
      resultEl.innerHTML = `<span style="color:var(--gris-med)">"${esc(mat.nombre)}" → Rack ${num} (no está en el mapa todavía)</span>`;
      return;
    }
    resultEl.innerHTML = `<span class="semaforo sem-ok">📍 ${esc(mat.nombre)} → Rack ${num} — ${esc(rackItem.etiqueta)}</span>`;
    switchTab(rackItem.floor);
    setTimeout(() => {
      const svg = container.querySelector('#lo-svg') as unknown as SVGSVGElement;
      const rect = svg.querySelector(`.lo-rect[data-search-num="${num}"]`) as SVGRectElement | null;
      rect?.setAttribute('fill', '#72BE45');
      rect?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  });

  document.addEventListener('click', (e) => {
    const menu = container.querySelector('#lo-add-menu') as HTMLElement | null;
    if (menu && menu.style.display === 'block' && !(e.target as HTMLElement).closest('#lo-add-wrap')) {
      menu.style.display = 'none';
    }
  });

  switchTab('baja');
}
