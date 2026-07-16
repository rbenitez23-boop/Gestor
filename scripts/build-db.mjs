// Ensambla data/db.json — el ÚNICO archivo que la app lee/escribe en
// producción — a partir de los seeds generados. Se corre una sola vez al
// inicializar el repo. Después de eso, db.json se actualiza solo desde la
// app misma (vía la GitHub Contents API), nunca se vuelve a correr esto
// a menos que quieras resetear todo desde cero.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'db.json');

if (existsSync(dbPath)) {
  console.log('⚠ data/db.json ya existe — no se sobreescribe. Bórralo a mano si quieres regenerarlo desde cero.');
  process.exit(0);
}

const read = (f) => JSON.parse(readFileSync(path.join(dataDir, f), 'utf-8'));

const EXCEPCIONES_PROGRAMA_DEFAULT = [
  'Llegada', 'Salida', 'Bienvenida', 'Despedida', 'Cierre',
  'Comida', 'Desayuno', 'Cena', 'Merienda', 'Colación', 'Refrigerio',
  'Baño', 'Aseo personal', 'Aseo', 'Higiene', 'Regadera', 'Ducha',
  'Lavado de manos', 'Lavarse las manos', 'Lavarse manos',
  'Descanso', 'Receso', 'Siesta', 'Hora libre', 'Tiempo libre', 'Actividad libre',
  'Traslado', 'Transporte', 'Autobús', 'Camión', 'Camioneta',
  'Formación', 'Pase de lista', 'Junta de staff', 'Reunión de staff',
  'Empacar', 'Desempacar', 'Cambio de ropa', 'Inspección de cabañas',
  'Oración', 'Devocional', 'Reflexión',
];

// PIN por default '1234' — se guarda como hash SHA-256, nunca en texto
// plano. Cámbialo desde la app en cuanto la despliegues (Remisiones
// Contables → Cambiar PIN).
const sha256 = (s) => createHash('sha256').update(s, 'utf-8').digest('hex');

const db = {
  version: 1,
  materiales: read('catalogo.seed.json'),
  movimientos: [],
  almacenes: read('almacenes.seed.json'),
  remisiones: [],
  proveedores: [],
  recetario: read('recetario.seed.json'),
  materialesObligatorios: read('materialesObligatorios.seed.json'),
  aliasMateriales: {},
  aliasActividades: read('aliasActividades.seed.json'),
  excepcionesPrograma: EXCEPCIONES_PROGRAMA_DEFAULT,
  contablePinHash: sha256('1234'),
  uiConfig: {},
};

writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log(`✓ data/db.json creado — ${db.materiales.length} materiales, ${Object.keys(db.recetario).length} actividades. PIN inicial: 1234 (cámbialo en cuanto despliegues).`);
