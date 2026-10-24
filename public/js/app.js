'use strict';

const $ = (id) => document.getElementById(id);
let base = '';

async function api(metodo, ruta, cuerpo) {
  const r = await fetch('api/admin' + ruta, {
    method: metodo,
    headers: cuerpo ? { 'Content-Type': 'application/json' } : {},
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  if (r.status === 401) { location.href = 'login'; throw new Error('Vuelve a entrar.'); }
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.error || 'Error ' + r.status);
  return datos;
}

function aviso(texto, ok) {
  const a = $('aviso');
  a.textContent = texto;
  a.classList.toggle('ok', !!ok);
  a.classList.toggle('hidden', !texto);
  if (texto) setTimeout(() => { if (a.textContent === texto) a.classList.add('hidden'); }, 6000);
}

const fecha = (iso) => iso ? new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—';

function celda(fila, texto, clase) {
  const td = document.createElement('td');
  td.textContent = texto;
  if (clase) td.className = clase;
  fila.appendChild(td);
  return td;
}

// ── pestañas ──────────────────────────────────────────────────────────────

const cargas = { enviados: cargarEnvios, imagenes: cargarImagenes, llaves: cargarLlaves, redactar: vistaPrevia };

document.querySelectorAll('#pestanas button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('#pestanas button').forEach(x => x.classList.toggle('activa', x === b));
  document.querySelectorAll('main > section').forEach(s => s.classList.toggle('hidden', s.id !== 'p-' + b.dataset.p));
  cargas[b.dataset.p]().catch(e => aviso(e.message));
}));

// ── enviados ──────────────────────────────────────────────────────────────

async function cargarEnvios() {
  const q = new URLSearchParams({ q: $('buscar').value, app: $('filtroApp').value });
  const filas = await api('GET', '/envios?' + q);
  const cuerpo = $('listaEnvios');
  cuerpo.replaceChildren();
  filas.forEach(e => {
    const tr = document.createElement('tr');
    celda(tr, fecha(e.creado));
    celda(tr, e.app);
    celda(tr, e.para);
    celda(tr, e.asunto);
    celda(tr, e.estado === 'enviado' ? 'Enviado' : 'Falló: ' + e.motivo, 'estado-' + e.estado);
    tr.addEventListener('click', () => verEnvio(e.id).catch(err => aviso(err.message)));
    cuerpo.appendChild(tr);
  });
  if (!filas.length) {
    const tr = document.createElement('tr');
    celda(tr, 'Todavía no hay nada enviado.').colSpan = 5;
    cuerpo.appendChild(tr);
  }
  const apps = [...new Set(filas.map(f => f.app))];
  const sel = $('filtroApp');
  apps.filter(a => ![...sel.options].some(o => o.value === a)).forEach(a => sel.add(new Option(a, a)));
}

async function verEnvio(id) {
  const e = await api('GET', '/envios/' + id);
  $('verAsunto').textContent = e.asunto;
  $('verDatos').textContent = fecha(e.creado) + ' · ' + e.app + ' → ' + e.para + (e.adjuntos ? ' · adjuntos: ' + e.adjuntos : '') + (e.motivo ? ' · ' + e.motivo : '');
  $('verHtml').srcdoc = e.html;
  $('verEnvio').classList.remove('hidden');
  $('verEnvio').scrollIntoView({ behavior: 'smooth' });
}

$('cerrarEnvio').addEventListener('click', () => $('verEnvio').classList.add('hidden'));
let espera;
$('buscar').addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(() => cargarEnvios().catch(e => aviso(e.message)), 300); });
$('filtroApp').addEventListener('change', () => cargarEnvios().catch(e => aviso(e.message)));

// ── redactar ──────────────────────────────────────────────────────────────

// Campos de cada tipo de bloque: [clave, etiqueta, multilínea]
const CAMPOS = {
  titulo: [['texto', 'Título']],
  texto: [['texto', 'Texto (línea en blanco = párrafo; «- » = lista; **negrita**)', true]],
  boton: [['texto', 'Texto del botón'], ['url', 'Dirección https://…']],
  imagen: [['url', 'Imagen https://… (sube la tuya en Imágenes)'], ['alt', 'Descripción'], ['enlace', 'Enlace al pulsarla (opcional)']],
  video: [['gif', 'GIF animado https://…'], ['url', 'Vídeo completo https://…'], ['texto', 'Texto del enlace (opcional)']],
  capacidades: [['items', 'Una por línea: icono | título | texto (el icono puede ser un emoji o una dirección)', true]],
  nota: [['texto', 'Nota en letra pequeña', true]],
  separador: []
};
const NOMBRES = { titulo: 'Título', texto: 'Texto', boton: 'Botón', imagen: 'Imagen', video: 'Vídeo (GIF)', capacidades: 'Capacidades', nota: 'Nota', separador: 'Separador' };

