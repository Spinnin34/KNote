<!-- balsa-ui-agent-context:start -->
## Balsa UI

- Before writing common controls or surfaces, run `npx balsa-ui@latest search "<intent>"`, then read only the selected `.balsa/specs/components/<name>.json`.
- Install matching items with `npx balsa-ui@latest add <name>` before implementing the interface. Do not rebuild a Balsa-covered control with raw HTML and CSS.
- The specification is sufficient for normal composition. Inspect installed component source only when changing its behavior.
- Use semantic Balsa tokens and preserve component accessibility behavior and typed APIs.
- For new templates, showcases, blocks, or visually driven pages, use `$balsa-template-design` with `$balsa-ui` before coding. The companion skill is installed under `.agents/skills/`.
- Treat installed files as application source. Never use `--force` without reviewing local differences.
- Validate application changes with the repository's existing lint, test, typecheck, and build commands.
<!-- balsa-ui-agent-context:end -->

## Finalizar cambios y desplegar

- Al terminar cualquier cambio de código, ejecuta `bun run check`, revisa `git diff --check` y `git status`, y confirma que no se incluyeron secretos, `.env.local`, artefactos locales ni archivos ajenos a la tarea.
- Cuando las comprobaciones pasen, crea un commit directamente en `main` y súbelo a `origin/main`. El título debe resumir el cambio y el cuerpo debe enumerar en viñetas los cambios importantes. No reescribas el historial ni uses `--force`; si la rama remota avanzó o hay conflictos, integra los cambios de forma segura antes de continuar.
- Después del push, espera a que el despliegue de Vercel asociado a ese commit alcance un estado terminal. Comprueba el estado y la URL mediante Vercel o las comprobaciones de GitHub. No informes que está desplegado si no puedes verificarlo; indica el bloqueo exacto y continúa esperando cuando sea posible.
- Mantén separados Preview y Production. No guardes credenciales en Git ni en variables `VITE_`; revisa que MongoDB Atlas y Vercel Blob tengan las variables y recursos del entorno correspondiente antes de dar por lista una integración en producción.
