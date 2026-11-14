# KNote

Un espacio personal para guardar ideas y notas, con una interfaz oscura y ligera.

## Iniciar

```sh
bun install --frozen-lockfile
bun run dev
```

Para generar la versión de producción:

```sh
bun run build
```

Los archivos listos quedan en `dist/`.

## Inicio de sesión

El acceso con Karmancos ID está disponible solo en la versión web. KNote usa Authorization Code con PKCE S256 y procesa el intercambio OIDC en funciones de servidor; el navegador nunca recibe el secreto de cliente ni tokens. La sesión de KNote se guarda en una cookie cifrada, `HttpOnly`, `Secure` en producción y `SameSite=Lax`.

Configura en `.env.local` para desarrollo y en las variables de entorno de Vercel para producción:

- `KARMANCOSID_ISSUER`: `https://karmancosid.vercel.app`, verificado contra el campo `issuer` de Discovery.
- `KARMANCOSID_CLIENT_ID`: identificador público del cliente KNote en Karmancos ID.
- `KARMANCOSID_CLIENT_SECRET`: secreto de cliente, solo para el servidor. Karmancos ID debe tener este cliente habilitado como confidencial y aceptar `client_secret_basic`.
- `KNOTE_SESSION_SECRET`: clave independiente, aleatoria y de al menos 32 caracteres para cifrar las cookies de sesión.
- `KARMANCOSID_REDIRECT_URI`: callback exacto. En producción es `https://knote.karmancos.space/auth/callback`; en desarrollo local usa `http://localhost:5173/auth/callback`.

Registra en Karmancos ID la URL de retorno exacta y el origen web de cada entorno: `https://knote.karmancos.space/auth/callback` con `https://knote.karmancos.space` en producción; `http://localhost:5173/auth/callback` con `http://localhost:5173` durante desarrollo local. La cuenta conectada muestra su foto, nombre de usuario, nombre y apellidos dentro de **Mi espacio · Personal**. En la web, al iniciar sesión, KNote sincroniza páginas, tareas, preferencias y vistas con MongoDB Atlas. Los cambios se guardan primero en una cola local y se reintentan si se pierde la conexión. Al encontrar datos tanto en este dispositivo como en la cuenta, puedes fusionarlos o usar la nube; los datos locales se conservan. Todavía no se procesa el callback de backchannel logout.

Configura también `KNOTE_MONGODB_URI`, `KNOTE_MONGODB_DB` y `BLOB_READ_WRITE_TOKEN`. Usa valores y servicios separados para desarrollo, Preview/staging y Production: una base de datos y un almacén Blob de pruebas para Preview, y recursos propios de producción para el entorno Production de Vercel. Registra el callback y el origen web de Karmancos ID que correspondan a cada entorno; no compartas las claves de sesión entre ellos. Crea un usuario de Atlas limitado a la base de KNote y guarda las credenciales solo como variables de servidor, nunca con el prefijo `VITE_`.

Antes del lanzamiento, despliega primero en Preview y verifica cuentas aisladas, sincronización y carga de imágenes. Activa las copias de seguridad automáticas o recuperación a un punto en el tiempo que admita tu clúster de Atlas, restaura una copia en una base de pruebas y confirma que la aplicación puede leerla. Repite esta prueba antes de migraciones importantes y conserva un procedimiento para volver a la versión anterior. Vercel Blob se configura como almacenamiento privado; las subidas de hasta 12 MB se hacen directamente desde el navegador, y KNote registra su propiedad en MongoDB.

### Crear MongoDB Atlas desde Windows

Instala Atlas CLI y MongoDB Shell (`mongosh`) desde las descargas oficiales de MongoDB. Para desarrollo o Preview, inicia sesión y crea un clúster de prueba; Atlas CLI te pedirá elegir organización/región y permite omitir los datos de muestra:

```powershell
atlas --version
atlas auth login
atlas setup --clusterName knote-preview --skipSampleData
```

El asistente añade la IP de tu equipo para probar localmente. Eso no autoriza automáticamente las funciones de Vercel. En Production, permite solo la salida de red fija de Vercel o configura una conexión privada; evita abrir Atlas a todas las IP si puedes.

En Atlas, crea un usuario de base de datos separado para la aplicación y asígnale solo `readWrite` sobre `knote`. Para obtener el proyecto y la cadena SRV:

```powershell
atlas projects list
atlas clusters connectionStrings describe knote-preview --projectId <PROJECT_ID>
```

Puedes crear explícitamente la base y las colecciones con `mongosh` (sustituye el host por el de la cadena SRV; al omitir la contraseña, Shell la solicita de forma interactiva):

