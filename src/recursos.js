// Imágenes y GIF que usan los correos. Los programas de correo solo cargan
// imágenes de una dirección pública, así que se sirven en <app>/r/<nombre>.

const fs = require('fs');
const path = require('path');
const { DATOS } = require('./bd');

const DIR = path.join(DATOS, 'recursos');
fs.mkdirSync(DIR, { recursive: true });

const TIPOS = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
const MAX_BYTES = 8 * 1024 * 1024;
const NOMBRE = /^[a-z0-9][a-z0-9._-]{0,79}\.(png|jpe?g|gif|webp)$/;

function error(mensaje) {
  return Object.assign(new Error(mensaje), { status: 400 });
}

// "Demo Facturación.GIF" -> "demo-facturacion.gif"
function limpiar(nombre) {
  return String(nombre || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+/, '').replace(/-+/g, '-');
}

// Comprueba por los primeros bytes que el fichero es de verdad la imagen que dice.
function esImagen(buf, ext) {
  const ini = buf.subarray(0, 12);
  if (ext === 'png') return ini.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (ext === 'jpg' || ext === 'jpeg') return ini[0] === 0xff && ini[1] === 0xd8;
  if (ext === 'gif') return ini.subarray(0, 4).toString('latin1') === 'GIF8';
  if (ext === 'webp') return ini.subarray(0, 4).toString('latin1') === 'RIFF' && ini.subarray(8, 12).toString('latin1') === 'WEBP';
  return false;
}

function guardar(nombre, base64) {
  const n = limpiar(nombre);
  if (!NOMBRE.test(n)) throw error('Nombre: PNG, JPG, GIF o WEBP, con letras, números o guiones.');
  const buf = Buffer.from(String(base64 || ''), 'base64');
  if (!buf.length) throw error('El fichero está vacío.');
  if (buf.length > MAX_BYTES) throw error('Como mucho 8 MB (para un GIF en el móvil, mejor 3-4 MB).');
  if (!esImagen(buf, n.split('.').pop())) throw error('El fichero no es la imagen que dice su nombre.');
  fs.writeFileSync(path.join(DIR, n), buf);
  return n;
}

function lista() {
  return fs.readdirSync(DIR).filter(n => NOMBRE.test(n)).map(n => {
    const st = fs.statSync(path.join(DIR, n));
    return { nombre: n, bytes: st.size, fecha: st.mtime.toISOString() };
  }).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

function borrar(nombre) {
  if (!NOMBRE.test(String(nombre))) throw error('Nombre no válido.');
  fs.rmSync(path.join(DIR, nombre), { force: true });
}

// Para servirlo: { ruta, tipo } o null.
function fichero(nombre) {
  if (!NOMBRE.test(String(nombre))) return null;
  const ruta = path.join(DIR, nombre);
  return fs.existsSync(ruta) ? { ruta, tipo: TIPOS[nombre.split('.').pop()] } : null;
}

module.exports = { guardar, lista, borrar, fichero, limpiar };
