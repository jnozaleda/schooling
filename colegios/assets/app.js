/* Colegios · Infantil 2027-2028 — mapa + revisión conjunta
   Datos estáticos: data/colegios.json (versionado en git)
   Datos de la revisión: Google Sheets vía Apps Script (o localStorage si no está configurado) */
(() => {
'use strict';

const CFG = window.CONFIG || {};
const REMOTO = !!(CFG.APPS_SCRIPT_URL || '').trim();
const LS = {
  local:  'colegios.local.v1',    // estado cuando no hay Apps Script
  outbox: 'colegios.outbox.v1',   // cambios pendientes de enviar
  quien:  'colegios.quien.v1',
  geo:    'colegios.geo.v1'
};

const ESTADOS = {
  none:      { txt:'Sin ver',    corto:'—' },
  prospect:  { txt:'Candidato',  corto:'C' },
  approved:  { txt:'Aprobado',   corto:'A' },
  discarded: { txt:'Descartado', corto:'D' }
};

let DATA = null;              // { meta, colegios:[] }
let EST  = Object.create(null); // id -> {estado, visitado, lat, lng, punt:{}}
let NOTAS = [];               // [{id, colegio, autor, fecha, texto}]
let CASA = null;              // {lat,lng,direccion}
let sel = null;               // id seleccionado
let map, capaMarcas, marcas = Object.create(null), marcaCasa, anillos = [];

const $  = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------------- distancia ---------------- */
function metros(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null;
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 +
            Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)));
}
const fmtDist = m => m == null ? '—' : (m < 1000 ? m + ' m' : (m / 1000).toFixed(1).replace('.', ',') + ' km');

/* ---------------- estado de sincronización ---------------- */
function sync(clase, txt) {
  const el = $('#sync');
  el.className = clase;
  el.textContent = txt;
}
function banner(html) {
  const b = $('#banner');
  if (!html) { b.hidden = true; return; }
  b.innerHTML = html + '<button class="x" aria-label="Cerrar aviso">×</button>';
  b.hidden = false;
  b.querySelector('.x').onclick = () => {
    b.hidden = true;
    if (map) setTimeout(() => map.invalidateSize(), 60);
  };
}

/* ---------------- almacén ---------------- */
const outbox = {
  todo: () => lsGet(LS.outbox, []),
  push(op) { const q = outbox.todo(); q.push(op); lsSet(LS.outbox, q); },
  set(q) { lsSet(LS.outbox, q); }
};

async function post(payload) {
  // text/plain evita el preflight CORS, que Apps Script no maneja bien
  const r = await fetch(CFG.APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ secreto: CFG.SECRETO, ...payload })
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'error del script');
  return j;
}

async function flush() {
  if (!REMOTO) return;
  let q = outbox.todo();
  if (!q.length) return;
  sync('warn', 'Enviando ' + q.length + '…');
  while (q.length) {
    try { await post(q[0]); } 
    catch (e) { sync('err', q.length + ' sin enviar'); return; }
    q.shift(); outbox.set(q);
  }
  sync('ok', 'Guardado');
}

function guardaColegio(id, patch) {
  EST[id] = Object.assign({ estado:'none', visitado:'', punt:{} }, EST[id], patch);
  if (REMOTO) { outbox.push({ accion:'colegio', id, patch }); flush(); }
  else { lsSet(LS.local, { est: EST, notas: NOTAS }); sync('warn', 'Solo local'); }
}

function guardaNota(nota) {
  NOTAS.push(nota);
  if (REMOTO) { outbox.push({ accion:'nota', nota }); flush(); }
  else { lsSet(LS.local, { est: EST, notas: NOTAS }); sync('warn', 'Solo local'); }
}

async function cargaEstado() {
  if (!REMOTO) {
    const d = lsGet(LS.local, { est:{}, notas:[] });
    EST = Object.assign(Object.create(null), d.est);
    NOTAS = d.notas || [];
    sync('warn', 'Solo local');
    banner('<b>Modo local.</b> Las notas se guardan solo en este navegador y no se comparten. ' +
           'Configura <code>config.js</code> con la URL del Apps Script para sincronizar con la hoja de cálculo.');
    return;
  }
  sync('', 'Cargando…');
  try {
    const url = CFG.APPS_SCRIPT_URL + '?accion=estado&secreto=' + encodeURIComponent(CFG.SECRETO);
    const r = await fetch(url);
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'respuesta inválida');
    EST = Object.create(null);
    (j.colegios || []).forEach(c => {
      EST[c.id] = {
        estado: c.estado || 'none',
        visitado: c.visitado || '',
        lat: c.lat ?? null, lng: c.lng ?? null,
        punt: c.punt || {}
      };
    });
    NOTAS = j.notas || [];
    sync('ok', 'Sincronizado');
  } catch (e) {
    EST = Object.create(null); NOTAS = [];
    sync('err', 'Sin conexión');
    banner('<b>No se pudo leer la hoja de cálculo.</b> ' + esc(e.message) +
           ' — Se muestran los colegios, pero los cambios quedarán en cola hasta que vuelva la conexión.');
  }
}

