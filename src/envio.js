// Enviar por Resend y dejarlo anotado. Las apps llaman con su llave; la llave
// dice qué app es y con qué remitente sale.

const crypto = require('crypto');
const { bd, ahora } = require('./bd');
const plantilla = require('./plantilla');

const CLAVE = () => process.env.RESEND_API_KEY || '';
const REMITENTE = () => process.env.MAIL_REMITENTE || 'Henry Arce <soporte@luiscontacto03.com>';
const MAX_DESTINATARIOS = 50;
const POR_MINUTO = 30;
// Adjuntos: Resend admite hasta 40 MB por correo; aquí bastante menos, que el
// JSON viaja entero en memoria.
const MAX_ADJUNTOS = 5;
const MAX_BYTES_ADJUNTOS = 10 * 1024 * 1024;
// Lo que los programas de correo suelen bloquear o marcar como peligroso.
const EXTENSION_PROHIBIDA = /\.(exe|bat|cmd|com|scr|pif|js|jse|vbs|vbe|msi|ps1|jar|lnk|hta|cpl|dll|reg|sh)$/i;

const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

function error(mensaje, status) {
  return Object.assign(new Error(mensaje), { status: status || 400 });
}

const hash = (llave) => crypto.createHash('sha256').update(llave).digest('hex');

// El dominio desde el que se puede enviar es el del remitente por defecto (el
// que está verificado en Resend).
function dominioPermitido() {
  const m = REMITENTE().match(/@([^>\s]+)>?\s*$/);
  return m ? m[1].toLowerCase() : '';
}

