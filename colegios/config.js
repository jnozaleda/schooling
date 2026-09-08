/* ------------------------------------------------------------------
   CONFIGURACIÓN — es el único archivo que tienes que tocar.
   Mientras APPS_SCRIPT_URL esté vacío, la app funciona en modo local
   (las notas se guardan solo en este navegador y NO se comparten).
   ------------------------------------------------------------------ */
window.CONFIG = {

  // Pega aquí la URL que te da Google al desplegar el Apps Script.
  // Termina en /exec  ·  ver apps-script/README-setup.md
  APPS_SCRIPT_URL: "",

  // La misma palabra secreta que pongas en Code.gs.
  SECRETO: "cambia-esto",

  // Quiénes hacéis la revisión. Cambia los nombres a vuestro gusto.
  REVISORES: ["Noza", "Maite"],

  // Tu casa. Si dejas lat/lng en null se geocodifica sola la primera vez.
  CASA: {
    direccion: "Avenida de las Piceas 12, Madrid",
    lat: null,
    lng: null
  },

  // Anillos de distancia en el mapa (metros).
  ANILLOS: [1000, 2000, 3000]
};