/* ---------------- geocodificación (una sola vez por dirección) ---------------- */
const cacheGeo = () => lsGet(LS.geo, {});
async function geocodifica(dir) {
  const c = cacheGeo();
  if (c[dir]) return { ...c[dir], deCache: true };
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=es&q=' +
              encodeURIComponent(dir);
  const r = await fetch(url, { headers: { 'Accept':'application/json' } });
  const j = await r.json();
  if (!j.length) return null;
  const p = { lat: +j[0].lat, lng: +j[0].lon };
  c[dir] = p; lsSet(LS.geo, c);
  return p;
}

async function resuelveCoords() {
  // casa
  if (CFG.CASA?.lat != null) CASA = { ...CFG.CASA };
  else {
    const p = await geocodifica(CFG.CASA.direccion).catch(() => null);
    CASA = p ? { ...p, direccion: CFG.CASA.direccion } : null;
  }
  if (CASA) { dibujaCasa(); }

  // colegios sin coordenadas
  const faltan = DATA.colegios.filter(c => (EST[c.id]?.lat ?? c.lat) == null);
  if (!faltan.length) return;

  // Se resuelven todos y se repinta UNA vez al final: si repintáramos a cada
  // respuesta, la lista se reordenaría sola mientras alguien la está leyendo.
  let hechos = 0;
  for (const c of faltan) {
    sync('warn', 'Ubicando ' + (++hechos) + '/' + faltan.length + '…');
    try {
      const p = await geocodifica(c.direccion);
      if (p) {
        guardaColegio(c.id, { lat: p.lat, lng: p.lng });
        if (!p.deCache) await new Promise(r => setTimeout(r, 1100)); // uso justo de Nominatim
      }
    } catch { /* sin coordenadas: el colegio queda al final de la lista */ }
  }
  const sinUbicar = DATA.colegios.filter(c => !pos(c)).length;
  sync(REMOTO ? 'ok' : 'warn', REMOTO ? 'Guardado' : 'Solo local');
  if (sinUbicar) banner('<b>' + sinUbicar + ' colegio(s) sin ubicar en el mapa.</b> ' +
    'Añade sus coordenadas a mano en la pestaña <code>colegios</code> de la hoja.');
  pinta();
}

/* ---------------- derivados ---------------- */
const st  = id => EST[id]?.estado || 'none';
const pos = c  => {
  const e = EST[c.id];
  const lat = e?.lat ?? c.lat, lng = e?.lng ?? c.lng;
  return lat == null ? null : { lat:+lat, lng:+lng };
};
const dist = c => metros(CASA, pos(c));
const notasDe = id => NOTAS.filter(n => n.colegio === id)
                           .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

function filtrados() {
  const activos = [...document.querySelectorAll('#statuschips .chip')]
    .filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.st);
  const tipo = $('#tipo').value;
  const q = $('#q').value.trim().toLowerCase();
  let out = DATA.colegios.filter(c =>
    activos.includes(st(c.id)) &&
    (!tipo || c.tipo === tipo) &&
    (!q || (c.nombre + ' ' + c.direccion).toLowerCase().includes(q)));

  const orden = $('#orden').value;
  out.sort((a, b) => {
    if (orden === 'nombre') return a.nombre.localeCompare(b.nombre, 'es');
    if (orden === 'nota')   return (b.nota || 0) - (a.nota || 0);
    const da = dist(a), db = dist(b);
    if (da == null) return 1; if (db == null) return -1;
    return da - db;
  });
  return out;
}

