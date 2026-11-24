# Trámites para publicar desde Geeper — paso a paso

<!-- borrador: 2026-11-18 · complemento de PUBLICAR.md -->

Guía para el dueño de las cuentas. Va en orden: lo de la §0 sirve para todas las redes, y después
cada red por separado. Al final de cada red hay una **prueba** para confirmar que quedó bien.

> **Las consolas de Google, TikTok y Meta cambian de nombres y menús seguido.** Si un botón no está
> donde dice aquí, busca la palabra clave entre comillas. Las cifras (cuotas y límites) son las
> publicadas a noviembre de 2026; confírmalas en la documentación oficial enlazada.

**Resumen de lo que exige cada red para uso interno** (solo cuentas tuyas o que administras):

| Red | ¿Revisión obligatoria para empezar? | Qué te limita sin revisión | Revisión opcional, para quitar el límite |
|---|---|---|---|
| YouTube | No | Pantalla «app no verificada», 100 usuarios en total y quizás videos bloqueados en privado (§2.6) | Verificación de OAuth y auditoría de la API (semanas) |
| TikTok | No (modo sandbox) | Borradores o publicaciones privadas, hasta 5 usuarios al día y cuentas en privado | Revisión de la app y auditoría de Content Posting (semanas) |
| Instagram | **No**, si todas las cuentas tienen un rol en la app | Solo cuentas con rol de probador | Revisión de la app y verificación del negocio (solo si fueran cuentas ajenas) |
| Facebook | **No**, si administras las páginas y tienes un rol en la app | Solo páginas que administra alguien con rol | La misma revisión de Meta |

---

## 0. Lo común (una vez)

### 0.1 Un correo y una cuenta de Google «de Dimerso»

Crea (o usa) un correo de la empresa para ser **dueño** de las apps de desarrollador, por ejemplo
`dev@dimerso.com`. Así las apps no dependen de tu cuenta personal.

### 0.2 Dominio y tres páginas públicas

Las tres redes piden una URL pública con la **política de privacidad**. TikTok y Meta piden
además **términos de servicio**, y la revisión de Meta pide una **página para borrar datos**.

**Ya están escritas y publicadas.** El código está en `sitio/` y el proyecto de Vercel se llama
`geeper-sitio`. Contacto: `privacidad@dimerso.com`.

| Página | URL para las consolas |
|---|---|
| Inicio | `https://geeper.dimerso.com` |
| Privacidad | `https://geeper.dimerso.com/privacidad` |
| Términos | `https://geeper.dimerso.com/terminos` |
| Borrar datos | `https://geeper.dimerso.com/borrar-datos` |

1. **Lo único que falta (una vez):** en Cloudflare → dimerso.com → DNS → «Add record»:
   - Tipo `CNAME`, nombre `geeper`, destino `cname.vercel-dns.com`;
   - **Proxy desactivado** (nube gris, «DNS only»), para que Vercel pueda emitir el certificado.

   Mientras tanto, las páginas ya funcionan en `https://geeper-sitio.vercel.app`.
2. Comprueba que `https://geeper.dimerso.com/privacidad` abre con candado antes de pegar las URLs en
   las consolas.
3. **Revisa que `privacidad@dimerso.com` reciba correo.** Los revisores de las redes pueden escribir ahí.
4. Para cambiar el texto, edita `sitio/` y vuelve a publicar el proyecto `geeper-sitio`.

Lo que cubren las páginas, para no olvidarlo si se editan:
- **Política de privacidad:**
  - qué datos guarda Geeper, para qué y dónde (en un equipo local, con los tokens cifrados);
  - que no se venden ni se usan para publicidad o entrenamiento;
  - cómo revocar el acceso y cómo pedir el borrado;
  - **para YouTube, obligatorio:** el uso de los Servicios de API de YouTube, los enlaces a los Términos
    de YouTube y a la privacidad de Google, la declaración de **Uso Limitado** de la política de datos
    de las API de Google y el enlace para revocar el acceso;
  - en español, con resumen en inglés para los revisores.
