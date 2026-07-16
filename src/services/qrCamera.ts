import jsQR from 'jsqr';

export interface SesionCamara {
  detener: () => void;
  pausar: (v: boolean) => void;
}

/**
 * Inicia la cámara trasera y llama a `onDetectado(codigo)` cada vez que
 * reconoce un QR — sigue escaneando después de cada detección (quien
 * llama decide si pausar con `sesion.pausar(true)`, típicamente mientras
 * muestra un formulario de confirmación). SIEMPRE hay que llamar a
 * `detener()` al salir de la pantalla que la usa.
 */
export async function iniciarCamaraQr(
  video: HTMLVideoElement,
  onDetectado: (codigo: string) => void
): Promise<SesionCamara> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  video.srcObject = stream;
  await video.play();

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let pausado = false;
  let rafId = 0;

  function tick() {
    if (!pausado && video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code && code.data) onDetectado(code.data);
    }
    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);

  return {
    detener: () => {
      cancelAnimationFrame(rafId);
      stream.getTracks().forEach((t) => t.stop());
    },
    pausar: (v: boolean) => {
      pausado = v;
    },
  };
}
