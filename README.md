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

## Datos

KNote no necesita cuenta ni servidor. Guarda las páginas en el almacenamiento local del navegador (`localStorage`), en el dispositivo y origen desde el que se abre. Al entrar por primera vez aparecen cuatro notas de ejemplo que puedes editar o eliminar. El buscador se abre con `Ctrl/Cmd + K`; `Ctrl/Cmd + N` crea una página.

## Sistema visual

KNote usa la paleta `karmancos` y la receta `modern-flat` de Balsa UI. La paleta generada está en `src/styles/karmancos-palette.css`; la definición del tema, en `src/themes/karmancos.ts`. Los estilos propios de la app consumen los roles y materiales de Balsa para conservar su estructura con esa identidad visual.
