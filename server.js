const path = require('path');
const express = require('express');
const envio = require('./src/envio');
const recursos = require('./src/recursos');
const sesion = require('./src/sesion');
const plantilla = require('./src/plantilla');
const { prefijoDe, conPrefijo } = require('./src/ruta');

const PUBLICO = path.join(__dirname, 'public');
const app = express();

app.disable('x-powered-by');
// Delante van Nginx Proxy Manager y la entrada del entorno.
app.set('trust proxy', Number(process.env.MAIL_PROXIES) || 2);

// Bajo /mail/ o en la raíz de un dominio: ver src/ruta.js.
app.use((req, res, next) => {
  req.prefijo = prefijoDe(req);
  const redirigir = res.redirect.bind(res);
  res.redirect = function (status, url) {
    if (url === undefined) { url = status; status = 302; }
    return redirigir(status, conPrefijo(req.prefijo, url));
  };
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
  next();
});

app.get(['/version', '/version/'], (req, res) => res.json({ version: process.env.APP_VERSION || 'local' }));

// Ficheros públicos: el logo de la marca y las imágenes de los correos.
app.use('/marca', express.static(path.join(PUBLICO, 'marca'), { redirect: false, maxAge: '7d' }));
app.get('/r/:nombre', (req, res) => {
  const f = recursos.fichero(req.params.nombre);
  if (!f) return res.status(404).end();
  res.set({ 'Content-Type': f.tipo, 'Cache-Control': 'public, max-age=86400' });
  res.sendFile(f.ruta);
});

// Las imágenes viajan en base64 dentro del JSON.
app.use('/api/admin/recursos', express.json({ limit: '12mb' }));
app.use(express.json({ limit: '300kb' }));
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'DELETE' && !req.is('application/json')) {
    return res.status(415).json({ error: 'Solo JSON.' });
  }
  next();
});

// ── lo que usan las demás apps (con su llave) ──────────────────────────────

const conLlave = (fn) => async (req, res, next) => {
  try {
    const llave = envio.appDeLlave(req);
    res.json(await fn(llave, req.body || {}));
  } catch (e) { next(e); }
};

app.post('/api/enviar', conLlave((llave, datos) => envio.enviar(llave.app, llave.remitente, datos)));
app.post('/api/vista', conLlave((llave, datos) => plantilla.componer(datos)));

// ── la pantalla (IT, con Keycloak) ─────────────────────────────────────────

app.use('/css', express.static(path.join(PUBLICO, 'css'), { redirect: false }));
app.get('/login', (req, res) => (sesion.usuario(req) ? res.redirect('/') : sesion.irAKeycloak(req, res)));
app.get('/sso', (req, res, next) => sesion.vuelta(req, res).catch(next));

const requiere = (req, res, next) => {
  const u = sesion.usuario(req);
  if (!u) return req.originalUrl.startsWith('/api/')
    ? res.status(401).json({ error: 'Vuelve a entrar.' })
    : res.redirect('/login');
  req.usuario = u;
  next();
};

const admin = express.Router();
admin.get('/yo', (req, res) => res.json({
  usuario: req.usuario, resendActivo: envio.activo(), remitente: envio.REMITENTE(), dominio: envio.dominioPermitido(),
  base: (req.protocol + '://' + req.get('host') + req.prefijo)
}));
admin.get('/envios', (req, res) => res.json(envio.envios(req.query)));
admin.get('/envios/:id', (req, res) => {
  const e = envio.envio(req.params.id);
  return e ? res.json(e) : res.status(404).json({ error: 'No existe.' });
});
admin.get('/llaves', (req, res) => res.json(envio.llaves()));
admin.post('/llaves', (req, res) => res.json({ llave: envio.crearLlave(req.body.app, req.body.remitente) }));
admin.delete('/llaves/:id', (req, res) => { envio.revocar(req.params.id); res.json({ ok: true }); });
admin.get('/recursos', (req, res) => res.json(recursos.lista()));
admin.post('/recursos', (req, res) => res.json({ nombre: recursos.guardar(req.body.nombre, req.body.datos) }));
admin.delete('/recursos/:nombre', (req, res) => { recursos.borrar(req.params.nombre); res.json({ ok: true }); });
admin.post('/vista', (req, res) => res.json(plantilla.componer(req.body || {})));
admin.post('/probar', async (req, res, next) => {
  try { res.json(await envio.enviar('mail', '', req.body || {})); } catch (e) { next(e); }
});
admin.post('/salir', (req, res) => {
  sesion.cerrar(req, res);
  const sso = require('./src/sso');
  res.json({ salir: sso.activo() ? sso.urlLogout(req) : 'login' });
});
app.use('/api/admin', requiere, admin);

app.use('/js', requiere, express.static(path.join(PUBLICO, 'js'), { redirect: false }));
app.get('/', requiere, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(PUBLICO, 'index.html'));
});

app.use((req, res) => res.status(404).json({ error: 'No encontrado.' }));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'El JSON no se entiende.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Demasiado grande.' });
  const status = err.status || 500;
  if (status >= 500 && status !== 502) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Error interno.' : err.message, ...(err.id ? { id: err.id } : {}) });
});

if (require.main === module) {
  const puerto = Number(process.env.PORT) || 3000;
  app.listen(puerto, () => console.log('Mail escuchando en el puerto ' + puerto + (envio.activo() ? '' : ' (sin RESEND_API_KEY: no envía)')));
}

module.exports = app;
