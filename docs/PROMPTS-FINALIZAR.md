# Prompts para terminar M5 (publicar en redes)

Lo que falta no es código. Son trámites en consolas web que necesitan los inicios de sesión de Dimerso,
seguidos de una prueba real. Hay dos agentes, en este orden:

1. **Agente A — consolas.** Una sesión de Claude con navegador (Claude in Chrome o computer use),
   **contigo al lado** para iniciar sesión y aprobar la verificación en dos pasos.
2. **Agente B — prueba real y PR.** Claude Code dentro de este repo, cuando `redes.json` ya tenga las
   claves de al menos una red.

Antes del agente A, haz a mano lo que ningún agente puede hacer por ti:
- **Base de datos:** la base local todavía no tiene las tablas de M5 (`pnpm doctor` lo marca como «The
  table `main.Cuenta` does not exist»). En la rama `feat/m5-publicar-redes`, respalda
  `~/geeper-data` (o la ruta que muestre `pnpm doctor`) y corre `pnpm db:push`. Solo agrega tablas y
  columnas; si Prisma avisa que se perderían datos, detente y revisa antes de aceptar.
- **Docker Desktop:** ábrelo, con la integración WSL activa. Hoy está apagado y MoneyPrinterTurbo no
  responde. No afecta la publicación, pero sí la generación de videos.
- **VPN:** instala WireGuard en Windows con un servidor fijo (TRAMITES.md §0.3).
- **Cuentas:** crea las cuentas de cada red (TRAMITES.md §1).

**Para cargar las claves**, en vez de editar `redes.json` a mano, usa el asistente:

```bash
pnpm tsx scripts/configurar-redes.ts
```

Pregunta red por red, oculta los secretos al escribirlos, guarda el archivo con permisos 600 y lo
valida con el mismo esquema que usa Geeper. Enter vacío deja una red como está.

---

## Agente A — consolas (pegar en una sesión con navegador)

```text
Eres el asistente que configura las consolas de desarrollador para Geeper, la herramienta interna de
Dimerso que publica videos en sus propias cuentas por las APIs oficiales. La persona está contigo:
cuando haga falta iniciar sesión, un código de dos pasos o aceptar términos, detente y pídeselo.

Reglas:
- No escribas en el chat, en capturas ni en ningún archivo los secretos: client secret, app secret ni
  tokens. Cuando una consola muestre un ID y un secreto, dile a la persona dónde están en pantalla para
  que ella misma los cargue con `pnpm tsx scripts/configurar-redes.ts` (oculta los secretos). Los IDs públicos (client id, app id) sí
  puedes decirlos.
- No pidas revisiones, auditorías ni verificaciones del negocio. Ninguna hace falta para empezar.
- No cambies nada fuera de lo que dice esta lista. Ante la duda, pregunta.
- Al final, entrega un informe: qué quedó hecho, qué quedó pendiente y por qué.

Datos fijos:
- Sitio legal: https://geeper.dimerso.com (inicio), /privacidad, /terminos, /borrar-datos
  (respaldo mientras no exista el DNS: https://geeper-sitio.vercel.app).
- Contacto: privacidad@dimerso.com. Dominio: dimerso.com.
- Descripción: «Herramienta interna de Dimerso para publicar los videos que produce en sus propias cuentas».
- Redirect URIs (exactos, sin barra final):
  YouTube   http://localhost:3300/api/cuentas/callback/youtube
  TikTok    http://localhost:3300/api/cuentas/callback/tiktok
  Instagram http://localhost:3300/api/cuentas/callback/instagram
  Facebook  http://localhost:3300/api/cuentas/callback/facebook

Tareas, en orden:

1. Cloudflare (dash.cloudflare.com) → zona dimerso.com → DNS → agregar un registro CNAME:
   nombre «geeper», destino «cname.vercel-dns.com», proxy DESACTIVADO (DNS only).
   Espera a que https://geeper.dimerso.com/privacidad abra con candado (puede tardar unos minutos).

2. Google Cloud (console.cloud.google.com):
   a. Crear el proyecto «geeper». Anotar el número de proyecto.
   b. Habilitar «YouTube Data API v3».
   c. Google Auth Platform / pantalla de consentimiento: tipo Externo, nombre Geeper, correo de
      asistencia, página principal y URLs de privacidad y términos, dominio autorizado dimerso.com.
   d. Scopes: https://www.googleapis.com/auth/youtube.upload y https://www.googleapis.com/auth/youtube.readonly.
   e. Público: «Publicar app» → En producción. NO pedir la verificación.
   f. Credenciales → ID de cliente de OAuth → Aplicación web «geeper-local», con el redirect de YouTube.
   g. La persona copia el client id y el secret a redes.json:
      "youtube": { "clientId": "...", "clientSecret": "..." }

3. Meta (developers.facebook.com), con el Facebook personal que administra las páginas:
   a. Crear la app «Geeper», con los casos de uso «Administrar mensajes y contenido en Instagram»
      (API con inicio de sesión de Instagram) y «Administrar todo en tu página».
   b. Configuración → Básica: icono, URLs de privacidad, términos y eliminación de datos, y dominio dimerso.com.
   c. Instagram: anotar dónde están el «ID de la app de Instagram» y su clave secreta (NO son los de
      Facebook). Agregar el redirect de Instagram. Permisos instagram_business_basic e
      instagram_business_content_publish en acceso Standard. Roles → agregar cada cuenta profesional
      como «Probador de Instagram». Recordarle a la persona que acepte cada invitación en instagram.com
      → Configuración → Apps y sitios web → Invitaciones de probadores.
   d. Facebook: permisos pages_show_list, pages_manage_posts y pages_read_engagement (Standard).
      Inicio de sesión con Facebook → agregar el redirect de Facebook y dejar activado el modo estricto.
   e. La persona copia a redes.json:
      "instagram": { "appId": "...", "appSecret": "..." },
      "facebook":  { "appId": "...", "appSecret": "..." }

4. TikTok (developers.tiktok.com):
   a. Crear la app «Geeper»: icono, categoría, descripción, URLs de términos y privacidad, plataforma Desktop.
   b. Productos: Login Kit y Content Posting API (solo Upload/borradores; NO Direct Post).
      Scopes: user.info.basic y video.upload.
   c. Crear un Sandbox, repetir ahí la configuración y el redirect de TikTok, y agregar como
      Target users las cuentas de TikTok de las marcas.
   d. La persona copia el client key y el secret DEL SANDBOX a redes.json:
      "tiktok": { "clientKey": "...", "clientSecret": "...", "publicacionDirecta": false }

Si un menú no coincide con estos nombres, busca la palabra clave equivalente y explica qué hiciste.
La guía completa, con los porqués, está en docs/TRAMITES.md del repo de Geeper (la persona te la puede pegar).
```

