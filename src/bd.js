// Lo que la app guarda: las llaves de las apps, lo enviado y las sesiones de la
// pantalla. Un fichero SQLite en /datos (el volumen que da el servidor DEV/PRO).

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DATOS = process.env.MAIL_DATOS || '/datos';
fs.mkdirSync(DATOS, { recursive: true });

const bd = new DatabaseSync(path.join(DATOS, 'mail.db'));
bd.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS llave (
    id INTEGER PRIMARY KEY,
    app TEXT NOT NULL,
    hash TEXT NOT NULL UNIQUE,
    remitente TEXT NOT NULL DEFAULT '',
    creada TEXT NOT NULL,
    usada TEXT,
    revocada TEXT
  );
  CREATE TABLE IF NOT EXISTS envio (
    id INTEGER PRIMARY KEY,
    app TEXT NOT NULL,
    para TEXT NOT NULL,
    asunto TEXT NOT NULL,
    estado TEXT NOT NULL,
    motivo TEXT NOT NULL DEFAULT '',
    resend_id TEXT NOT NULL DEFAULT '',
    html TEXT NOT NULL,
    creado TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_envio_creado ON envio (creado);
  CREATE TABLE IF NOT EXISTS sesion (
    token_hash TEXT PRIMARY KEY,
    usuario TEXT NOT NULL,
    caduca TEXT NOT NULL
  );
`);

const ahora = () => new Date().toISOString();

module.exports = { bd, ahora, DATOS };