function remitenteValido(r) {
  if (!r) return true;
  const m = String(r).match(/^([^<>"\r\n]{0,80})<([^<>\s]+)>$|^([^<>\s]+)$/);
  const email = m && (m[2] || m[3]);
  return !!email && EMAIL.test(email) && email.toLowerCase().endsWith('@' + dominioPermitido());
}

// ── llaves ────────────────────────────────────────────────────────────────

function crearLlave(app, remitente) {
  app = String(app || '').trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,39}$/.test(app)) throw error('Nombre de app: minúsculas, números, punto o guion (como su ruta: soporte, tareas…).');
  remitente = String(remitente || '').trim();
  if (!remitenteValido(remitente)) throw error('Remitente: «Nombre <algo@' + dominioPermitido() + '>», del dominio verificado.');
  const llave = 'ml_' + crypto.randomBytes(24).toString('base64url');
  bd.prepare('INSERT INTO llave (app, hash, remitente, creada) VALUES (?, ?, ?, ?)').run(app, hash(llave), remitente, ahora());
  return llave;
}

function llaves() {
  return bd.prepare('SELECT id, app, remitente, creada, usada, revocada FROM llave ORDER BY revocada IS NOT NULL, app, id').all();
}

function revocar(id) {
  bd.prepare('UPDATE llave SET revocada = ? WHERE id = ? AND revocada IS NULL').run(ahora(), Number(id));
}

const ventanas = new Map();

// La app que llama, según la cabecera Authorization: Bearer <llave>.
function appDeLlave(req) {
  const m = String(req.headers.authorization || '').match(/^Bearer\s+(ml_[A-Za-z0-9_-]{20,})$/);
  if (!m) throw error('Falta la llave (Authorization: Bearer ml_…).', 401);
  const fila = bd.prepare('SELECT id, app, remitente FROM llave WHERE hash = ? AND revocada IS NULL').get(hash(m[1]));
  if (!fila) throw error('Llave no válida o revocada.', 401);

  const minuto = Math.floor(Date.now() / 60000);
  const v = ventanas.get(fila.id);
  const usados = v && v.minuto === minuto ? v.usados + 1 : 1;
  ventanas.set(fila.id, { minuto, usados });
  if (usados > POR_MINUTO) throw error('Demasiados envíos seguidos: espera un minuto.', 429);

  bd.prepare('UPDATE llave SET usada = ? WHERE id = ?').run(ahora(), fila.id);
  return fila;
}

// ── enviar ────────────────────────────────────────────────────────────────

function destinatarios(para) {
  const lista = (Array.isArray(para) ? para : String(para || '').split(/[,;]/)).map(p => String(p).trim()).filter(Boolean);
  if (!lista.length) throw error('para: falta el destinatario.');
  if (lista.length > MAX_DESTINATARIOS) throw error('para: como mucho ' + MAX_DESTINATARIOS + ' direcciones.');
  const mala = lista.find(p => !EMAIL.test(p) || p.length > 200);
  if (mala) throw error('para: «' + mala.slice(0, 80) + '» no es un correo válido.');
  return lista;
}

// [{ nombre, contenido (base64) }] -> la lista para Resend y los nombres para el registro.
function adjuntosDe(lista) {
  if (lista == null) return [];
  if (!Array.isArray(lista)) throw error('adjuntos: tiene que ser una lista.');
  if (lista.length > MAX_ADJUNTOS) throw error('adjuntos: como mucho ' + MAX_ADJUNTOS + '.');
  let total = 0;
  return lista.map((a, i) => {
    const nombre = String((a && a.nombre) || '').trim();
    if (!nombre || nombre.length > 150 || /[\\/\r\n\0<>:"|?*]/.test(nombre) || !/\.[A-Za-z0-9]{1,8}$/.test(nombre)) {
      throw error('adjuntos[' + i + ']: el nombre tiene que ser un fichero con extensión (factura.pdf), sin barras.');
    }
    if (EXTENSION_PROHIBIDA.test(nombre)) throw error('adjuntos[' + i + ']: ese tipo de fichero no se envía.');
    const contenido = String((a && a.contenido) || '').replace(/\s+/g, '');
    if (!contenido || !/^[A-Za-z0-9+/]+={0,2}$/.test(contenido)) throw error('adjuntos[' + i + ']: el contenido tiene que ir en base64.');
    total += Buffer.byteLength(contenido, 'base64');
    if (total > MAX_BYTES_ADJUNTOS) throw error('adjuntos: entre todos, como mucho ' + (MAX_BYTES_ADJUNTOS / 1024 / 1024) + ' MB.');
    return { filename: nombre, content: contenido };
  });
}

async function llamarResend(cuerpo) {
  try {
    const r = await fetch(process.env.RESEND_URL || 'https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + CLAVE(), 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(15000)
    });
    const texto = await r.text();
    if (!r.ok) {
      console.error('Resend rechaza el envío (' + r.status + '): ' + texto.slice(0, 300));
      return { ok: false, motivo: 'Resend lo ha rechazado (' + r.status + ').' };
    }
    let id = '';
    try { id = JSON.parse(texto).id || ''; } catch (e) { /* sin id */ }
    return { ok: true, id };
  } catch (e) {
    console.error('No se ha podido llamar a Resend: ' + e.message);
    return { ok: false, motivo: 'No se ha podido conectar con Resend.' };
  }
}

// datos: { para, asunto, bloques | mensaje (+ boton), pie?, responder_a?, adjuntos? }
async function enviar(app, remitente, datos) {
  const para = destinatarios(datos.para);
  const adjuntos = adjuntosDe(datos.adjuntos);
  const correo = plantilla.componer(datos);
  let responder = '';
  if (datos.responder_a) {
    responder = String(datos.responder_a).trim();
    if (!EMAIL.test(responder)) throw error('responder_a: no es un correo válido.');
  }

  const resultado = CLAVE()
    ? await llamarResend({
      from: remitente || REMITENTE(), to: para, subject: correo.asunto, html: correo.html, text: correo.texto,
      ...(responder ? { reply_to: responder } : {}),
      ...(adjuntos.length ? { attachments: adjuntos } : {})
    })
    : { ok: false, motivo: 'Falta RESEND_API_KEY: no se envía nada.' };

  // Del adjunto se anota solo el nombre: el fichero no se guarda.
  const info = bd.prepare('INSERT INTO envio (app, para, asunto, estado, motivo, resend_id, html, adjuntos, creado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(app, para.join(', '), correo.asunto, resultado.ok ? 'enviado' : 'fallido', resultado.motivo || '', resultado.id || '', correo.html,
      adjuntos.map(a => a.filename).join(', '), ahora());

  if (!resultado.ok) throw Object.assign(error(resultado.motivo, 502), { id: Number(info.lastInsertRowid) });
  return { id: Number(info.lastInsertRowid), enviado: true };
}

function envios(filtro) {
  const q = '%' + String(filtro.q || '').trim() + '%';
  const app = String(filtro.app || '').trim();
  return bd.prepare(
    'SELECT id, app, para, asunto, estado, motivo, creado FROM envio WHERE (? = \'\' OR app = ?) AND (para LIKE ? OR asunto LIKE ?) ORDER BY id DESC LIMIT 200'
  ).all(app, app, q, q);
}

const envio = (id) => bd.prepare('SELECT * FROM envio WHERE id = ?').get(Number(id));

const activo = () => !!CLAVE();

module.exports = { crearLlave, llaves, revocar, appDeLlave, enviar, envios, envio, remitenteValido, dominioPermitido, activo, REMITENTE };
