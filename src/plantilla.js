// Convierte un correo descrito por bloques en el HTML de la marca y en su versión
// de texto. Todo lo que llega se escapa: las apps mandan datos, nunca HTML.
//
// Bloques:
//   { tipo: 'titulo', texto }
//   { tipo: 'texto', texto }            párrafos, listas con "- ", **negrita**, enlaces
//   { tipo: 'boton', texto, url }
//   { tipo: 'imagen', url, alt, enlace? }
//   { tipo: 'video', gif, url, texto? }  GIF animado que abre el vídeo completo
//   { tipo: 'capacidades', items: [{ icono?, titulo, texto }] }  tarjetas, dos por fila
//   { tipo: 'tabla', titulo?, filas: [[etiqueta, valor], ...] }  datos en dos columnas
//   { tipo: 'nota', texto }             letra pequeña
//   { tipo: 'separador' }

// Formato de la casa (plantilla-correo-v2, 10/11/2026): tarjeta blanca sobre gris,
// botón azul, firma con el monograma «HA» y la línea de baja fuera de la tarjeta.
const C = {
  fondo: '#F4F5F7', papel: '#FFFFFF', tinta: '#1E2329', suave: '#4B5563', gris: '#9AA1AB', linea: '#E3E6EA',
  marca: '#0F1B2D', acento: '#1F4FD8', boton: '#1F4FD8', tarjeta: '#F6F8FA'
};

const MAX_BLOQUES = 40;
const MAX_TEXTO = 20000;

function marca() {
  const e = process.env;
  return {
    nombre: e.MARCA_NOMBRE || 'Henry Arce',
    lema: e.MARCA_LEMA || 'Arce Data Lab · Datos, automatización y web',
    direccion: e.MARCA_DIRECCION || 'Avenida de Catral, 12, 03349 San Isidro (Alicante), España',
    web: e.MARCA_WEB || 'arcedatalab.com',
    correo: e.MARCA_CORREO || 'henry@arcedatalab.com',
    iniciales: (e.MARCA_INICIALES || 'HA').slice(0, 3),
    logo: e.MARCA_LOGO_URL || '',
    pie: e.MARCA_PIE || ''
  };
}

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function error(mensaje) {
  return Object.assign(new Error(mensaje), { status: 400 });
}