- **Borrar datos:** «Desconectar» en Geeper, revocar el acceso desde cada red o escribir al correo.

Aparte, las consolas piden un **icono** de 1024×1024 px en PNG (el logo de Geeper o de Dimerso) y una **descripción** de una
   línea: «Herramienta interna de Dimerso para publicar los videos que produce en sus propias cuentas».

### 0.3 VPN (WireGuard, una sola IP fija)

> **Guía completa para que todo el equipo salga por el país elegido** (Windows, navegador, WSL y
> Geeper, sin fugas de IPv6 ni de DNS, con la ubicación de Windows coherente): [VPN.md](VPN.md).
> Para verificarlo: `pnpm tsx scripts/verificar-vpn.ts <PAIS>`.

1. Elige un proveedor que entregue archivos de configuración de **WireGuard** con un servidor
   **fijo**, o un VPS propio con WireGuard. Elige un país y no lo cambies.
2. En **Windows**, instala el cliente oficial desde [wireguard.com/install](https://www.wireguard.com/install/).
3. «Import tunnel(s) from file» → elige `geeper.conf` y ponle de nombre `geeper`.
4. En la configuración del túnel, deja `AllowedIPs = 0.0.0.0/0, ::/0` para que todo el tráfico pase
   por el VPN, y marca **«Block untunneled traffic (kill-switch)»**.
5. **Activate.** Comprueba la IP en [ifconfig.me](https://ifconfig.me) desde Windows y desde WSL
   (`curl -s ifconfig.me`). Las dos deben mostrar la IP del VPN.
6. En Geeper, ve a **Sistema → Red** y pon `VPN: requerido` con el país o la IP que te mostró el paso 5.
7. **Desde ahora, crea las cuentas y conéctalas a Geeper siempre con el VPN encendido.** Así cada
   red ve siempre la misma IP para la misma cuenta.

### 0.4 El archivo de credenciales de Geeper

Las claves que vas a sacar de cada consola van en `~/.config/geeper/redes.json`, que **no entra al repo**.
El archivo ya está creado, vacío (`{}`) y con permisos 600. La clave de cifrado de tokens
(`~/.config/geeper/clave`) la crea Geeper sola la primera vez.

Ábrelo con tu editor y ve llenando lo de cada red a medida que termines su sección:

```json
{
  "youtube":   { "clientId": "", "clientSecret": "" },
  "tiktok":    { "clientKey": "", "clientSecret": "", "publicacionDirecta": false },
  "instagram": { "appId": "", "appSecret": "" },
  "facebook":  { "appId": "", "appSecret": "" }
}
```

Borra las redes que todavía no tengas: un bloque vacío da error. **Nunca pegues estas claves en un
chat, un commit ni una captura.** Después de editarlo, corre `pnpm doctor`: muestra qué redes quedaron
configuradas, sin mostrar las claves.

---

## 1. Cuentas en las redes (manual)

Para cada canal o marca (GTA VI Shorts, Dimerso, Farol, Booka, Delfín…), con el VPN encendido:

| Red | Lo que necesita la cuenta |
|---|---|
| YouTube | Una cuenta de Google y un **canal**. Para tener varios canales con un solo login, usa **cuentas de marca**: en YouTube, foto → Configuración → «Agregar o administrar canales» → «Crear un canal». **Verifica el canal con tu teléfono** (youtube.com/verify) para poder subir videos de más de 15 minutos y poner miniaturas propias |
| TikTok | Una cuenta por marca, con correo propio. Mientras la app no tenga la auditoría, la cuenta tiene que estar en **privado** para la publicación directa (para borradores no hace falta) |
| Instagram | Una cuenta **profesional**: Configuración → «Tipo de cuenta y herramientas» → «Cambiar a cuenta profesional» → Creador o Empresa |
| Facebook | Una **página** por marca, administrada desde tu perfil personal (Meta no permite publicar en perfiles personales por API) |

Anota en un gestor de contraseñas el correo, la contraseña y la verificación en dos pasos de cada
cuenta. **Activa la verificación en dos pasos en todas.**

---

## 2. YouTube (Google Cloud)

**Tiempo:** unos 30 minutos. **Revisión:** no hace falta para empezar.

### 2.1 Proyecto

1. Entra a [console.cloud.google.com](https://console.cloud.google.com) con el correo de §0.1.
2. Selector de proyecto (arriba) → **Proyecto nuevo** → nombre `geeper` → Crear.
3. Anota el **número de proyecto** (Panel → «Información del proyecto»). Lo pide la auditoría.

### 2.2 Activar la API

1. Menú → «APIs y servicios» → **Biblioteca** → busca «YouTube Data API v3» → **Habilitar**.
2. En «APIs y servicios» → **Cuotas**, filtra por YouTube Data API v3. Deberías ver unas **100
   subidas** (`videos.insert`) y 10.000 unidades al día para lo demás.

### 2.3 Pantalla de consentimiento (ahora se llama «Google Auth Platform»)

1. «APIs y servicios» → **Pantalla de consentimiento de OAuth** (o «Google Auth Platform» → «Branding»).
2. **Tipo de usuario: Externo.** Interno solo sirve con Google Workspace y no deja conectar canales
   de cuentas @gmail.
3. **Branding:** nombre `Geeper`, correo de asistencia, el icono de §0.2, la página principal
   `https://geeper.dimerso.com`, las URLs de privacidad y de términos, y en **dominios autorizados**
   `dimerso.com`. Correo de contacto del desarrollador.
4. **Acceso a los datos** (Scopes) → «Agregar o quitar permisos» → agrega:
   - `https://www.googleapis.com/auth/youtube.upload`
   - `https://www.googleapis.com/auth/youtube.readonly`
5. **Público** (Audience) → «Publicar app» → **En producción**. Este paso es importante: en *Testing*,
   el permiso de cada canal vence a los 7 días y tendrías que reconectar cada semana.
   - Como los permisos son *sensibles* y la app no está verificada, al conectar vas a ver «Google no
     verificó esta app». Entra con **Configuración avanzada → Ir a Geeper (no seguro)**. Es normal
     para una herramienta interna.
   - Límite: **100 usuarios en toda la vida de la app**. Cada cuenta de Google que conectes cuenta
     como uno, así que te sobra.
   - No pidas la verificación (el botón «Preparar para la verificación») salvo que algún día abras
     Geeper a clientes. Pide un video del flujo, la política de privacidad y semanas de espera.

### 2.4 Credenciales

1. «APIs y servicios» → **Credenciales** → «Crear credenciales» → **ID de cliente de OAuth**.
2. Tipo: **Aplicación web**. Nombre: `geeper-local`.
3. **URIs de redireccionamiento autorizados** → agrega exactamente:
   `http://localhost:3300/api/cuentas/callback/youtube`
4. Crear → copia el **ID de cliente** y el **secreto** a `redes.json` → bloque `youtube`.

### 2.5 Prueba

1. VPN encendido → `pnpm dev:up` → Geeper → **Cuentas** → «Conectar YouTube».
2. Elige la cuenta → si tiene varios canales, **elige el canal** → acepta los permisos (pasando por
   la pantalla de app no verificada).
3. El canal aparece en Cuentas. Repite el proceso para cada canal.
4. Sube un render aprobado en **privado** desde el panel Publicar y ábrelo en YouTube Studio.

### 2.6 Si el video queda bloqueado en privado

La documentación de YouTube dice que los proyectos de API **no auditados** creados después del 28
de julio de 2020 suben los videos **bloqueados en privado**: no se pueden pasar a público ni desde
YouTube Studio. Algunas versiones recientes de la documentación dicen lo contrario, así que la prueba
de §2.5 es la que decide:

- **Si en Studio puedes cambiarlo a público:** no hay nada más que hacer.
- **Si dice «Bloqueado» o «Restringido»:** hay que pedir la **auditoría**:
  1. Abre el [formulario de auditoría y ampliación de cuota](https://support.google.com/youtube/contact/yt_api_form).
  2. Elige «auditoría de cumplimiento» (también sirve para pedir más cuota).
  3. Te pide: número de proyecto (§2.1), las URLs de privacidad y de términos, una descripción del uso
     («herramienta interna; solo publica videos propios en canales propios, siempre con un clic de una
     persona»), capturas o un video del flujo de conexión y publicación, y cuántas llamadas haces por día.
  4. **Antes de enviarlo**, revisa que se cumplan las [políticas para desarrolladores](https://developers.google.com/youtube/terms/developer-policies):
     la pantalla de conexión de Geeper enlaza los Términos de YouTube y la privacidad de Google, hay
     forma de desconectar y no se guarda nada de YouTube más allá de lo necesario.
  5. **Espera semanas, sin plazo garantizado.** Mientras tanto, sube desde Geeper y publica a mano:
     descarga el MP4 aprobado y súbelo en YouTube Studio. Los videos que ya quedaron bloqueados **no
     se pueden apelar**; hay que volver a subirlos.

---

## 3. TikTok (TikTok for Developers)

**Tiempo:** 1 hora para el sandbox. **Revisión:** no para el sandbox; sí para producción y para la
publicación directa en público.

### 3.1 Cuenta de desarrollador y app

1. Entra a [developers.tiktok.com](https://developers.tiktok.com) → «Log in» con una cuenta de TikTok
   (puede ser la de la marca principal) → registra la **organización** o individuo con el correo de §0.1.
2. «Manage apps» → **Connect an app** → nombre `Geeper`, icono, categoría (Video / Productividad),
   descripción de §0.2, URLs de **Terms of Service** y **Privacy Policy**.
3. **Platforms:** marca **Desktop**. Geeper corre en tu PC y TikTok solo acepta redirects
   `http://localhost` en apps de escritorio; en Web exige HTTPS en un dominio verificado.
4. **Products** → «Add products» → **Login Kit** y **Content Posting API**.
5. En Login Kit → **Redirect URI** (escritorio):
   `http://localhost:3300/api/cuentas/callback/tiktok`
   Sin parámetros de consulta ni `#`, y con el puerto incluido.
6. En Content Posting API: activa **Upload** (borradores). Activa **Direct Post** solo si vas a pedir
   la auditoría (§3.4).
7. **Scopes:** `user.info.basic`, `video.upload` y, solo si activaste Direct Post, `video.publish`.

### 3.2 Sandbox (para empezar sin revisión)

1. En la app, arriba, cambia de «Production» a **Sandbox** → «Create sandbox».
2. Repite en el sandbox Login Kit, Content Posting y el redirect URI (el sandbox tiene su configuración
   aparte).
3. **Target users** → agrega las cuentas de TikTok de tus marcas (hasta 10) y acepta la invitación
   desde cada una.
4. Copia el **Client key** y el **Client secret del sandbox** a `redes.json` → bloque `tiktok`, con
   `"publicacionDirecta": false`.

### 3.3 Prueba

1. VPN encendido → Geeper → Cuentas → «Conectar TikTok».
2. **Para la segunda cuenta:** cierra la sesión de TikTok en el navegador antes de conectar, o usa una
   ventana privada. Si no, TikTok reutiliza la sesión anterior.
3. Publica un render 9:16 → llega como **borrador a la bandeja** de la app de TikTok (notificación
   «Tienes un video para editar»). Lo terminas y lo publicas desde el teléfono.

### 3.4 Producción y publicación directa (opcional, semanas)

Solo si quieres que Geeper publique sin pasar por el teléfono.

1. **Revisión de la app:** en la configuración de **Production** → «Submit for review». Te pide:
   - un **video de demostración** del flujo completo en Geeper (conectar, elegir cuenta y publicar),
     grabado en un ambiente de prueba;
   - una explicación de cada scope;
   - las URLs verificadas. Si te pide verificar el dominio: «URL properties» → descarga el archivo o
     agrega el registro TXT en el DNS del dominio.
2. **Auditoría de Content Posting** (es aparte; aprobar la app no la reemplaza): cuando la app esté
   aprobada, «Content Posting API» → **Apply for audit**. Antes de grabar el video, el panel Publicar
   tiene que cumplir las [guías de UX de TikTok](https://developers.tiktok.com/doc/content-sharing-guidelines):
   - mostrar el **nombre y el avatar** de la cuenta destino (de `creator_info`);
   - un selector de **privacidad sin valor por defecto**, que la persona elige a mano;
   - interruptores de comentarios, dúo y stitch;
   - la casilla de **contenido comercial** (promoción de marca propia o de terceros);
   - el aviso de consentimiento de las políticas de música de TikTok antes de publicar;
   - el límite de duración que devuelve `creator_info`.
3. Mientras no esté auditada: con Direct Post solo se publica en **SELF_ONLY** (privado), hasta **5
   usuarios** en 24 horas, y las cuentas deben estar en **privado**.
4. Cuando la aprueben, cambia en `redes.json` el client key y el secret de Production y pon
   `"publicacionDirecta": true`. Después reconecta las cuentas, porque cambian los scopes.

---

## 4. Instagram y Facebook (Meta for Developers)

**Tiempo:** 1 hora. **Revisión:** **no hace falta** mientras solo se usen cuentas tuyas o que
administras y cada una tenga un rol en la app (acceso **Standard**). La revisión de la app y la
verificación del negocio solo se piden para el acceso Advanced, es decir, para cuentas ajenas.

### 4.1 Cuenta de desarrollador y app

1. Entra a [developers.facebook.com](https://developers.facebook.com) con tu Facebook personal (el que
   administra las páginas) → «Empezar» → verifica el correo y el teléfono.
2. Crea un **Business Portfolio** en [business.facebook.com](https://business.facebook.com) llamado
   Dimerso, si no lo tienes, y agrega ahí las páginas de Facebook y las cuentas de Instagram.
3. «Mis apps» → **Crear app** → nombre `Geeper`, correo de contacto, el portfolio de Dimerso.
4. **Casos de uso:** elige
   - «Administrar mensajes y contenido en Instagram» (es el **API de Instagram con inicio de sesión de
     Instagram**),
   - «Administrar todo en tu página» (páginas de Facebook).
5. **Configuración de la app → Básica:** icono, URL de privacidad, URL de términos, URL de
   eliminación de datos (§0.2), categoría y dominio `dimerso.com`. Copia el **ID de la app** y la
   **clave secreta**: van en el bloque `facebook` de `redes.json`.

### 4.2 Instagram

1. En el caso de uso de Instagram → «Configuración de la API con inicio de sesión de Instagram».
2. Copia el **ID de la app de Instagram** y la **clave secreta de Instagram**. **No son los mismos**
   que los de Facebook. Van en el bloque `instagram` de `redes.json`.
3. **Configurar el inicio de sesión de empresa** → **URI de redireccionamiento de OAuth válidos**:
   `http://localhost:3300/api/cuentas/callback/instagram`
4. **Permisos:** `instagram_business_basic` y `instagram_business_content_publish`. Quedan en acceso
   Standard: **no pidas Advanced**.
5. **Roles de la app → Roles → Agregar personas → Probador de Instagram** → escribe el @ de cada
   cuenta profesional.
6. Acepta cada invitación: entra a **instagram.com en el navegador** con esa cuenta → Configuración →
   «Apps y sitios web» → **Invitaciones de probadores** → Aceptar. Desde la app del teléfono a veces
   no aparece.

### 4.3 Facebook (páginas)

1. En el caso de uso de páginas → agrega los permisos `pages_show_list`, `pages_manage_posts` y
   `pages_read_engagement` (acceso Standard).
2. Producto **Inicio de sesión con Facebook → Configuración** → **URI de redireccionamiento de OAuth
   válidos**: `http://localhost:3300/api/cuentas/callback/facebook`. Deja activados «Inicio de sesión
   de OAuth web» y «Usar modo estricto para URI de redireccionamiento».
3. Tu perfil personal ya es **administrador** de la app. Si otra persona administra alguna página,
   agrégala en Roles como **Evaluador** (tester).

### 4.4 Modo de la app

- **Desarrollo** alcanza para todo lo anterior: solo pueden usar la app las personas y cuentas con
  rol, que es justo lo que quieres.
- Si alguna llamada de publicación devuelve un error de «la app está en modo de desarrollo», pasa la
  app a **Activa** (interruptor arriba). Para eso pide las URLs de privacidad y de eliminación de
  datos, no una revisión.

### 4.5 Prueba

1. VPN encendido → Geeper → Cuentas → «Conectar Instagram» → inicia sesión con la cuenta profesional.
   Cada cuenta se conecta por separado: cierra la sesión de Instagram en el navegador entre una y otra.
2. «Conectar Facebook» → elige **todas las páginas** que quieras dar a Geeper. Cada página aparece
   como una cuenta.
3. Publica un Reel 9:16 de prueba. En Instagram el límite es de unas **50 publicaciones por cuenta
   cada 24 horas**.

---

## 5. Calendario sugerido

| Día | Qué |
|---|---|
| 1 | §0 completo (dominio, páginas, VPN, `redes.json`) y §1 (cuentas) |
| 1 | YouTube §2.1–2.5 y la prueba de §2.6. Si queda bloqueado, enviar el formulario de auditoría ese mismo día |
| 2 | Meta §4 completo: con eso ya publicas en Instagram y Facebook sin esperar a nadie |
| 2 | TikTok §3.1–3.3 en sandbox (borradores) |
| Cuando el flujo esté estable | Revisión y auditoría de TikTok (§3.4), si quieres publicar sin pasar por el teléfono |

## 6. Mantenimiento

- **Cada 60 días aproximadamente**, Instagram renueva su token. Geeper lo hace solo si se usa; si una
  cuenta pasa mucho tiempo sin uso puede quedar en «Reconectar».
- **Si cambias la contraseña** de una cuenta de Google o de Meta, sus permisos se revocan y toca
  «Reconectar».
- **Si cambias de servidor VPN o de país**, vuelve a configurar el ajuste de Sistema (§0.3 paso 6) y
  espera algunos inicios de sesión con verificación extra.
- **Las claves de `redes.json`** se rotan desde cada consola («Restablecer secreto»). Después hay que
  actualizar el archivo y correr `pnpm doctor`.

## Fuentes

- YouTube: [cuotas y auditorías](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits) ·
  [`videos.insert`](https://developers.google.com/youtube/v3/docs/videos/insert) ·
  [formulario de auditoría](https://support.google.com/youtube/contact/yt_api_form) ·
  [OAuth: preparación para producción](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)
- TikTok: [Login Kit escritorio](https://developers.tiktok.com/doc/login-kit-desktop) ·
  [Login Kit web](https://developers.tiktok.com/doc/login-kit-web) ·
  [Direct Post](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post)
- Meta: [Instagram Platform](https://developers.facebook.com/docs/instagram-platform/overview) ·
  [crear la app](https://developers.facebook.com/docs/instagram-platform/create-an-instagram-app) ·
  [publicación de contenido](https://developers.facebook.com/docs/instagram-platform/content-publishing/) ·
  [referencia de permisos](https://developers.facebook.com/docs/permissions)