---

## Agente B — prueba real y PR (pegar en Claude Code, en el repo de Geeper)

```text
Contexto: Geeper (este repo) tiene M5 en la rama feat/m5-publicar-redes: cuentas conectadas por OAuth,
VPN y publicación en YouTube, TikTok (borradores), Instagram y Facebook. El diseño está en
docs/PUBLICAR.md y los trámites en docs/TRAMITES.md. El código pasa typecheck, lint y tests, pero
NUNCA se probó contra las APIs reales. ~/.config/geeper/redes.json ya tiene las claves de al menos una red.

Objetivo: dejar M5 funcionando de punta a punta contra las redes reales y abrir un PR a main.

Reglas:
- Nunca leas, imprimas ni pegues el contenido de ~/.config/geeper/redes.json, ~/.config/geeper/clave ni
  tokens. Para saber qué hay configurado, usa `pnpm doctor`.
- Todas las publicaciones de prueba van en PRIVADO (o como borrador en TikTok). Nada público.
- Hay otras sesiones trabajando en este repo. Revisa `git status` antes de empezar y commitea solo tus
  archivos. Si la copia compartida tiene cambios ajenos, trabaja en un worktree.
- Los pasos de iniciar sesión en cada red los hace la persona en el navegador: pídeselos.

Pasos:
0. Si `pnpm doctor` dice que falta la tabla Cuenta, pídele a la persona que respalde la base y corra
   `pnpm db:push` (no lo hagas tú sin su permiso).
1. `pnpm doctor`: confirma qué redes están configuradas, que redes.json tiene permisos 600 y el estado del VPN.
   Si el VPN no está activo, pídele a la persona que lo encienda (TRAMITES.md §0.3) y configura en
   Sistema → Red «VPN requerido» con la IP o el país que muestre.
2. `pnpm dev:up`. Para cada red configurada:
   a. La persona conecta una cuenta desde /cuentas. Si son varios canales o páginas, deben aparecer todos.
   b. Elige un proyecto con un render aprobado y publica en privado desde el panel Publicar.
   c. Sigue el trabajo en /trabajos hasta «publicada» o «borrador», y confirma con la persona que el
      video está en la red (YouTube Studio, la bandeja de TikTok, Instagram, la página de Facebook).
   d. Prueba la reanudación: reinicia el worker a mitad de una subida. Debe retomar sin duplicar.
   e. Prueba «Desconectar» y luego «Reconectar».
3. Por cada fallo contra la API real: encuentra la causa en src/lib/redes/*, corrígela, agrega un test que
   lo reproduzca con la respuesta real (sin datos personales ni tokens) y vuelve a probar.
4. YouTube: si el video queda «bloqueado en privado» y no se puede pasar a público desde Studio, anótalo
   para la persona (hay que pedir la auditoría, TRAMITES.md §2.6). No es un bug de Geeper.
5. Cierra con `pnpm typecheck && pnpm lint && pnpm test`, actualiza docs/PUBLICAR.md con lo que se
   verificó (cuotas, límites y diferencias con la documentación) y abre un PR de feat/m5-publicar-redes a
   main con un resumen de las pruebas reales por red. No lo fusiones.

Informe final: qué red funcionó, qué falló y cómo se corrigió, qué quedó pendiente (por ejemplo, la
auditoría) y el enlace al PR.
```
