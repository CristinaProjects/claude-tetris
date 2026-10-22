---
name: worktree
description: Crea un git worktree aislado en .trees/<nombre> y ejecuta allí el requerimiento recibido, sin tocar el código principal.
argument-hint: <requerimiento a implementar>
disable-model-invocation: true
---

# /worktree

Requerimiento recibido:

$ARGUMENTS

## Pasos

1. **Validar.** Si el requerimiento está vacío, pide a Cristina que lo indique y detente.

2. **Nombre.** Deriva del requerimiento un nombre corto en kebab-case, en minúsculas, sin acentos ni espacios (máx. ~40 caracteres). Ejemplo: "añadir sonido al limpiar líneas" → `sonido-limpiar-lineas`. Si `.trees/<nombre>` o la rama `<nombre>` ya existen, añade un sufijo `-2`, `-3`…

3. **Ignorar `.trees/`.** Si `.trees/` no está ignorado (`git check-ignore -q .trees/x` falla), añade la línea `.trees/` a `.git/info/exclude` (local, no modifica archivos versionados).

4. **Crear el worktree** desde la raíz del repositorio principal, con rama nueva basada en el `HEAD` actual:

   ```bash
   git worktree add -b <nombre> .trees/<nombre>
   ```

   Si falla, muestra el error y detente.

5. **Trabajar solo en el worktree.** Ruta de trabajo: `<raíz del repo>/.trees/<nombre>`.
   - Haz `cd` a esa ruta antes de cualquier comando.
   - Usa rutas absolutas dentro del worktree en Read/Edit/Write/Grep/Glob.
   - No modifiques ningún archivo fuera de `.trees/<nombre>`.
   - Ejecuta git con `git -C .trees/<nombre> …` o desde dentro del worktree.

6. **Ejecutar el requerimiento** dentro del worktree, siguiendo `CLAUDE.md` del proyecto.

7. **No** hagas commit, push, merge ni borres el worktree salvo que Cristina lo pida.

8. **Informe final** (corto): nombre de la rama, ruta del worktree, archivos cambiados, cómo probarlo y cómo limpiarlo:

   ```bash
   git worktree remove .trees/<nombre>
   git branch -D <nombre>
   ```
