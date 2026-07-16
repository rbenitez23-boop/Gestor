import type { Database, TipoPaquete } from '../../types';
import { analizarPrograma, type ResultadoAutoRemision } from '../../domain/autoRemision';
import { crearRemision } from '../../domain/remisiones';
import { calcularStockPorAlmacen } from '../../domain/stock';
import { store } from '../../services/store';
import { toast, esc, showLoader, hideLoader } from '../helpers';

export function renderAutoRemision(container: HTMLElement, db: Database, onChanged: () => void) {
  const almacenOptions = db.almacenes.filter((a) => a.activo !== false).map((a) => `<option value="${esc(a.nombre)}">${esc(a.nombre)}</option>`).join('');

  container.innerHTML = `
    <div style="margin-bottom:20px"><h1 style="font-size:22px;font-weight:800">Auto-Remisión</h1><p style="color:var(--gris-med);font-size:13px">Pega el programa del campamento — se cruza contra el Recetario, sin IA, mismo resultado siempre</p></div>
    <div class="card" style="padding:18px">
      <div class="fg"><label class="fl">Programa (pega el texto, un renglón por actividad — ideal con horario "09:00 Aros musicales")</label>
        <textarea class="fc" id="ar-texto" rows="8" placeholder="08:00 Bienvenida&#10;09:00 Aros musicales&#10;10:00 Clínica arco…"></textarea>
      </div>
      <div class="frow">
        <div class="fg"><label class="fl">Tipo de evento</label><select class="fc" id="ar-tipo"><option>Campamento</option><option>Excursión</option><option>Evento</option></select></div>
        <div class="fg"><label class="fl">Almacén de origen</label><select class="fc" id="ar-almacen">${almacenOptions}</select></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
        <div class="fg"><label class="fl">Equipos</label><input type="number" class="fc" id="ar-equipos" value="4" min="0"/></div>
        <div class="fg"><label class="fl">Campistas</label><input type="number" class="fc" id="ar-campistas" value="20" min="0"/></div>
        <div class="fg"><label class="fl">Staff</label><input type="number" class="fc" id="ar-staff" value="6" min="0"/></div>
        <div class="fg"><label class="fl">Maestros</label><input type="number" class="fc" id="ar-maestros" value="2" min="0"/></div>
      </div>
      <button class="btn btn-primary" id="ar-analizar">Analizar programa</button>
    </div>
    <div id="ar-resultado" style="margin-top:20px"></div>`;

  container.querySelector('#ar-analizar')?.addEventListener('click', () => {
    const texto = (document.getElementById('ar-texto') as HTMLTextAreaElement).value;
    if (!texto.trim()) {
      toast('Pega el programa primero', 'e');
      return;
    }
    const tipoEvento = (document.getElementById('ar-tipo') as HTMLSelectElement).value;
    const numEquipos = Number((document.getElementById('ar-equipos') as HTMLInputElement).value) || 0;
    const numCampistas = Number((document.getElementById('ar-campistas') as HTMLInputElement).value) || 0;
    const numStaff = Number((document.getElementById('ar-staff') as HTMLInputElement).value) || 0;
    const numMaestros = Number((document.getElementById('ar-maestros') as HTMLInputElement).value) || 0;

    const resultado = analizarPrograma(db, texto, tipoEvento, numEquipos, numCampistas, numStaff, numMaestros);
    renderResultado(container, db, resultado, tipoEvento, { numEquipos, numCampistas, numStaff, numMaestros }, onChanged);
  });
}