let bloques = [
  { tipo: 'titulo', texto: 'Hola' },
  { tipo: 'texto', texto: 'Escribe aquí tu mensaje.' }
];

// Lo que se manda: las capacidades pasan de texto a tarjetas.
function bloquesParaEnviar() {
  return bloques.map(b => {
    if (b.tipo !== 'capacidades') return b;
    const items = String(b.items || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const p = l.split('|').map(x => x.trim());
      if (p.length === 1) return { titulo: p[0] };
      if (p.length === 2) return { titulo: p[0], texto: p[1] };
      return { icono: p[0], titulo: p[1], texto: p.slice(2).join(' | ') };
    });
    return { tipo: 'capacidades', items };
  });
}

function correoActual() {
  const c = { asunto: $('rAsunto').value || 'Asunto', bloques: bloquesParaEnviar() };
  if ($('rPie').value.trim()) c.pie = $('rPie').value.trim();
  return c;
}

function pintarBloques() {
  const cont = $('bloques');
  cont.replaceChildren();
  bloques.forEach((b, i) => {
    const caja = document.createElement('div');
    caja.className = 'bloque';
    const cab = document.createElement('div');
    cab.className = 'bloque-cab';
    cab.append(NOMBRES[b.tipo]);
    const hueco = document.createElement('span');
    hueco.className = 'hueco';
    cab.append(hueco);
    [['↑', -1], ['↓', 1]].forEach(([s, d]) => {
      const bt = document.createElement('button');
      bt.textContent = s;
      bt.disabled = i + d < 0 || i + d >= bloques.length;
      bt.addEventListener('click', () => { [bloques[i], bloques[i + d]] = [bloques[i + d], bloques[i]]; pintarBloques(); vistaPrevia(); });
      cab.append(bt);
    });
    const quitar = document.createElement('button');
    quitar.textContent = 'Quitar';
    quitar.className = 'peligro';
    quitar.addEventListener('click', () => { bloques.splice(i, 1); pintarBloques(); vistaPrevia(); });
    cab.append(quitar);
    caja.append(cab);

    CAMPOS[b.tipo].forEach(([clave, etiqueta, largo]) => {
      const l = document.createElement('label');
      l.textContent = etiqueta;
      const campo = document.createElement(largo ? 'textarea' : 'input');
      campo.value = b[clave] || '';
      campo.addEventListener('input', () => { b[clave] = campo.value; programarVista(); });
      l.append(campo);
      caja.append(l);
    });
    cont.append(caja);
  });
}

document.querySelectorAll('.anadir button').forEach(bt => bt.addEventListener('click', () => {
  bloques.push({ tipo: bt.dataset.b });
  pintarBloques();
}));

let esperaVista;
function programarVista() {
  clearTimeout(esperaVista);
  esperaVista = setTimeout(vistaPrevia, 400);
}

async function vistaPrevia() {
  try {
    const r = await api('POST', '/vista', correoActual());
    $('vista').srcdoc = r.html;
    $('vistaError').classList.add('hidden');
  } catch (e) {
    $('vistaError').textContent = e.message;
    $('vistaError').classList.remove('hidden');
  }
}

['rAsunto', 'rPie'].forEach(id => $(id).addEventListener('input', programarVista));

$('enviarPrueba').addEventListener('click', async () => {
  try {
    await api('POST', '/probar', { para: $('rPara').value, ...correoActual() });
    aviso('Enviado. Lo tienes en Enviados.', true);
  } catch (e) { aviso(e.message); }
});

$('copiarJson').addEventListener('click', async () => {
  const json = JSON.stringify({ para: $('rPara').value || 'alguien@ejemplo.com', ...correoActual() }, null, 2);
  try { await navigator.clipboard.writeText(json); aviso('JSON copiado.', true); } catch (e) { prompt('Cópialo:', json); }
});

