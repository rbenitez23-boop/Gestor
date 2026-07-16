import QRCode from 'qrcode';

/** Genera un QR como data URL (PNG) a partir de un texto — usado para el ID de cada material. */
export async function generarQrDataUrl(texto: string, size = 240): Promise<string> {
  return QRCode.toDataURL(texto, {
    width: size,
    margin: 1,
    color: { dark: '#1A2332', light: '#FFFFFF' },
    errorCorrectionLevel: 'M',
  });
}