```powershell
mongosh "mongodb+srv://<CLUSTER_HOST>/knote" --username knote-app
```

Dentro de `mongosh`:

```javascript
const knote = db.getSiblingDB('knote');
for (const name of ['pages', 'user_state', 'conflicts', 'shares', 'assets']) {
  if (!knote.getCollectionNames().includes(name)) knote.createCollection(name);
}
```

KNote también crea estas colecciones e índices al conectarse por primera vez, así que el paso manual sirve para comprobar el acceso. En Vercel configura `KNOTE_MONGODB_URI` con la cadena SRV y el usuario de la aplicación, `KNOTE_MONGODB_DB=knote`, y `BLOB_READ_WRITE_TOKEN` como variables de servidor. No pegues contraseñas en comandos guardados en el historial ni en el repositorio. El clúster gratuito sirve para pruebas; el de Production debe tener un nivel que admita las copias y restauraciones requeridas.

El inicio de sesión de escritorio no está habilitado. La aplicación de Windows conserva el resto de sus funciones locales.

## Aplicación de Windows

KNote también se puede ejecutar como aplicación de escritorio con Tauri y el WebView2 que ya usa Windows:

```sh
bun run desktop:dev
bun run desktop:build
```

El proyecto fija Bun `1.4.4` en `.bun-version`. El instalador `.exe` se genera en `src-tauri/target/release/bundle/nsis/`. Para compilarlo en Windows se necesitan Bun, Rust con el objetivo MSVC, Microsoft C++ Build Tools y Perl (por ejemplo, Strawberry Perl) para compilar el motor SQLCipher.

Las comprobaciones locales y de CI se ejecutan con `bun run check`; también están disponibles `bun run lint`, `bun run typecheck` y `bun run test:run` por separado.

## Datos

Sin iniciar sesión, la versión web guarda los datos en el almacenamiento local del navegador (`localStorage` e `IndexedDB`), en el dispositivo y origen desde el que se abre. Al iniciar sesión, el espacio de la cuenta se mantiene separado del espacio local. Al entrar por primera vez aparecen notas de ejemplo que puedes editar o eliminar.

Los documentos permanecen privados por defecto. Desde **Compartir** puedes publicar un documento de texto con un enlace aleatorio no listado; el enlace muestra los cambios ya sincronizados y se puede revocar en cualquier momento. Los enlaces revocados dejan de mostrar el documento y sus imágenes.

La aplicación de Windows guarda páginas, ajustes e imágenes en un único archivo cifrado, `Documentos/KNote/KNote.knt`. La clave se conserva en el Administrador de credenciales de Windows y queda ligada a la cuenta y al equipo. Para mover notas desde la versión web, abre **Personalizar tu espacio → Copias cifradas**, crea una transferencia protegida con contraseña y después impórtala desde la aplicación. Esa contraseña solo protege la transferencia; la app usa la clave de Windows para el archivo local. Si se pierde el perfil de Windows o su clave, el archivo no se podrá abrir; conserva una transferencia cifrada como copia de seguridad. Para recuperar una transferencia después de perder la clave, mueve el `KNote.knt` anterior fuera de `Documentos/KNote`, abre KNote para crear un archivo nuevo e importa el `.kntx`.

El buscador se abre con `Ctrl/Cmd + K`; `Ctrl/Cmd + N` crea una página.

## Editor de Python

Crea una página **Código** para editar y ejecutar un único script Python por página. El editor ofrece resaltado, autocompletado y ayuda contextual; `Ctrl/Cmd + Enter` ejecuta el script, `Ctrl/Cmd + F` busca y `Ctrl/Cmd + H` abre buscar y reemplazar. `input()` solicita la respuesta en la consola. Python, Jedi y mypy se empaquetan como recursos locales: la app de escritorio funciona sin conexión, y el código nunca se envía a un servicio externo.

Tauri y Vite ya envían las cabeceras COOP/COEP que requiere `SharedArrayBuffer` para detener una ejecución o responder a `input()` sin congelar la interfaz. La web usa COEP `credentialless` para permitir recursos públicos como las fotos de perfil sin credenciales; si publicas en otro servidor, conserva COOP `same-origin`, COEP `credentialless` y `wasm-unsafe-eval` en la CSP.

## Sistema visual

KNote usa la paleta `karmancos` y la receta `modern-flat` de Balsa UI. La paleta generada está en `src/styles/karmancos-palette.css`; la definición del tema, en `src/themes/karmancos.ts`. Los estilos propios de la app consumen los roles y materiales de Balsa para conservar su estructura con esa identidad visual.
