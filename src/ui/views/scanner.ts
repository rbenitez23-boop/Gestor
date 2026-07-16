import type { Database, TipoMovimiento } from '../../types';
import { resolverCodigoEscaneado, TIPOS_MOV_ESCANER } from '../../domain/scanner';
import { calcularStockPorAlmacen } from '../../domain/stock';
import { agregarMovimiento } from '../../domain/movimientos';
import { store } from '../../services/store';
import { iniciarCamaraQr, type SesionCamara } from '../../services/qrCamera';
import { toast, esc, showLoader, hideLoader } from '../helpers';

let sesionActiva: SesionCamara | null = null;

/** Apaga la cámara — se debe llamar siempre que el usuario navega fuera de esta pantalla (batería + privacidad). */
export function detenerEscaner() {
  sesionActiva?.detener();
  sesionActiva = null;
}

export function renderScanner(container: HTMLElement, db: Database, onChanged: () => void) {
  container.innerHTML = `
    <div style="margin-bottom:16px"><h1 style="font-size:22px;font-weight:800">Escáner QR</h1><p style="color:var(--gris-med);font-size:13px">Apunta la cámara al código del material para registrar el movimiento en segundos</p></div>

    <div class="card" style="padding:16px;max-width:480px;margin:0 auto">
      <div style="position:relative;border-radius:var(--radius-sm);overflow:hidden;background:#000;aspect-ratio:1/1;">
        <video id="sc-video" playsinline muted style="width:100%;height:100%;object-fit:cover;display:block"></video>
        <div style="position:absolute;inset:0;border:3px solid rgba(255,255,255,.5);border-radius:var(--radius-sm);pointer-events:none;box-shadow:inset 0 0 0 40px rgba(0,0,0,.25)"></div>
      </div>
      <div id="sc-status" style="text-align:center;font-size:12px;color:var(--gris-med);margin-top:10px">Solicitando acceso a la cámara…</div>
    </div>

    <div id="sc-result" style="max-width:480px;margin:16px auto 0"></div>`;

  const video = container.querySelector('#sc-video') as HTMLVideoElement;
  const statusEl = container.querySelector('#sc-status') as HTMLElement;

  iniciarCamaraQr(video, onCodigoDetectado)
    .then((sesion) => {
      sesionActiva = sesion;
      statusEl.textContent = 'Apunta al código QR del material…';
    })
    .catch((e: Error) => {
      statusEl.innerHTML = `<span style="color:var(--rojo)">No se pudo acceder a la cámara: ${esc(e.message)}. Revisa los permisos de cámara de tu navegador para este sitio.</span>`;
    });

  function onCodigoDetectado(codigo: string) {
    const material = resolverCodigoEscaneado(db, codigo);
    if (!material) {
      statusEl.innerHTML = `<span style="color:var(--naranja)">Código "${esc(codigo)}" no corresponde a ningún material activo.</span>`;
      return;
    }
    sesionActiva?.pausar(true);
    statusEl.textContent = '✅ Material encontrado';
    mostrarAccionRapida(material.id);
  }

  function mostrarAccionRapida(materialId: string) {
    const m = db.materiales.find((x) => x.id === materialId)!;
    const stockInfo = calcularStockPorAlmacen(materialId, db.movimientos);
    const almacenOptions = db.almacenes.filter((a) => a.activo !== false).map((a) => `<option value="${esc(a.nombre)}">${esc(a.nombre)} (${stockInfo.porAlmacen[a.nombre] || 0} disp.)</option>`).join('');

    const resultEl = container.querySelector('#sc-result')!;
    resultEl.innerHTML = `
      <div class="card" style="padding:16px">
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:14px">
          ${m.fotoUrl ? `<img src="${esc(m.fotoUrl)}" style="width:56px;height:56px;object-fit:cover;border-radius:8px;border:1.5px solid var(--gris)"/>` : `<div style="width:56px;height:56px;border-radius:8px;border:1.5px dashed var(--gris);display:grid;place-items:center;font-size:20px">🖼️</div>`}
          <div><div style="font-weight:800;font-size:16px">${esc(m.nombre)}</div><div style="font-size:12px;color:var(--gris-med)">${m.id} · Disponible: ${stockInfo.totalDisponible}</div></div>
        </div>

        <div class="fg"><label class="fl">Tipo de movimiento</label>
          <select class="fc" id="sc-tipo">${TIPOS_MOV_ESCANER.map((t) => `<option value="${t}">${t}</option>`).join('')}</select>
        </div>
        <div class="frow">
          <div class="fg"><label class="fl">Cantidad</label><input type="number" class="fc" id="sc-cant" value="1" min="1"/></div>
          <div class="fg"><label class="fl">Almacén</label><select class="fc" id="sc-almacen">${almacenOptions}</select></div>
        </div>
        <div class="fg" id="sc-cliente-grp" style="display:none"><label class="fl">Cliente / Colegio</label><input class="fc" id="sc-cliente"/></div>
        <div class="fg"><label class="fl">Responsable</label><input class="fc" id="sc-resp"/></div>

        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost" id="sc-cancelar" style="flex:1">Cancelar</button>
          <button class="btn btn-success" id="sc-guardar" style="flex:2">✅ Registrar y seguir escaneando</button>
        </div>
      </div>`;

    const tipoSel = resultEl.querySelector('#sc-tipo') as HTMLSelectElement;
    const clienteGrp = resultEl.querySelector('#sc-cliente-grp') as HTMLElement;
    const toggleCliente = () => {
      clienteGrp.style.display = tipoSel.value === 'Salida' || tipoSel.value === 'Préstamo' ? '' : 'none';
    };
    tipoSel.addEventListener('change', toggleCliente);
    toggleCliente();

    resultEl.querySelector('#sc-cancelar')?.addEventListener('click', reanudar);

    resultEl.querySelector('#sc-guardar')?.addEventListener('click', async () => {
      const tipo = tipoSel.value as TipoMovimiento;
      const cant = Number((resultEl.querySelector('#sc-cant') as HTMLInputElement).value) || 1;
      const almacen = (resultEl.querySelector('#sc-almacen') as HTMLSelectElement).value;
      const cliente = (resultEl.querySelector('#sc-cliente') as HTMLInputElement)?.value || '';
      const responsable = (resultEl.querySelector('#sc-resp') as HTMLInputElement).value;

      const esSalidaTipo = tipo === 'Salida' || tipo === 'Préstamo' || tipo === 'Fuera de Servicio' || tipo === 'En Reparación';
      const esEntradaTipo = tipo === 'Entrada' || tipo === 'Regreso';

      showLoader('Guardando en GitHub…');
      try {
        await store.mutate((current) => {
          const { db: next } = agregarMovimiento(current, {
            materialId: m.id,
            materialNombre: m.nombre,
            tipo,
            fecha: new Date().toISOString(),
            tipoPaquete: m.tipoPaquete,
            cantPaquetes: cant,
            unidadesPaq: m.unidadesPaq,
            origen: esSalidaTipo ? almacen : '',
            destino: esEntradaTipo || tipo === 'Traspaso' ? almacen : '',
            cliente,
            estado: tipo === 'Fuera de Servicio' ? 'No Disponible' : tipo === 'En Reparación' ? 'En Reparación' : 'Disponible',
            responsable,
            notas: 'Registrado vía escáner QR',
            fechaRegreso: '',
            numSeries: '',
          });
          return next;
        }, `Escáner: ${tipo} de ${m.nombre}`);
        toast(`${tipo} registrada ✓`, 's');
        onChanged();
      } catch (e) {
        toast('Error: ' + (e as Error).message, 'e');
      } finally {
        hideLoader();
      }
    });
  }

  function reanudar() {
    sesionActiva?.pausar(false);
    container.querySelector('#sc-result')!.innerHTML = '';
    statusEl.textContent = 'Apunta al código QR del material…';
  }
}
