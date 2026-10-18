// La plantilla escapa lo que llega, rechaza direcciones peligrosas y da texto plano.
const assert = require('assert');
process.env.APP_URL_PUBLICA = 'https://pro.ejemplo.com/mail';
const { componer } = require('../src/plantilla');

const c = componer({
  asunto: 'Novedades\r\nBcc: x@y.com',
  bloques: [
    { tipo: 'titulo', texto: 'Hola <b>' },
    { tipo: 'texto', texto: 'Uno **dos** https://ejemplo.com\n\n- a\n- b' },
    { tipo: 'boton', texto: 'Ver', url: 'https://ejemplo.com/x?a=1&b=2' },
    { tipo: 'video', gif: 'https://ejemplo.com/demo.gif', url: 'https://youtu.be/abc' },
    { tipo: 'capacidades', items: [{ icono: '⚡', titulo: 'Rápido', texto: 'En minutos' }, { titulo: 'Seguro' }, { titulo: 'Tres' }] },
    { tipo: 'imagen', url: 'https://ejemplo.com/i.png', alt: 'Foto', enlace: 'https://ejemplo.com' },
    { tipo: 'nota', texto: 'pequeño' },
    { tipo: 'separador' }
  ]
});
assert.strictEqual(c.asunto, 'Novedades Bcc: x@y.com', 'el asunto no puede llevar saltos de línea');
assert.ok(c.html.includes('Hola &lt;b&gt;'), 'el título se escapa');
assert.ok(c.html.includes('<strong>dos</strong>'), 'negrita');
assert.ok(c.html.includes('<ul'), 'lista');
assert.ok(c.html.includes('a=1&amp;b=2'), 'las direcciones se escapan');
assert.ok(c.html.includes('demo.gif') && c.html.includes('https://youtu.be/abc'), 'vídeo: GIF y enlace');
assert.ok(c.html.includes('https://pro.ejemplo.com/mail/marca/monograma.png'), 'logo desde la dirección pública');
assert.strictEqual((c.html.match(/<tr><td valign/g) || []).length, 2, 'tres tarjetas = dos filas');
assert.ok(c.texto.includes('Ver: https://ejemplo.com/x?a=1&b=2'), 'texto plano con el botón');
assert.ok(c.texto.includes('- Rápido: En minutos'), 'texto plano con capacidades');

const mal = (datos, trozo) => assert.throws(() => componer(datos), e => e.status === 400 && e.message.includes(trozo), trozo);
mal({ asunto: 'x', bloques: [{ tipo: 'boton', texto: 'a', url: 'javascript:alert(1)' }] }, 'https://');
mal({ asunto: 'x', bloques: [{ tipo: 'imagen', url: 'data:image/png;base64,AAA' }] }, 'https://');
mal({ asunto: 'x', bloques: [{ tipo: 'video', gif: 'https://a.com/x.gif', url: 'https://a.com/" onclick="x' }] }, 'https://');
mal({ asunto: 'x', bloques: [{ tipo: 'raro' }] }, 'desconocido');
mal({ asunto: 'x', bloques: [] }, 'vacío');
mal({ asunto: '', mensaje: 'hola' }, 'asunto');
mal({ asunto: 'x', bloques: [{ tipo: 'capacidades', items: ['a'] }] }, 'capacidades');

// Lo sencillo: mensaje y botón.
const s = componer({ asunto: 'Aviso', mensaje: 'Hola', boton: { texto: 'Abrir', url: 'https://a.com' } });
assert.ok(s.html.includes('Abrir') && s.texto.startsWith('Hola'));

// Tabla de datos.
const tb = componer({ asunto: 'R', bloques: [{ tipo: 'tabla', titulo: 'Cobros', filas: [['Pendiente', '1.200,00 €'], ['Facturas <x>', 3]] }] });
assert.ok(tb.html.includes('1.200,00 €') && tb.html.includes('Facturas &lt;x&gt;'));
assert.ok(tb.texto.includes('COBROS\nPendiente: 1.200,00 €'));
mal({ asunto: 'x', bloques: [{ tipo: 'tabla', filas: [['solo uno']] }] }, 'tabla');

console.log('plantilla: bien');
