// La API de punta a punta, con un Resend de mentira: llaves, envío, registro,
// límites, imágenes y la pantalla en modo local.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mail-'));
process.env.MAIL_DATOS = dir;
process.env.RESEND_API_KEY = 're_prueba';
process.env.MAIL_REMITENTE = 'Henry Arce <soporte@ejemplo.com>';

const recibidos = [];
let resendFalla = false;
const resend = http.createServer((req, res) => {
  let cuerpo = '';
  req.on('data', d => { cuerpo += d; });
  req.on('end', () => {
    if (resendFalla) { res.writeHead(422); return res.end('{"message":"no"}'); }
    recibidos.push({ auth: req.headers.authorization, datos: JSON.parse(cuerpo) });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"id":"re_123"}');
  });
});

(async () => {
  await new Promise(r => resend.listen(0, r));
  process.env.RESEND_URL = 'http://127.0.0.1:' + resend.address().port + '/emails';
  const app = require('../server');
  const srv = app.listen(0);
  await new Promise(r => srv.on('listening', r));
  const url = 'http://127.0.0.1:' + srv.address().port;

  const pedir = async (metodo, ruta, cuerpo, cab) => {
    const r = await fetch(url + ruta, {
      method: metodo,
      headers: { ...(cuerpo ? { 'Content-Type': 'application/json' } : {}), ...(cab || {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined
    });
    const t = await r.text();
    let j; try { j = JSON.parse(t); } catch (e) { j = t; }
    return { status: r.status, j };
  };

  assert.deepStrictEqual((await pedir('GET', '/version/')).j, { version: 'local' });

  // Sin llave, o con una inventada, no se envía.
  assert.strictEqual((await pedir('POST', '/api/enviar', { para: 'a@b.com', asunto: 'x', mensaje: 'y' })).status, 401);
  assert.strictEqual((await pedir('POST', '/api/enviar', { para: 'a@b.com', asunto: 'x', mensaje: 'y' }, { Authorization: 'Bearer ml_inventadainventadainventada' })).status, 401);

  // Llaves: el remitente tiene que ser del dominio verificado.
  assert.strictEqual((await pedir('POST', '/api/admin/llaves', { app: 'soporte', remitente: 'Otro <x@otro.com>' })).status, 400);
  assert.strictEqual((await pedir('POST', '/api/admin/llaves', { app: 'Soporte!' })).status, 400);
  const { j: { llave } } = await pedir('POST', '/api/admin/llaves', { app: 'soporte', remitente: 'Henry Arce · Soporte <soporte@ejemplo.com>' });
  assert.ok(/^ml_/.test(llave));
  const conLlave = { Authorization: 'Bearer ' + llave };

  // Envío correcto.
  const ok = await pedir('POST', '/api/enviar', {
    para: ['cliente@ejemplo.org'], asunto: 'Demo', responder_a: 'henry@ejemplo.com',
    bloques: [{ tipo: 'titulo', texto: 'Mira' }, { tipo: 'video', gif: 'https://a.com/d.gif', url: 'https://youtu.be/x' }]
  }, conLlave);
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.j));
  assert.strictEqual(ok.j.enviado, true);
  const enviado = recibidos.pop();
  assert.strictEqual(enviado.auth, 'Bearer re_prueba');
  assert.strictEqual(enviado.datos.from, 'Henry Arce · Soporte <soporte@ejemplo.com>');
  assert.deepStrictEqual(enviado.datos.to, ['cliente@ejemplo.org']);
  assert.strictEqual(enviado.datos.reply_to, 'henry@ejemplo.com');
  assert.ok(enviado.datos.html.includes('d.gif') && enviado.datos.text.includes('youtu.be'));

  // Datos malos: 400 y nada a Resend.
  assert.strictEqual((await pedir('POST', '/api/enviar', { para: 'no-es-correo', asunto: 'x', mensaje: 'y' }, conLlave)).status, 400);
  assert.strictEqual((await pedir('POST', '/api/enviar', { para: 'a@b.com', asunto: 'x', bloques: [{ tipo: 'boton', texto: 'a', url: 'javascript:x' }] }, conLlave)).status, 400);
  assert.strictEqual(recibidos.length, 0);

  // Si Resend lo rechaza: 502, y queda anotado como fallido.
  resendFalla = true;
  const fallo = await pedir('POST', '/api/enviar', { para: 'a@b.com', asunto: 'Falla', mensaje: 'y' }, conLlave);
  resendFalla = false;
  assert.strictEqual(fallo.status, 502);
  assert.ok(fallo.j.id);

  // Vista sin enviar.
  const vista = await pedir('POST', '/api/vista', { asunto: 'V', mensaje: 'hola' }, conLlave);
  assert.ok(vista.j.html.includes('hola'));

  // Registro.
  const lista = (await pedir('GET', '/api/admin/envios')).j;
  assert.deepStrictEqual(lista.map(e => e.estado), ['fallido', 'enviado']);
  assert.strictEqual((await pedir('GET', '/api/admin/envios?app=otra')).j.length, 0);
  assert.ok((await pedir('GET', '/api/admin/envios/' + lista[1].id)).j.html.includes('d.gif'));

  // Revocar.
  const llaves = (await pedir('GET', '/api/admin/llaves')).j;
  await pedir('DELETE', '/api/admin/llaves/' + llaves[0].id);
  assert.strictEqual((await pedir('POST', '/api/enviar', { para: 'a@b.com', asunto: 'x', mensaje: 'y' }, conLlave)).status, 401);

  // Límite por minuto.
  const { j: { llave: otra } } = await pedir('POST', '/api/admin/llaves', { app: 'tareas' });
  let ultimo;
  for (let i = 0; i < 31; i++) ultimo = await pedir('POST', '/api/vista', { asunto: 'x', mensaje: 'y' }, { Authorization: 'Bearer ' + otra });
  assert.strictEqual(ultimo.status, 429);

  // Imágenes: se comprueba que lo son, y se sirven en público.
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  const sub = await pedir('POST', '/api/admin/recursos', { nombre: 'Demo Facturación.GIF', datos: gif.toString('base64') });
  assert.strictEqual(sub.j.nombre, 'demo-facturacion.gif');
  assert.strictEqual((await pedir('POST', '/api/admin/recursos', { nombre: 'falso.png', datos: gif.toString('base64') })).status, 400);
  assert.strictEqual((await pedir('POST', '/api/admin/recursos', { nombre: '../../x.gif', datos: gif.toString('base64') })).j.nombre, 'x.gif');
  const r = await fetch(url + '/r/demo-facturacion.gif');
  assert.strictEqual(r.headers.get('content-type'), 'image/gif');
  assert.strictEqual((await fetch(url + '/r/..%2Fmail.db')).status, 404);

  // Solo JSON en la API (un formulario de otra web no cuela).
  const form = await fetch(url + '/api/admin/llaves', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'app=x' });
  assert.strictEqual(form.status, 415);

  srv.close();
  resend.close();
  console.log('api: bien');
})().catch(e => { console.error(e); process.exit(1); });