// Solo direcciones web completas: nada de javascript:, data: ni rutas sueltas.
function url(valor, campo) {
  const u = String(valor || '').trim();
  if (!/^https?:\/\/[^\s"'<>]+$/i.test(u) || u.length > 2000) throw error(campo + ': tiene que ser una dirección https://… completa.');
  return u;
}

function texto(valor, campo, max) {
  const t = String(valor == null ? '' : valor);
  if (!t.trim()) throw error(campo + ': está vacío.');
  if (t.length > (max || MAX_TEXTO)) throw error(campo + ': es demasiado largo.');
  return t;
}

const enLinea = (linea) => esc(linea)
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" style="color:' + C.boton + ';">$1</a>');

// Texto escrito a mano: una línea en blanco separa párrafos y las líneas que
// empiezan por "- " forman una lista.
function parrafos(t) {
  return String(t).replace(/\r/g, '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean).map(p => {
    const lineas = p.split('\n');
    if (lineas.every(l => /^\s*[-•]\s+/.test(l))) {
      return '<ul style="margin:0 0 14px;padding-left:22px;font-size:15px;line-height:1.55;">' +
        lineas.map(l => '<li>' + enLinea(l.replace(/^\s*[-•]\s+/, '')) + '</li>').join('') + '</ul>';
    }
    return '<p style="margin:0 0 14px;font-size:15px;line-height:1.55;">' + lineas.map(enLinea).join('<br>') + '</p>';
  }).join('');
}

const plano = (t) => String(t).replace(/\*\*([^*]+)\*\*/g, '$1').trim();

function boton(t, u) {
  return '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;"><tr><td style="border-radius:10px;background:' + C.boton + ';">' +
    '<a href="' + esc(u) + '" style="display:inline-block;color:#FFFFFF;text-decoration:none;font-weight:bold;font-size:15px;padding:13px 22px;border-radius:10px;">' +
    esc(t) + '</a></td></tr></table>';
}

function tarjeta(item) {
  const icono = item.icono
    ? (/^https?:\/\//i.test(item.icono)
      ? '<img src="' + esc(url(item.icono, 'icono')) + '" width="32" height="32" alt="" style="display:block;border:0;margin:0 0 10px;">'
      : '<div style="font-size:26px;line-height:1;margin:0 0 10px;">' + esc(String(item.icono).slice(0, 8)) + '</div>')
    : '';
  return '<td valign="top" width="50%" style="padding:6px;">' +
    '<div style="background:' + C.tarjeta + ';border:1px solid ' + C.linea + ';border-radius:12px;padding:16px;">' + icono +
    '<div style="font-weight:bold;font-size:15px;margin:0 0 6px;">' + esc(texto(item.titulo, 'capacidades: título', 120)) + '</div>' +
    '<div style="font-size:14px;line-height:1.5;color:' + C.suave + ';">' + enLinea(item.texto || '') + '</div>' +
    '</div></td>';
}

// Cada bloque da su trozo de HTML y su trozo de texto.
function bloque(b) {
  if (!b || typeof b !== 'object') throw error('Hay un bloque vacío.');
  switch (b.tipo) {
    case 'titulo': {
      const t = texto(b.texto, 'titulo', 300);
      return { html: '<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">' + esc(t) + '</h1>', texto: t.toUpperCase() };
    }
    case 'texto': {
      const t = texto(b.texto, 'texto');
      return { html: parrafos(t), texto: plano(t) };
    }
    case 'boton': {
      const t = texto(b.texto, 'boton: texto', 120);
      const u = url(b.url, 'boton: url');
      return { html: boton(t, u), texto: t + ': ' + u };
    }
    case 'imagen': {
      const u = url(b.url, 'imagen: url');
      let img = '<img src="' + esc(u) + '" alt="' + esc(b.alt || '') + '" width="512" style="display:block;width:100%;max-width:512px;height:auto;border:0;border-radius:10px;">';
      if (b.enlace) img = '<a href="' + esc(url(b.enlace, 'imagen: enlace')) + '">' + img + '</a>';
      return { html: '<div style="margin:0 0 16px;">' + img + '</div>', texto: b.alt ? '[' + b.alt + ']' + (b.enlace ? ' ' + b.enlace : '') : '' };
    }
    case 'video': {
      // Los correos no reproducen vídeo en todas partes (Gmail, Outlook de
      // Windows no); un GIF animado sí. Outlook de Windows muestra solo su primer
      // fotograma, así que ese fotograma tiene que entenderse solo.
      const gif = url(b.gif, 'video: gif');
      const u = url(b.url, 'video: url');
      const pie = b.texto ? String(b.texto).slice(0, 200) : 'Ver el vídeo completo';
      return {
        html: '<div style="margin:0 0 18px;"><a href="' + esc(u) + '">' +
          '<img src="' + esc(gif) + '" alt="' + esc(pie) + '" width="512" style="display:block;width:100%;max-width:512px;height:auto;border:0;border-radius:10px;"></a>' +
          '<div style="padding-top:8px;font-size:14px;"><a href="' + esc(u) + '" style="color:' + C.boton + ';font-weight:bold;text-decoration:none;">&#9654; ' + esc(pie) + '</a></div></div>',
        texto: pie + ': ' + u
      };
    }
    case 'capacidades': {
      const items = Array.isArray(b.items) ? b.items : [];
      if (!items.length || items.length > 12) throw error('capacidades: entre 1 y 12 tarjetas.');
      if (!items.every(it => it && typeof it === 'object')) throw error('capacidades: cada tarjeta es { titulo, texto }.');
      let filas = '';
      for (let i = 0; i < items.length; i += 2) {
        filas += '<tr>' + tarjeta(items[i]) + (items[i + 1] ? tarjeta(items[i + 1]) : '<td width="50%"></td>') + '</tr>';
      }
      return {
        html: '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;">' + filas + '</table>',
        texto: items.map(it => '- ' + it.titulo + (it.texto ? ': ' + plano(it.texto) : '')).join('\n')
      };
    }
    case 'tabla': {
      const filas = Array.isArray(b.filas) ? b.filas : [];
      if (!filas.length || filas.length > 40) throw error('tabla: entre 1 y 40 filas.');
      if (!filas.every(f => Array.isArray(f) && f.length === 2)) throw error('tabla: cada fila es [etiqueta, valor].');
      const titulo = b.titulo ? String(b.titulo).slice(0, 120) : '';
      const celdas = filas.map(([k, v]) => '<tr><td style="padding:7px 0;border-bottom:1px solid ' + C.linea + ';color:' + C.suave + ';">' + esc(k) + '</td>' +
        '<td style="padding:7px 0 7px 12px;border-bottom:1px solid ' + C.linea + ';text-align:right;font-weight:bold;">' + esc(v) + '</td></tr>').join('');
      return {
        html: (titulo ? '<div style="font-size:13px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:' + C.boton + ';margin:6px 0 4px;">' + esc(titulo) + '</div>' : '') +
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;border-top:1px solid ' + C.linea + ';margin:0 0 18px;">' + celdas + '</table>',
        texto: (titulo ? titulo.toUpperCase() + '\n' : '') + filas.map(([k, v]) => k + ': ' + v).join('\n')
      };
    }
    case 'nota': {
      const t = texto(b.texto, 'nota', 2000);
      return { html: '<p style="margin:0 0 14px;font-size:12px;line-height:1.5;color:' + C.suave + ';">' + enLinea(t) + '</p>', texto: plano(t) };
    }
    case 'separador':
      return { html: '<div style="height:1px;background:' + C.linea + ';margin:20px 0;font-size:1px;line-height:1px;">&nbsp;</div>', texto: '---' };
    default:
      throw error('Tipo de bloque desconocido: ' + String(b.tipo).slice(0, 40) + '.');
  }
}

// Lo que piden las apps: bloques, o un mensaje de texto (y un botón) para lo sencillo.
function bloquesDe(datos) {
  if (Array.isArray(datos.bloques)) {
    if (!datos.bloques.length) throw error('bloques: está vacío.');
    if (datos.bloques.length > MAX_BLOQUES) throw error('bloques: como mucho ' + MAX_BLOQUES + '.');
    return datos.bloques;
  }
  const b = [{ tipo: 'texto', texto: datos.mensaje }];
  if (datos.boton && datos.boton.url) b.push({ tipo: 'boton', texto: datos.boton.texto || 'Abrir', url: datos.boton.url });
  return b;
}

function firma(m) {
  const F = 'font-family:Arial,Helvetica,sans-serif;';
  const icono = m.logo
    ? '<img src="' + esc(m.logo) + '" width="48" height="48" alt="" style="display:block;border:0;border-radius:10px;">'
    : '<div style="width:48px;height:48px;border-radius:10px;background:' + C.marca + ';color:#FFFFFF;' + F + 'font-weight:bold;font-size:18px;line-height:48px;text-align:center;">' + esc(m.iniciales) + '</div>';
  const web = String(m.web).replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return '<table role="presentation" cellpadding="0" cellspacing="0" style="border-top:1px solid ' + C.linea + ';"><tr>' +
    '<td valign="top" style="padding:16px 14px 0 0;">' + icono + '</td>' +
    '<td valign="top" style="padding-top:16px;' + F + 'font-size:13px;line-height:1.55;color:' + C.tinta + ';">' +
    '<div style="font-size:15px;font-weight:bold;">' + esc(m.nombre) + '</div>' +
    '<div style="color:' + C.acento + ';font-weight:bold;letter-spacing:.04em;font-size:11px;text-transform:uppercase;">' + esc(m.lema) + '</div>' +
    (m.direccion ? '<div style="color:' + C.suave + ';">' + esc(m.direccion) + '</div>' : '') +
    '<div style="padding-top:4px;"><a href="https://' + esc(web) + '/" style="color:' + C.tinta + ';text-decoration:none;">' + esc(web) + '</a>' +
    (m.correo ? ' · <a href="mailto:' + esc(m.correo) + '" style="color:' + C.tinta + ';text-decoration:none;">' + esc(m.correo) + '</a>' : '') + '</div>' +
    '</td></tr></table>';
}

function componer(datos) {
  const asunto = texto(datos.asunto, 'asunto', 250).replace(/[\r\n]+/g, ' ');
  const partes = bloquesDe(datos).map(bloque);
  const m = marca();
  const pieTexto = datos.pie ? String(datos.pie).slice(0, 500) : m.pie;
  const F = 'font-family:Arial,Helvetica,sans-serif;';

  const html = '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + esc(asunto) + '</title></head>' +
    '<body style="margin:0;padding:0;background:' + C.fondo + ';' + F + 'color:' + C.tinta + ';">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + C.fondo + ';"><tr><td align="center" style="padding:24px 12px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:' + C.papel + ';border-radius:10px;border:1px solid ' + C.linea + ';">' +
    '<tr><td style="padding:28px 32px 8px 32px;' + F + 'font-size:15px;line-height:1.6;color:' + C.tinta + ';">' + partes.map(p => p.html).join('') + '</td></tr>' +
    '<tr><td style="padding:12px 32px 28px 32px;">' + firma(m) + '</td></tr>' +
    '</table>' +
    (pieTexto ? '<div style="' + F + 'font-size:11px;color:' + C.gris + ';padding:14px 12px 0 12px;max-width:600px;">' + enLinea(pieTexto) + '</div>' : '') +
    '</td></tr></table></body></html>';

  const firmaTexto = [m.nombre, m.lema, m.direccion, [m.web, m.correo].filter(Boolean).join(' · ')].filter(Boolean).join('\n');
  const textoPlano = partes.map(p => p.texto).filter(Boolean).join('\n\n') + '\n\n--\n' + firmaTexto + (pieTexto ? '\n\n' + plano(pieTexto) : '');
  return { asunto, html, texto: textoPlano };
}

module.exports = { componer, esc };