/* ---------------- mapa ---------------- */
function iniMapa() {
  if (typeof L === 'undefined') {          // Leaflet no cargó: seguimos sin mapa
    document.getElementById('map').innerHTML =
      '<p class="empty">No se pudo cargar el mapa (assets/leaflet/leaflet.js). ' +
      'La lista sigue funcionando.</p>';
    return false;
  }
  map = L.map('map', { zoomControl:true, scrollWheelZoom:true })
         .setView([40.4590, -3.6350], 13);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd'
  }).addTo(map);
  capaMarcas = L.layerGroup().addTo(map);
  return true;
}

function dibujaCasa() {
  if (!CASA || !map) return;
  anillos.forEach(a => map.removeLayer(a)); anillos = [];
  (CFG.ANILLOS || []).forEach(m => {
    anillos.push(L.circle([CASA.lat, CASA.lng], {
      radius: m, color:'#FF5B08', weight:1, opacity:.45, fill:false, dashArray:'4 5'
    }).addTo(map));
    anillos.push(L.marker([CASA.lat + m / 111320, CASA.lng], {
      interactive:false,
      icon: L.divIcon({ className:'', html:'<span class="ringlabel">' + (m / 1000) + ' km</span>',
                        iconSize:[44, 14], iconAnchor:[22, 7] })
    }).addTo(map));
  });
  if (marcaCasa) map.removeLayer(marcaCasa);
  marcaCasa = L.marker([CASA.lat, CASA.lng], {
    zIndexOffset: 500,
    icon: L.divIcon({ className:'', html:'<div class="mk-home" style="width:18px;height:18px"></div>',
                      iconSize:[18, 18], iconAnchor:[9, 9] })
  }).addTo(map).bindTooltip('Casa · ' + (CASA.direccion || ''), { direction:'top' });
}

function dibujaMarcas() {
  if (!map) return;
  capaMarcas.clearLayers(); marcas = Object.create(null);
  const lista = filtrados();
  const puntos = [];
  lista.forEach(c => {
    const p = pos(c); if (!p) return;
    const e = st(c.id);
    const m = L.marker([p.lat, p.lng], {
      icon: L.divIcon({
        className: '',
        html: '<div class="mk' + (c.id === sel ? ' sel' : '') + '" data-st="' + e +
              '" style="width:24px;height:24px">' + ESTADOS[e].corto + '</div>',
        iconSize: [24, 24], iconAnchor: [12, 12]
      })
    }).addTo(capaMarcas)
      .bindTooltip(c.nombre + ' · ' + fmtDist(dist(c)), { direction:'top', offset:[0, -10] })
      .on('click', () => abre(c.id));
    marcas[c.id] = m;
    puntos.push([p.lat, p.lng]);
  });
  if (CASA) puntos.push([CASA.lat, CASA.lng]);
  if (puntos.length > 1 && !map._encuadrado) {
    map.fitBounds(L.latLngBounds(puntos).pad(0.12));
    map._encuadrado = true;
  }
}

/* ---------------- lista ---------------- */
function dibujaLista() {
  const lista = filtrados();
  $('#count').textContent = lista.length + ' de ' + DATA.colegios.length;
  const cont = $('#list');
  if (!lista.length) { cont.innerHTML = '<p class="empty">Ningún colegio con esos filtros.</p>'; return; }
  cont.innerHTML = lista.map(c => {
    const e = st(c.id), n = notasDe(c.id), ult = n[n.length - 1];
    return '<article class="card' + (c.id === sel ? ' sel' : '') + '" data-id="' + c.id + '">' +
      '<div class="pin" data-st="' + e + '">' + ESTADOS[e].corto + '</div>' +
      '<div class="body">' +
        '<h3>' + esc(c.nombre) + '</h3>' +
        '<div class="meta">' +
          '<span class="dist">' + fmtDist(dist(c)) + '</span>' +
          '<span>' + esc(c.tipo) + '</span>' +
          (c.nota ? '<span class="star">★ ' + String(c.nota).replace('.', ',') +
                    ' <span style="color:var(--muted)">(' + c.numResenas + ')</span></span>' : '') +
          (c.minAPie ? '<span>' + c.minAPie + ' min a pie</span>' : '') +
          (n.length ? '<span>' + n.length + ' nota' + (n.length > 1 ? 's' : '') + '</span>' : '') +
        '</div>' +
        (ult ? '<div class="note-flag">' + esc(ult.autor) + ': ' + esc(ult.texto) + '</div>' : '') +
      '</div></article>';
  }).join('');
  cont.querySelectorAll('.card').forEach(el =>
    el.onclick = () => abre(el.dataset.id));
}

