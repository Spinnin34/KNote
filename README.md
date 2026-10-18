# KNote

Un espacio personal para guardar ideas y notas, con una interfaz oscura y ligera.

## Iniciar

```sh
npm install
npm run dev
```

Para generar la versión de producción:

```sh
npm run build
```

Los archivos listos quedan en `dist/`.

## Aplicación de Windows

KNote también se puede ejecutar como aplicación de escritorio con Tauri y el WebView2 que ya usa Windows:

```sh
npm run desktop:dev
npm run desktop:build
```

El instalador `.exe` se genera en `src-tauri/target/release/bundle/nsis/`. Para compilarlo en Windows se necesitan Node.js, Rust con el objetivo MSVC, Microsoft C++ Build Tools y Perl (por ejemplo, Strawberry Perl) para compilar el motor SQLCipher.

## Datos

KNote no necesita cuenta ni servidor. La versión web guarda los datos en el almacenamiento local del navegador (`localStorage` e `IndexedDB`), en el dispositivo y origen desde el que se abre. Al entrar por primera vez aparecen notas de ejemplo que puedes editar o eliminar.

La aplicación de Windows guarda páginas, ajustes e imágenes en un único archivo cifrado, `Documentos/KNote/KNote.knt`. La clave se conserva en el Administrador de credenciales de Windows y queda ligada a la cuenta y al equipo. Para mover notas desde la versión web, abre **Personalizar tu espacio → Copias cifradas**, crea una transferencia protegida con contraseña y después impórtala desde la aplicación. Esa contraseña solo protege la transferencia; la app usa la clave de Windows para el archivo local. Si se pierde el perfil de Windows o su clave, el archivo no se podrá abrir; conserva una transferencia cifrada como copia de seguridad. Para recuperar una transferencia después de perder la clave, mueve el `KNote.knt` anterior fuera de `Documentos/KNote`, abre KNote para crear un archivo nuevo e importa el `.kntx`.

El buscador se abre con `Ctrl/Cmd + K`; `Ctrl/Cmd + N` crea una página.

## Editor de Python

Crea una página **Código** para editar y ejecutar un único script Python por página. El editor ofrece resaltado, autocompletado y ayuda contextual; `Ctrl/Cmd + Enter` ejecuta el script, `Ctrl/Cmd + F` busca y `Ctrl/Cmd + H` abre buscar y reemplazar. `input()` solicita la respuesta en la consola. Python, Jedi y mypy se empaquetan como recursos locales: la app de escritorio funciona sin conexión, y el código nunca se envía a un servicio externo.

Tauri y Vite ya envían las cabeceras COOP/COEP que requiere `SharedArrayBuffer` para detener una ejecución o responder a `input()` sin congelar la interfaz. Si publicas la versión web en otro servidor, configura `Cross-Origin-Opener-Policy: same-origin` y `Cross-Origin-Embedder-Policy: require-corp`, y conserva `wasm-unsafe-eval` en la CSP.

## Sistema visual

KNote usa la paleta `karmancos` y la receta `modern-flat` de Balsa UI. La paleta generada está en `src/styles/karmancos-palette.css`; la definición del tema, en `src/themes/karmancos.ts`. Los estilos propios de la app consumen los roles y materiales de Balsa para conservar su estructura con esa identidad visual.
