# Hermes (Mail)

**Hermes** es el nombre de Mail desde el 10/11/2026 (Luis). Por dentro sigue igual: ruta `/mail/`, grupo `Mail` en Keycloak, repo `larceing/mail`.

El correo de todas las apps del servidor DEV/PRO, con la marca: las apps mandan **qué** decir
(en bloques) y Mail lo envía por Resend con la cabecera, los colores y el pie de siempre, y lo
deja anotado. Si cambia la marca, cambia en todos los correos a la vez.

- **Una sola puerta**: `POST /api/enviar`, con la llave de la app.
- **Bloques**: título, texto, botón, imagen, vídeo (GIF animado), capacidades, nota, separador.
- **Pantalla** (IT, con Keycloak): lo enviado y su vista, redactar con vista previa, imágenes y llaves.

## Cómo envía una app

1. En Mail → **Llaves**, crea una para la app (`soporte`, `tareas`…). Se ve una sola vez.
2. Ponla en el `app.env` de esa app, en el servidor:
   `/opt/apps/servidor/apps/<app>/<entorno>/app.env` → `MAIL_LLAVE=ml_…` y
   `MAIL_URL=http://mail-<entorno>:3000` (por dentro, sin salir a internet).
3. La app llama así:

```
curl -X POST "$MAIL_URL/api/enviar" \
  -H "Authorization: Bearer $MAIL_LLAVE" -H "Content-Type: application/json" \
  -d '{
    "para": ["cliente@ejemplo.com"],
    "asunto": "Ya está lista la demo",
    "responder_a": "henry@luiscontacto03.com",
    "bloques": [
      { "tipo": "titulo", "texto": "Tu nueva app" },
      { "tipo": "texto", "texto": "Hola,\n\nYa puedes probarla:\n- Facturas\n- Informes" },
      { "tipo": "video", "gif": "https://pro.luiscontacto03.com/mail/r/demo.gif", "url": "https://youtu.be/…" },
      { "tipo": "capacidades", "items": [
        { "icono": "⚡", "titulo": "Rápida", "texto": "Cambios en minutos" },
        { "icono": "🔒", "titulo": "Segura", "texto": "Tus datos en tu servidor" } ] },
      { "tipo": "boton", "texto": "Abrir", "url": "https://…" }
    ]
  }'
```

Responde `{ "id": 12, "enviado": true, "adjuntos": 0 }`. Errores: `400` (datos mal, con el motivo), `401`
(llave), `429` (más de 30 por minuto), `502` (Resend no lo ha aceptado; queda anotado).

**Adjuntos** (opcional): `"adjuntos": [{ "nombre": "F-2026-0001.pdf", "contenido": "<base64>" }]`.
Como mucho 5 y 10 MB entre todos; no se admiten ejecutables (`.exe`, `.bat`, `.js`…). Del adjunto
solo queda anotado el nombre: el fichero no se guarda en Mail.

Para lo sencillo vale `"mensaje": "texto"` (y `"boton": { "texto", "url" }`) en vez de
`bloques`. `POST /api/vista` con lo mismo devuelve `{ asunto, html, texto }` sin enviar.

En **Redactar**, «Copiar como JSON» da el cuerpo exacto de un correo hecho a mano.

### Correo ya hecho (solo algunas apps)

Hay apps que traen su propio formato, como la captación de n8n. Su llave puede mandar
`html` y `texto` en vez de `bloques`; Hermes lo envía tal cual y lo anota igual que el resto:

```
{ "para": ["x@empresa.com"], "asunto": "…", "html": "<!doctype html>…", "texto": "…", "responder_a": "henry@…" }
```

Solo las llaves de las apps de `MAIL_HTML_PROPIO` (por defecto `captacion`); las demás reciben `403`.
Hacen falta los dos (`html` y `texto`), y cada uno como mucho 200 KB.

### Bloques

| `tipo` | Campos | Notas |
|---|---|---|
| `titulo` | `texto` | |
| `texto` | `texto` | Línea en blanco = párrafo; `- ` = lista; `**negrita**`; las direcciones se enlazan |
| `boton` | `texto`, `url` | |
| `imagen` | `url`, `alt`, `enlace`? | |
| `video` | `gif`, `url`, `texto`? | GIF animado que abre el vídeo. Gmail y Outlook no reproducen vídeo; un GIF sí (Outlook de Windows solo enseña el primer fotograma). Mejor de 3-4 MB como mucho |
| `capacidades` | `items: [{ icono?, titulo, texto }]` | Tarjetas, dos por fila; el icono es un emoji o una imagen https |
| `tabla` | `titulo`?, `filas: [[etiqueta, valor], …]` | Datos en dos columnas (resúmenes, importes) |
| `nota` | `texto` | Letra pequeña |
| `separador` | | |

Todo se escapa: las apps mandan texto, nunca HTML. Las direcciones tienen que ser `https://…`
completas. Las imágenes tienen que estar en una dirección pública: súbelas en **Imágenes** y
quedan en `<Mail>/r/<nombre>`.

## Configuración

El servidor pone Keycloak y la dirección pública. A mano, en el `app.env` de Mail:

| Variable | Qué es |
|---|---|
| `RESEND_API_KEY` | La clave de Resend. Sin ella, todo funciona pero no se envía nada |
| `MAIL_REMITENTE` | Remitente por defecto, p. ej. `Henry Arce <soporte@luiscontacto03.com>`. Su dominio es el verificado en Resend: las llaves solo pueden usar remitentes de ese dominio |
| `MAIL_HTML_PROPIO` | Apps (separadas por comas) que pueden mandar el correo ya hecho. Por defecto `captacion` |
| `MARCA_NOMBRE`, `MARCA_LEMA`, `MARCA_DIRECCION`, `MARCA_WEB`, `MARCA_CORREO`, `MARCA_INICIALES`, `MARCA_LOGO_URL`, `MARCA_PIE` | Opcionales: la firma de los correos. Por defecto, el formato de la casa (10/11/2026): Henry Arce · Arce Data Lab · Datos, automatización y web, la dirección de San Isidro (Alicante), arcedatalab.com y henry@arcedatalab.com, con el monograma «HA» |

Los datos (registro, llaves, imágenes) están en `/datos`, el volumen que da el servidor.

Entra en la pantalla quien está en IT o en `<ENTORNO>/Mail/Admin`.

## Desplegar

En Ajustes del servidor: **Añadir una aplicación** `larceing/mail`, **Poner** en DEV la versión
(`sha-xxxxxxx`, la del último push a `main`), probar en `dev.<dominio>/mail/`, **Pasar a PRO**.

## En local

```
npm install
npm test
MAIL_DATOS=./datos node server.js     # http://localhost:3000, sin Keycloak (solo fuera de producción)
```