/* ---------------- panel de detalle ---------------- */
function abre(id) {
  sel = id; pinta();
  const c = DATA.colegios.find(x => x.id === id);
  const e = EST[id] || { estado:'none', visitado:'', punt:{} };
  const p = pos(c), d = dist(c);
  const rutaBase = 'https://www.google.com/maps/dir/?api=1&origin=' +
    encodeURIComponent(CFG.CASA.direccion) + '&destination=' + encodeURIComponent(c.direccion);

  const fila = (t, v) => v ? '<div><b>' + t + '</b>' + esc(v) + '</div>' : '';
  const enlace = (u, t) => u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + t + '</a>' : '';

  $('#drawer').innerHTML =
  '<div class="dw-head">' +
    '<button class="dw-close" aria-label="Cerrar">×</button>' +
    '<h2>' + esc(c.nombre) + '</h2>' +
    '<div class="sub">' + esc(c.tipo) + ' · ' + fmtDist(d) + ' en línea recta · ' + esc(c.direccion) + '</div>' +
  '</div>' +
  '<div class="dw-body">' +

    '<div class="review">' +
      '<h4>Vuestra revisión</h4>' +
      '<div class="statusrow">' +
        ['prospect','approved','discarded'].map(k =>
          '<button data-st="' + k + '" aria-pressed="' + (e.estado === k) + '">' +
          ESTADOS[k].txt + '</button>').join('') +
      '</div>' +
      '<div class="visited"><label for="vis">Visitado el</label>' +
        '<input id="vis" type="date" value="' + esc(e.visitado || '') + '"></div>' +
      '<div class="scores">' +
        (CFG.REVISORES || []).map(r =>
          '<div class="scorebox"><b class="label">' + esc(r) + '</b><div class="stars" data-rev="' + esc(r) + '">' +
          [1,2,3,4,5].map(n => '<button data-n="' + n + '" class="' +
            ((e.punt?.[r] || 0) >= n ? 'on' : '') + '">★</button>').join('') +
          '</div></div>').join('') +
      '</div>' +
      '<div class="notes" id="notas"></div>' +
      '<div class="addnote">' +
        '<textarea id="nuevanota" placeholder="Qué habéis visto en la visita…"></textarea>' +
      '</div>' +
      '<div class="addnote"><button id="addnota" disabled>Añadir nota</button></div>' +
    '</div>' +

    '<div class="route">' +
      '<a href="' + rutaBase + '&travelmode=walking" target="_blank" rel="noopener">Ruta a pie</a>' +
      '<a href="' + rutaBase + '&travelmode=driving" target="_blank" rel="noopener">Ruta en coche</a>' +
    '</div>' +

    '<section style="margin-top:20px"><h4>Del informe</h4>' +
      '<p>' + esc(c.valoracion || '') + '</p></section>' +

    '<section><div class="facts">' +
      fila('Proyecto', c.proyecto) +
      fila('Costes de referencia', c.costes) +
      fila('Hermanos', c.hermanos) +
      fila('Trayecto publicado', [c.minAPie ? c.minAPie + ' min a pie' : null,
                                  c.minCoche ? c.minCoche + ' min en coche' : null]
                                 .filter(Boolean).join(' · ') || 'Pendiente de comprobar') +
      fila('Reseñas (' + esc(c.portal) + ')', c.nota ? c.nota + '/5 con ' + c.numResenas + ' valoraciones' : null) +
      fila('Contraste', c.contraste) +
    '</div></section>' +

    '<section><h4>Enlaces</h4><div class="links">' +
      enlace(c.urlCentro, 'Web del centro') + enlace(c.urlResenas, 'Reseñas') +
      enlace(c.urlContraste, 'Contraste') + enlace(c.urlTarifas, 'Tarifas') +
      (p ? '<a href="https://www.google.com/maps?q=' + p.lat + ',' + p.lng +
           '" target="_blank" rel="noopener">Ver en Google Maps</a>' : '') +
    '</div></section>' +
  '</div>';

  pintaNotas(id);
  const dw = $('#drawer');
  dw.classList.add('open'); dw.setAttribute('aria-hidden', 'false'); dw.scrollTop = 0;

  dw.querySelector('.dw-close').onclick = cierra;
  dw.querySelectorAll('.statusrow button').forEach(b => b.onclick = () => {
    const nuevo = e.estado === b.dataset.st ? 'none' : b.dataset.st;
    guardaColegio(id, { estado: nuevo });
    abre(id);
  });
  $('#vis').onchange = ev => guardaColegio(id, { visitado: ev.target.value });
  dw.querySelectorAll('.stars').forEach(box => box.querySelectorAll('button').forEach(b => b.onclick = () => {
    const rev = box.dataset.rev, n = +b.dataset.n;
    const punt = Object.assign({}, e.punt);
    punt[rev] = punt[rev] === n ? 0 : n;
    guardaColegio(id, { punt });
    abre(id);
  }));
  const ta = $('#nuevanota'), bt = $('#addnota');
  ta.oninput = () => bt.disabled = !ta.value.trim();
  bt.onclick = () => {
    const texto = ta.value.trim(); if (!texto) return;
    guardaNota({ id: uid(), colegio: id, autor: $('#who').value,
                 fecha: new Date().toISOString(), texto });
    ta.value = ''; bt.disabled = true;
    pintaNotas(id); dibujaLista();
  };
  if (p && map) map.panTo([p.lat, p.lng], { animate:true });
}

