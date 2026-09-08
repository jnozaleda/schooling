# Conectar la hoja de cálculo (10 minutos, una sola vez)

La app no necesita servidor. La hoja de cálculo **es** la base de datos, y este
script es el pequeño intermediario que le permite escribir en ella.

## 1. Crea la hoja

1. Ve a [sheets.new](https://sheets.new) y crea una hoja en blanco.
2. Ponle nombre, por ejemplo **Colegios · revisión**.
3. No hace falta crear pestañas ni cabeceras: el script las crea solo
   (`colegios` y `notas`) la primera vez.

## 2. Pega el script

1. En esa hoja: **Extensiones → Apps Script**.
2. Borra el `function myFunction() {}` que viene por defecto.
3. Pega entero el contenido de `Code.gs`.
4. Arriba del todo, cambia estas dos líneas:

   ```js
   const SECRETO   = 'una-palabra-que-elijas-tu';
   const REVISORES = ['Noza', 'Marta'];
   ```

5. Guarda (💾).

## 3. Publícalo

1. **Implementar → Nueva implementación**.
2. En el engranaje ⚙ elige **Aplicación web**.
3. Rellena:
   - *Ejecutar como*: **Yo**
   - *Quién tiene acceso*: **Cualquier usuario**
4. **Implementar**. Google te pedirá permisos: acepta.
   En la pantalla de aviso, pulsa *Configuración avanzada → Ir a (nombre) (no seguro)*.
   Es tu propio script, y ese aviso sale siempre con scripts sin verificar.
5. Copia la **URL de la aplicación web**. Termina en `/exec`.

## 4. Conecta la app

Abre `config.js` en la raíz del repositorio y rellena:

```js
APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfy.../exec",
SECRETO: "la-misma-palabra-que-pusiste-en-Code.gs",
REVISORES: ["Noza", "Marta"],
```

Guarda, haz commit y sube. Al abrir la página, la etiqueta de arriba a la
derecha debe pasar de *Cargando…* a **Sincronizado**, y la hoja se rellenará
sola con los 16 colegios.

## Cómo usarlo a partir de ahí

- **Desde la app**: etiquetas, puntuaciones y notas se escriben en la hoja al momento.
- **Desde la hoja**: podéis escribir directamente en las celdas. La app lo lee
  al recargar. Es la vía cómoda si tu mujer prefiere el móvil con Google Sheets.
- **Sin cobertura** (a la puerta de un colegio): los cambios se guardan en el
  móvil y se envían solos al recuperar la conexión. La etiqueta de estado dice
  cuántos quedan pendientes.

## Si algo falla

| Síntoma | Causa casi siempre |
|---|---|
| `secreto incorrecto` | `SECRETO` en `Code.gs` y en `config.js` no coinciden |
| Se queda en *Cargando…* | La implementación no está como *Cualquier usuario* |
| Los cambios no llegan | Editaste `Code.gs` sin crear una **nueva** implementación |

Cada vez que cambies `Code.gs`, hay que hacer **Implementar → Gestionar
implementaciones → editar ✏ → Versión: Nueva versión → Implementar**. Si creas
una implementación nueva desde cero, la URL cambia y hay que actualizar `config.js`.

## Sobre la seguridad

Esa URL es un punto de escritura sin contraseña de Google: quien la tenga y
sepa el secreto puede escribir en la hoja. Para una lista de colegios es
razonable. No metáis nada sensible ahí, y no publiquéis la URL fuera de casa.
Si el repositorio de GitHub es **público**, la URL y el secreto quedan a la
vista de cualquiera — en ese caso, haz el repositorio **privado** (Settings →
Danger Zone → Change visibility) y usa GitHub Pages privado, o acepta que
alguien podría escribir en la hoja.
