// Genera data/*.seed.json a partir de las listas que vivían embebidas en
// Code.gs y recetario.gs. Se ejecuta UNA sola vez (o cuando quieras
// regenerar los datos base desde cero) con: node scripts/generate-seed.mjs
// No se usa en producción — la app en producción lee data/db.json.
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

const MATERIALES_INICIALES = [
  'Extensión','Bocina','Tela negra','Paliacates','Aros','Cono alto','Cono plato',
  'Cuerda de algodón','Pelota de paracaídas','Peluca afro','Plumón','Lona de basta',
  'Pelota inflable yoga','Bandera PG','Tangrams','Cofres','Huellas impresas',
  'Goma y sacapuntas','Lápices','Plumas','Plumones','Pinceles','Pintura',
  'Insect book','Cajas de insectos','Tinaja','Pelota mini','Tubos de pvc',
  'Costal de pelotas','Paracaídas','Listones','Palo de madera','Cinta diurex',
  'Hojas de colores','Aspiradora','Pelota gigante','Balón de basket mini',
  'Baúl vacío','Piezas jenga gigante','Diadema elástica','Pelotas colores',
  'Pollo loco','Frisbee con cuerdas','Tapa con cuerdas','Pelota pequeña',
  'Pieza de espuma','Balón de futbol','Gato gigante','Pelota inflable gigante',
  'Red de pesca','Foamy','Anillo con cuerdas','Palo de escoba','Orugas de colores',
  'Redes','Balones mini de basket','Casacas','Pelota inflable grande',
  'Cuerda naranja','Monedas de chocolate','Pistas de rally','Pluma','Gallitos',
  'Tabla de equilibrio','Bandera de flag','Espagueti','Contenedor con cinturón',
  'Pelota de espuma','Lona stop','Balón de volleyball','Balón de basket/americano',
  'Guantes de portero','Bandera de árbitro','Tarjeta de árbitro','Cuerda de tirolesa',
  'Tarjetas con figuras impresas','Frisbee','Pelota wuiky ball','Tarjetas de yes and no',
  'Bomba de balones','Pelota de tennis','Pantalones','Pelotas de Catch pants',
  'Pelotas de tenis','Proyector','Pollo chillón','Tarjetas de historia',
  'Balón rompehielos','Plumón de pizarrón','Pizarrón','Palitos de colores',
  'Cartas Proyectivas','Preguntas rompehielos','Cartas Choque Eléctrico',
  'Bola de estambre','Plastilina','Tijeras','Palitos de madera','Resorte',
  'Jenga gigante','Resorteras gigantes','Historia de familia izquierdo',
  'Tarjetas Figura Espejo','Pelotas mini','Malla circular','Embudo',
  'Bolsa de harina','Cuentos caja de rescate','Tarjetas La Bomba',
  'Laberinto suspendido','Dado gigante','Preguntas de maratón','Lona de maratón',
  'Catsup mostaza gel espuma','Platos de cartón','Caja de Mistery Box','Playerotas',
  'Papel kraft','Plantbook','Tarjetas de Preguntas de Sobremesa',
  'Tarjetas de Reino Animal','Mochila de disfraces','Estambre',
  'Toco Soco Loco Impreso','Hojas de papel','Pinturas','Brillantina','Stickers',
  'Pegamento silicón líquido','Pritt','Resorte de pulseras','Máscara base',
  'Pinturas caballito','Ligas','Palito de bombón','Blancos de metal','Globos',
  'Diábolos','Rifle','Resortera','Flechas','Arco','Block de tiro',
  'Botella de agua vacía','Corchos','Válvula y bomba para balones',
  'Papel china o crepé','Bowl de metal','Cucharas desechables minis','Leche',
  'Media crema','Vainilla','Azúcar','Sal de grano','Vasos desechables minis',
  'Bolsa Ziploc','Chispa de colores','Lechera','Hielo','Cuentas de colores',
  'Argollas','Base de pay','Leche evaporada','Limones','Galletas María',
  'Colorante','Gorro de chef','Plumón pintacaritas','Vaso de plástico',
  'Exprimidor','Cuchillo de plástico','Tabla de madera','Cotonetes','Cloro',
  'Portarretratos','Diamantina','Caja de cuentas','Círculo de cartón',
  'Hilos de colores','Encendedor','Huevo','Tapete de madera','Alga nori',
  'Pepino','Zanahoria','Salsa de soya','Arroz','Cuchara de metal','Pelador',
  'Cuchillo de sierra','Platos de plástico','Forritos de chamoy','Manzana',
  'Miguelito','Lata de espuma','Bolsa de Holly','Tinajas','Esponjas',
  'Telas de volley toalla','Porterías armables','Bomba y válvula para balones',
  'Pelota Waterpolo','Salvavidas inflable','Bomba de globos','Resbalín',
  'Tubos de pvc con agujeros','Paddle board','Remos','Chaleco Salvavidas',
  'Bomba para inflar','Linterna','Cyalumes','Tinaja de agua','Pistola de agua',
  'Bombones','Material reciclado','Cerillos','Ocote','Leña','Computadora',
  'Palomitas','Micrófono','Casa de campaña'
];

const ALMACENES_DEFAULT = ['Matriz', 'Rancho A', 'Rancho B'];

const catalogo = MATERIALES_INICIALES.map((mat, i) => ({
  id: 'MAT-' + String(i + 1).padStart(4, '0'),
  nombre: mat,
  tipoPaquete: 'Pieza Única',
  unidadesPaq: 1,
  descripcion: '',
  fotoUrl: '',
  fechaAlta: new Date().toISOString(),
  activo: true,
  rack: '',
  seccion: '',
  zona: '',
  tieneNumSerie: false,
  stockMin: null,
  stockMax: null,
  costoUnidad: null,
  clasificacion: 'Consumible',
  costoUso: null,
  tdeValor: null,
  tdeUnidad: '',
  provPrincipal: '',
  provAlt1: '',
  provAlt2: '',
  provAlt3: '',
}));

const almacenes = ALMACENES_DEFAULT.map((a, i) => ({
  id: 'ALM-' + String(i + 1).padStart(2, '0'),
  nombre: a,
  ubicacion: '',
  activo: true,
  descripcion: '',
}));

writeFileSync(path.join(dataDir, 'catalogo.seed.json'), JSON.stringify(catalogo, null, 2));
writeFileSync(path.join(dataDir, 'almacenes.seed.json'), JSON.stringify(almacenes, null, 2));

console.log(`✓ ${catalogo.length} materiales, ${almacenes.length} almacenes generados en /data`);