// ── imágenes ──────────────────────────────────────────────────────────────

async function cargarImagenes() {
  const lista = await api('GET', '/recursos');
  const g = $('listaImagenes');
  g.replaceChildren();
  lista.forEach(r => {
    const url = base + '/r/' + r.nombre;
    const caja = document.createElement('div');
    caja.className = 'panel';
    const img = document.createElement('img');
    img.src = 'r/' + r.nombre;
    img.alt = r.nombre;
    const dir = document.createElement('input');
    dir.readOnly = true;
    dir.value = url;
    dir.addEventListener('focus', () => dir.select());
    const pie = document.createElement('div');
    pie.className = 'fila';
    const info = document.createElement('span');
    info.className = 'suave';
    info.textContent = r.nombre + ' · ' + (r.bytes / 1024 / 1024).toFixed(2) + ' MB';
    const hueco = document.createElement('span');
    hueco.className = 'hueco';
    const borrar = document.createElement('button');
    borrar.className = 'peligro';
    borrar.textContent = 'Borrar';
    borrar.addEventListener('click', async () => {
      if (!confirm('¿Borrar ' + r.nombre + '? Los correos ya enviados que la usan dejarán de verla.')) return;
      try { await api('DELETE', '/recursos/' + encodeURIComponent(r.nombre)); cargarImagenes(); } catch (e) { aviso(e.message); }
    });
    pie.append(info, hueco, borrar);
    caja.append(img, dir, pie);
    g.append(caja);
  });
}

$('subir').addEventListener('change', () => {
  const f = $('subir').files[0];
  if (!f) return;
  const lector = new FileReader();
  lector.onload = async () => {
    try {
      const r = await api('POST', '/recursos', { nombre: f.name, datos: String(lector.result).split(',')[1] });
      aviso('Subida: ' + r.nombre, true);
      $('subir').value = '';
      cargarImagenes();
    } catch (e) { aviso(e.message); }
  };
  lector.readAsDataURL(f);
});

// ── llaves ────────────────────────────────────────────────────────────────

async function cargarLlaves() {
  const lista = await api('GET', '/llaves');
  const cuerpo = $('listaLlaves');
  cuerpo.replaceChildren();
  lista.forEach(l => {
    const tr = document.createElement('tr');
    celda(tr, l.app);
    celda(tr, l.remitente || '(el de siempre)');
    celda(tr, fecha(l.creada));
    celda(tr, l.revocada ? 'Revocada ' + fecha(l.revocada) : fecha(l.usada));
    const td = celda(tr, '');
    if (!l.revocada) {
      const b = document.createElement('button');
      b.className = 'peligro';
      b.textContent = 'Revocar';
      b.addEventListener('click', async () => {
        if (!confirm('¿Revocar la llave de ' + l.app + '? Esa app dejará de poder enviar.')) return;
        try { await api('DELETE', '/llaves/' + l.id); cargarLlaves(); } catch (e) { aviso(e.message); }
      });
      td.append(b);
    }
    cuerpo.append(tr);
  });
}

$('crearLlave').addEventListener('click', async () => {
  try {
    const r = await api('POST', '/llaves', { app: $('lApp').value, remitente: $('lRemitente').value });
    $('llaveNueva').textContent = 'MAIL_LLAVE=' + r.llave + '   (cópiala ahora: no se vuelve a mostrar)';
    $('llaveNueva').classList.remove('hidden');
    $('lApp').value = '';
    $('lRemitente').value = '';
    cargarLlaves();
  } catch (e) { aviso(e.message); }
});

// ── inicio ────────────────────────────────────────────────────────────────

$('salir').addEventListener('click', async () => {
  const r = await api('POST', '/salir', {}).catch(() => ({ salir: 'login' }));
  location.href = r.salir;
});

(async () => {
  try {
    const yo = await api('GET', '/yo');
    base = yo.base;
    $('yo').textContent = yo.usuario;
    if (location.hostname.startsWith('dev.')) $('chipDev').hidden = false;
    $('lRemitente').placeholder = 'Remitente (opcional): Nombre <algo@' + yo.dominio + '>';
    if (!yo.resendActivo) aviso('Falta RESEND_API_KEY en el app.env: se ve todo pero no se envía nada.');
    pintarBloques();
    await cargarEnvios();
  } catch (e) { aviso(e.message); }
})();
