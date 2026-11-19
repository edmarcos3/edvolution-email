// Base de datos en la hoja de cálculo: una pestaña por tabla, primera fila = cabeceras.

var HOJAS = {
  Contactos: ['email', 'nombre', 'organizacion', 'cargo', 'listas', 'estado', 'consentimiento', 'alta', 'notas'],
  Campanas: ['id', 'tipo', 'nombre', 'lista', 'asunto', 'cuerpo', 'formato', 'programada', 'estado', 'creada', 'enviada', 'total'],
  Pasos: ['secuencia_id', 'paso', 'dias', 'asunto', 'cuerpo'],
  Inscripciones: ['id', 'secuencia_id', 'email', 'paso', 'proximo', 'estado', 'thread_id', 'ultimo_msg', 'alta'],
  Envios: ['id', 'campana_id', 'paso', 'email', 'fecha', 'message_id', 'thread_id', 'estado', 'error'],
  Enlaces: ['campana_id', 'paso', 'n', 'url'],
  Eventos: ['fecha', 'envio_id', 'tipo', 'detalle'],
};

function prop(k, def) {
  var v = PropertiesService.getScriptProperties().getProperty(k);
  return v === null || v === '' ? (def === undefined ? '' : def) : v;
}
function setProps(obj) { PropertiesService.getScriptProperties().setProperties(obj); }

function libro() {
  var id = prop('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}
function hoja(nombre) {
  var sh = libro().getSheetByName(nombre);
  if (!sh) throw new Error('Falta la pestaña "' + nombre + '". Ejecuta Edvolution Email → Configuración inicial.');
  return sh;
}

/** Devuelve las filas como objetos (con _fila = nº de fila en la hoja). */
function leer(nombre) {
  var sh = hoja(nombre);
  var v = sh.getDataRange().getValues();
  var cab = v.shift() || [];
  return v.filter(function (r) { return r.join('') !== ''; }).map(function (r, i) {
    var o = { _fila: i + 2 };
    cab.forEach(function (c, j) { o[String(c).trim()] = r[j]; });
    return o;
  });
}
function fila(nombre, obj) { return HOJAS[nombre].map(function (c) { return obj[c] === undefined || obj[c] === null ? '' : obj[c]; }); }
function anadir(nombre, obj) { hoja(nombre).appendRow(fila(nombre, obj)); }
function anadirVarios(nombre, objs) {
  if (!objs.length) return;
  var sh = hoja(nombre);
  sh.getRange(sh.getLastRow() + 1, 1, objs.length, HOJAS[nombre].length).setValues(objs.map(function (o) { return fila(nombre, o); }));
}
function actualizar(nombre, numFila, cambios) {
  var sh = hoja(nombre);
  var cab = HOJAS[nombre];
  Object.keys(cambios).forEach(function (k) {
    var j = cab.indexOf(k);
    if (j >= 0) sh.getRange(numFila, j + 1).setValue(cambios[k]);
  });
}
/** Busca una fila por el valor exacto de la primera columna (rápido, sin leer toda la hoja). */
function buscarFila(nombre, valor) {
  if (!valor) return null;
  var sh = hoja(nombre);
  var c = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).createTextFinder(String(valor)).matchEntireCell(true).findNext();
  if (!c) return null;
  var vals = sh.getRange(c.getRow(), 1, 1, HOJAS[nombre].length).getValues()[0];
  var o = { _fila: c.getRow() };
  HOJAS[nombre].forEach(function (k, j) { o[k] = vals[j]; });
  return o;
}

function uid() { return Utilities.getUuid().replace(/-/g, '').slice(0, 16); }
function aIso(v) { return v instanceof Date ? v.toISOString() : v; }
/** google.script.run no admite Date: los pasamos a texto ISO. */
function limpio(o) {
  var r = {};
  Object.keys(o).forEach(function (k) { r[k] = aIso(o[k]); });
  return r;
}
function listasDe(c) { return String(c.listas || '').split(',').map(function (s) { return s.trim(); }).filter(String); }
function activo(c) { return !c.estado || String(c.estado).toLowerCase() === 'activo'; }
function contactosDeLista(lista) {
  var vistos = {};
  return leer('Contactos').filter(function (c) {
    var em = String(c.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em) || vistos[em] || !activo(c)) return false;
    if (lista && lista !== '*' && listasDe(c).indexOf(lista) < 0) return false;
    vistos[em] = true;
    c.email = em;
    return true;
  });
}
