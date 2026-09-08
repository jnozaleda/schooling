# Colegios · Infantil 2027–2028

Mapa y herramienta de revisión para elegir colegio de Infantil (curso 2027–2028)
en la zona de Conde de Orgaz / Canillas / Canillejas, Madrid.

Sustituye al informe estático `Informe_colegios.html`: mismos datos, pero con el
mapa como eje y con etiquetas y notas compartidas para hacer la revisión entre dos.

## Qué hace

- **Mapa primero.** Los 16 centros sobre el mapa, con la casa marcada y anillos
  de 1, 2 y 3 km. La lista va ordenada por distancia real en línea recta.
- **Etiquetas.** Cada colegio puede marcarse como *Candidato*, *Aprobado* o
  *Descartado*. El color del pin cambia al momento, y los descartados se ocultan
  por defecto.
- **Notas de visita.** Registro con autor y fecha, para ir apuntando lo que
  veis en cada visita.
- **Puntuación por persona.** Cinco estrellas para cada revisor, por separado,
  para ver dónde coincidís y dónde no.
- **Funciona en el móvil**, que es donde vais a usarlo de verdad: a la puerta
  del colegio. Sin cobertura, los cambios se guardan y se envían al volver.

## Estructura

```
index.html               la app
config.js                lo único que hay que editar
assets/app.js            lógica
assets/styles.css        estilos
data/colegios.json       los 16 centros (datos del informe, versionados en git)
apps-script/Code.gs      backend en Google Sheets
apps-script/README-setup.md   cómo conectarlo (10 min)
```

La separación importante: **`data/colegios.json` es la investigación** (fija, en
git, con su historial) y **la hoja de cálculo es la revisión** (viva, compartida,
cambia cada semana). Si algún día se rehace la app, las notas siguen ahí.

## Subir a GitHub

```bash
cd colegios
git init -b main
git add .
git commit -m "Mapa y revisión de colegios · Infantil 2027-2028"
gh repo create colegios --private --source=. --push
# sin gh:  git remote add origin git@github.com:TU-USUARIO/colegios.git && git push -u origin main
```

Hazlo **privado**: `config.js` va a contener la URL de escritura de tu hoja de
cálculo y el secreto.

## Puesta en marcha

1. Sube este repositorio a GitHub.
2. *Settings → Pages → Source: Deploy from a branch → `main` / root.*
3. Sigue [`apps-script/README-setup.md`](apps-script/README-setup.md) para
   conectar la hoja de cálculo.

Hasta que hagas el paso 3, la app funciona en **modo local**: se ve todo, pero
las notas se guardan solo en el navegador que las escribe y no se comparten.
Sale un aviso naranja para que no se os pase.

Para probarlo en tu Mac antes de subirlo:

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

(Abrirlo con doble clic no funciona: el navegador bloquea la lectura de
`data/colegios.json` desde `file://`.)

## Coordenadas

El informe original traía direcciones, no coordenadas. La primera vez que se
abre la app, geocodifica las 16 direcciones contra OpenStreetMap (una por
segundo) y guarda el resultado en la hoja de cálculo. A partir de ahí no vuelve
a pedirlo.

Si algún pin cae en el sitio equivocado, corrige `lat` y `lng` en la pestaña
`colegios` de la hoja y recarga. Es la ventaja de tener la hoja como base de
datos: se arregla a mano en diez segundos.

## Sobre los datos

Vienen del informe de investigación del 8 de septiembre de 2026 y **conservan
sus límites**: los tiempos de trayecto solo están comprobados en dos centros,
las tarifas son de 2026–2027 (no de 2027–2028), y las notas de los portales
mezclan etapas educativas. La distancia que calcula el mapa es **en línea
recta**, no tiempo andando — sirve para comparar, no para planificar la mañana.
Los enlaces de ruta de cada ficha sí abren Google Maps con el trayecto real.