function renderResultado(
  container: HTMLElement,
  db: Database,
  resultado: ResultadoAutoRemision,
  tipoEvento: string,
  numeros: { numEquipos: number; numCampistas: number; numStaff: number; numMaestros: number },
  onChanged: () => void
) {
  const box = container.querySelector('#ar-resultado')!;
  const { actividadesDetectadas, items, advertencias } = resultado;

  const alertas: string[] = [];
  if (advertencias.advertenciasLectura.length) {
    alertas.push(`<div class="card" style="padding:12px 16px;border-left:4px solid var(--naranja);margin-bottom:10px">
      <b>⚠️ ${advertencias.advertenciasLectura.length} línea(s) no reconocidas</b>
      <ul style="margin:6px 0 0 18px;font-size:12px">${advertencias.advertenciasLectura.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
    </div>`);
  }
  if (advertencias.sinInventario.length) {
    alertas.push(`<div class="card" style="padding:12px 16px;border-left:4px solid var(--rojo);margin-bottom:10px">
      <b>📦 ${advertencias.sinInventario.length} material(es) no están en el catálogo</b>: ${esc(advertencias.sinInventario.join(', '))}
    </div>`);
  }

  box.innerHTML = `
    ${alertas.join('')}
    <div style="font-size:12px;font-weight:700;color:var(--gris-med);text-transform:uppercase;margin-bottom:8px">Actividades detectadas (${actividadesDetectadas.length})</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">
      ${actividadesDetectadas.map((a) => `<span class="semaforo sem-ok">${esc(a.nombre)}${a.horario ? ' · ' + a.horario : ''}</span>`).join('') || '<span style="color:var(--gris-med);font-size:12px">Ninguna — revisa el formato del texto</span>'}
    </div>
    <div class="card"><div class="tbl-wrap"><table>
      <thead><tr><th><input type="checkbox" id="ar-chk-all" checked/></th><th>Material</th><th>Cantidad</th><th>Stock disponible</th><th>Actividades</th></tr></thead>
      <tbody>${items
        .map((it, i) => {
          let stockHtml = '<span style="color:var(--gris-med)">Fuera de catálogo</span>';
          if (it.materialId) {
            const info = calcularStockPorAlmacen(it.materialId, db.movimientos);
            const suf = info.totalDisponible >= it.totalUnidades;
            stockHtml = `<span style="color:${suf ? 'var(--verde)' : 'var(--rojo)'};font-weight:700">${info.totalDisponible}</span>`;
          }
          return `<tr>
            <td><input type="checkbox" class="ar-item-chk" data-idx="${i}" checked/></td>
            <td>${esc(it.materialNombre)}${it.esObligatorio ? ' <span class="badge badge-cons">obligatorio</span>' : ''}${it.esReutilizable ? ' <span class="badge badge-dep">reutilizable</span>' : ''}</td>
            <td><input type="number" class="fc" style="width:70px" id="ar-cant-${i}" value="${it.totalUnidades}" min="0"/></td>
            <td>${stockHtml}</td>
            <td style="font-size:11px;color:var(--gris-med);max-width:220px">${esc(it.actividades.join(', '))}</td>
          </tr>`;
        })
        .join('')}</tbody>
    </table></div></div>
    <div class="card" style="padding:18px;margin-top:16px">
      <div class="frow">
        <div class="fg"><label class="fl">Cliente / Colegio <span>*</span></label><input class="fc" id="ar-cliente"/></div>
        <div class="fg"><label class="fl">Fecha de salida <span>*</span></label><input type="date" class="fc" id="ar-fecha" value="${new Date().toISOString().slice(0, 10)}"/></div>
      </div>
      <button class="btn btn-success" id="ar-crear">Crear remisión con los materiales seleccionados</button>
    </div>`;

  box.querySelector('#ar-chk-all')?.addEventListener('change', (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    box.querySelectorAll<HTMLInputElement>('.ar-item-chk').forEach((c) => (c.checked = checked));
  });

  box.querySelector('#ar-crear')?.addEventListener('click', async () => {
    const cliente = (document.getElementById('ar-cliente') as HTMLInputElement).value.trim();
    const fechaSalida = (document.getElementById('ar-fecha') as HTMLInputElement).value;
    if (!cliente || !fechaSalida) {
      toast('Cliente y fecha de salida son requeridos', 'e');
      return;
    }
    const seleccionados = items
      .map((it, i) => ({ it, i, checked: (document.getElementById(`ar-cant-${i}`) as HTMLInputElement)?.closest('tr')?.querySelector('.ar-item-chk') as HTMLInputElement }))
      .filter((x) => x.checked?.checked && x.it.materialId);

    if (!seleccionados.length) {
      toast('Selecciona al menos un material que exista en el catálogo', 'e');
      return;
    }

    showLoader('Guardando en GitHub…');
    try {
      let folioCreado = '';
      await store.mutate((current) => {
        const { db: next, folio } = crearRemision(current, {
          cliente,
          evento: '',
          fechaSalida,
          fechaRegreso: '',
          almacen: (document.getElementById('ar-almacen') as HTMLSelectElement).value,
          almacenSede: '',
          responsable: '',
          notas: 'Creada vía Auto-Remisión',
          tipoEvento,
          numEquipos: numeros.numEquipos || '',
          numCampistas: numeros.numCampistas || '',
          numStaff: numeros.numStaff || '',
          numMaestros: numeros.numMaestros || '',
          items: seleccionados.map(({ it, i }) => {
            const cant = Number((document.getElementById(`ar-cant-${i}`) as HTMLInputElement).value) || it.totalUnidades;
            return {
              materialId: it.materialId!,
              materialNombre: it.materialNombre,
              tipoPaquete: it.tipoPaquete as TipoPaquete,
              cantPaquetes: Math.ceil(cant / it.unidadesPaq),
              unidadesPaq: it.unidadesPaq,
              totalUnidades: cant,
            };
          }),
        });
        folioCreado = folio;
        return next;
      }, `Remisión vía Auto-Remisión: ${cliente}`);
      toast(`Remisión ${folioCreado} creada ✓`, 's');
      onChanged();
    } catch (e) {
      toast('Error: ' + (e as Error).message, 'e');
    } finally {
      hideLoader();
    }
  });
}
