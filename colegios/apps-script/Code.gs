/**
 * Colegios · Infantil 2027-2028 — backend en Google Sheets
 *
 * Este script vive dentro de la propia hoja de cálculo (Extensiones > Apps Script)
 * y la convierte en la base de datos de la app.
 *
 * Pasos de instalación: ver README-setup.md
 */

// ---- CONFIGURA ESTO ---------------------------------------------------
const SECRETO   = 'cambia-esto';        // debe coincidir con config.js
const REVISORES = ['Noza', 'Marta'];    // debe coincidir con config.js
// -----------------------------------------------------------------------

const H_COL = ['id', 'nombre', 'estado', 'visitado', 'lat', 'lng']
                .concat(REVISORES.map(r => 'nota ' + r));
const H_NOT = ['id', 'colegio', 'nombre colegio', 'autor', 'fecha', 'texto'];

function hoja_(nombre, cabeceras) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(nombre);
  if (!sh) {
    sh = ss.insertSheet(nombre);
    sh.appendRow(cabeceras);
    sh.getRange(1, 1, 1, cabeceras.length).setFontWeight('bold').setBackground('#171A23')
      .setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  }
  return sh;
}

function filas_(sh) {
  const v = sh.getDataRange().getValues();
  if (v.length < 2) return { cab: v[0] || [], datos: [] };
  return { cab: v[0], datos: v.slice(1) };
}

function ok_(obj)  { return salida_(Object.assign({ ok: true }, obj)); }
function err_(msg) { return salida_({ ok: false, error: String(msg) }); }
function salida_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
                       .setMimeType(ContentService.MimeType.JSON);
}

// ------------------------------- LECTURA -------------------------------
function doGet(e) {
  try {
    if ((e.parameter.secreto || '') !== SECRETO) return err_('secreto incorrecto');

    const shC = hoja_('colegios', H_COL);
    const shN = hoja_('notas', H_NOT);
    const C = filas_(shC), N = filas_(shN);

    const colegios = C.datos.filter(r => r[0]).map(r => {
      const punt = {};
      REVISORES.forEach((rev, i) => {
        const v = r[6 + i];
        if (v !== '' && v != null) punt[rev] = Number(v);
      });
      return {
        id: String(r[0]), nombre: r[1], estado: r[2] || 'none',
        visitado: r[3] ? Utilities.formatDate(new Date(r[3]),
                    Session.getScriptTimeZone(), 'yyyy-MM-dd') : '',
        lat: r[4] === '' ? null : Number(r[4]),
        lng: r[5] === '' ? null : Number(r[5]),
        punt: punt
      };
    });

    const notas = N.datos.filter(r => r[0]).map(r => ({
      id: String(r[0]), colegio: String(r[1]), autor: r[3],
      fecha: r[4] instanceof Date ? r[4].toISOString() : String(r[4]),
      texto: String(r[5])
    }));

    return ok_({ colegios: colegios, notas: notas });
  } catch (ex) { return err_(ex.message); }
}

// ------------------------------- ESCRITURA -----------------------------
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const p = JSON.parse(e.postData.contents);
    if ((p.secreto || '') !== SECRETO) return err_('secreto incorrecto');

    if (p.accion === 'colegio')  return upsertColegio_(p.id, p.patch || {});
    if (p.accion === 'nota')     return anadeNota_(p.nota || {});
    if (p.accion === 'sembrar')  return siembra_(p.colegios || []);
    return err_('acción desconocida: ' + p.accion);

  } catch (ex) { return err_(ex.message); }
  finally { try { lock.releaseLock(); } catch (ex) {} }
}

function buscaFila_(sh, id) {
  const ids = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return 0;
}

function upsertColegio_(id, patch) {
  if (!id) return err_('falta id');
  const sh = hoja_('colegios', H_COL);
  let fila = buscaFila_(sh, id);
  if (!fila) {
    sh.appendRow([id, patch.nombre || id, 'none', '', '', ''].concat(REVISORES.map(() => '')));
    fila = sh.getLastRow();
  }
  const set = (col, val) => sh.getRange(fila, col).setValue(val);
  if (patch.nombre   !== undefined) set(2, patch.nombre);
  if (patch.estado   !== undefined) set(3, patch.estado);
  if (patch.visitado !== undefined) set(4, patch.visitado);
  if (patch.lat      !== undefined) set(5, patch.lat);
  if (patch.lng      !== undefined) set(6, patch.lng);
  if (patch.punt) {
    REVISORES.forEach((rev, i) => {
      if (patch.punt[rev] !== undefined) set(7 + i, patch.punt[rev] || '');
    });
  }
  return ok_({ fila: fila });
}

function anadeNota_(n) {
  if (!n.colegio || !n.texto) return err_('nota incompleta');
  const shN = hoja_('notas', H_NOT);
  const shC = hoja_('colegios', H_COL);
  const f = buscaFila_(shC, n.colegio);
  const nombre = f ? shC.getRange(f, 2).getValue() : n.colegio;
  shN.appendRow([n.id || Utilities.getUuid(), n.colegio, nombre,
                 n.autor || '', n.fecha || new Date().toISOString(), n.texto]);
  return ok_({});
}

function siembra_(lista) {
  const sh = hoja_('colegios', H_COL);
  if (sh.getLastRow() > 1) return ok_({ omitido: true });   // ya hay datos, no tocar
  const filas = lista.map(c => [c.id, c.nombre, 'none', '', c.lat || '', c.lng || '']
                                .concat(REVISORES.map(() => '')));
  if (filas.length) sh.getRange(2, 1, filas.length, H_COL.length).setValues(filas);
  sh.autoResizeColumns(1, 2);
  return ok_({ sembrados: filas.length });
}
