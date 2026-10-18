# CLAUDE.md

Mail: the branded email service for the apps of the DEV/PRO server (larceing/servidor).
Apps POST a list of content blocks with their key; Mail renders them into the brand template,
sends through Resend and logs it. README.md (Spanish) is the user doc and the API spec.

- Node 22, Express only. Storage is `node:sqlite` in `/datos` (the server's volume): keys
  (sha256 hashes), sent log with the rendered HTML, UI sessions. Images live in `/datos/recursos`
  and are served publicly at `/r/<name>` (mail clients only load public images).
- `src/plantilla.js` builds the HTML: everything is escaped, URLs must be full http(s).
  Email HTML is table-based with inline styles on purpose (Outlook, Gmail).
- The UI is for admins only (IT or `<ENV>/Mail/Admin`) via Keycloak (`src/sso.js`). Without
  `AUTH_MODO=sso` it is open only when `NODE_ENV` is not `production` (local).
- Deployed by the server from the image (`servidor.json`, type `servidor`); `/version/` is
  what the server checks. CI: `.github/workflows/imagen.yml`.
- UI text and docs are in Spanish. Tests: `npm test` (Resend is faked with a local server).