function pintaNotas(id) {
  const n = notasDe(id);
  $('#notas').innerHTML = n.length
    ? n.map(x => '<div class="note"><div class="who-when">' + esc(x.autor) + ' · ' +
        new Date(x.fecha).toLocaleDateString('es-ES', { day:'numeric', month:'short', year:'numeric' }) +
        '</div><div class="txt">' + esc(x.texto) + '</div></div>').join('')
    : '<p style="color:var(--muted);font-size:13px;margin:0">Todavía no hay notas.</p>';
}

function cierra() {
  sel = null;
  const dw = $('#drawer');
  dw.classList.remove('open'); dw.setAttribute('aria-hidden', 'true');
  pinta();
}

/* ---------------- pintar todo ---------------- */
function pinta() { dibujaLista(); dibujaMarcas(); }

/* ---------------- arranque ---------------- */
async function main() {
  iniMapa();

  const who = $('#who');
  who.innerHTML = (CFG.REVISORES || ['Yo']).map(r => '<option>' + esc(r) + '</option>').join('');
  who.value = lsGet(LS.quien, (CFG.REVISORES || ['Yo'])[0]);
  who.onchange = () => lsSet(LS.quien, who.value);

  $('#homelabel').textContent = 'Casa: ' + (CFG.CASA?.direccion || '—');

  try {
    const r = await fetch('data/colegios.json');
    DATA = await r.json();
  } catch (e) {
    banner('<b>No se pudo cargar data/colegios.json.</b> Abre la página con un servidor ' +
           '(<code>python3 -m http.server</code>) o desde GitHub Pages, no con doble clic.');
    return;
  }

  await cargaEstado();

  // primera vez: dejamos la hoja de calculo poblada con los 16 colegios
  if (REMOTO && !Object.keys(EST).length) {
    outbox.push({ accion:'sembrar',
      colegios: DATA.colegios.map(c => ({ id:c.id, nombre:c.nombre })) });
  }
  await flush();
  pinta();
  resuelveCoords();

  ['#tipo', '#orden'].forEach(s => $(s).onchange = pinta);
  $('#q').oninput = pinta;
  document.querySelectorAll('#statuschips .chip').forEach(b => b.onclick = () => {
    b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true');
    pinta();
  });
  const setVista = v => {
    $('#main').className = 'm-' + v;
    $('#tabmap').setAttribute('aria-pressed', v === 'map');
    $('#tablist').setAttribute('aria-pressed', v === 'list');
    if (v === 'map' && map) setTimeout(() => map.invalidateSize(), 60);
  };
  $('#tabmap').onclick  = () => setVista('map');
  $('#tablist').onclick = () => setVista('list');
  const tf = $('#togglefiltros');
  tf.setAttribute('aria-pressed', 'false');
  tf.onclick = () => {
    const abierto = $('#filtros').classList.toggle('abierto');
    tf.setAttribute('aria-pressed', String(abierto));
    if (map) setTimeout(() => map.invalidateSize(), 60);
  };
  if (window.matchMedia('(min-width:861px)').matches) $('#main').className = '';
  window.addEventListener('resize', () => {
    if (window.matchMedia('(min-width:861px)').matches) $('#main').className = '';
    else if (!$('#main').className) setVista('map');
  });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') cierra(); });
  window.addEventListener('online', flush);
  setInterval(flush, 30000);
}
main();
})();
