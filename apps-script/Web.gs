// Aplicación web pública: registra aperturas, clics y bajas.
// Se publica como "Aplicación web" (ejecutar como yo, acceso: cualquier usuario).
//   ?a=o&e=ENVIO            píxel de apertura
//   ?a=c&e=ENVIO&l=N        clic (devuelve la URL de destino; la usa r.html de GitHub Pages)
//   ?a=b&e=ENVIO            baja (desde baja.html)   ·   POST ?a=b&e=ENVIO  baja en un clic (Gmail)

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.a === 'o') { if (envioValido(p.e)) anadir('Eventos', { fecha: new Date(), envio_id: p.e, tipo: 'apertura' }); return ContentService.createTextOutput(''); }
    if (p.a === 'c') return responder({ url: registrarClic(p.e, p.l) }, p.callback);
    if (p.a === 'b') return responder({ ok: darDeBaja(p.e, 'página de baja') }, p.callback);
  } catch (err) { return responder({ error: String(err.message || err) }, p.callback); }
  return ContentService.createTextOutput('Edvolution');
}

function doPost(e) {
  var p = (e && e.parameter) || {};
  if (p.a === 'b') { darDeBaja(p.e, 'baja en un clic (Gmail)'); return ContentService.createTextOutput('ok'); }
  return apiWeb(e);
}

// ── API del panel web (landings.edvolution.io/email) ─────────────────
// POST con cuerpo text/plain: {"clave": "...", "fn": "datosApp", "args": [...]}
// La clave se crea en la hoja: Edvolution Email → Crear clave de acceso web. Solo se guarda su huella (SHA-256).

var API_PERMITIDAS = ['datosApp', 'obtenerCampana', 'guardarCampana', 'vistaPrevia', 'enviarPrueba', 'programar', 'inscribir',
  'cambiarEstado', 'eliminarCampana', 'detalleCampana', 'guardarAjustes', 'listarContactos', 'guardarContacto', 'importarContactos', 'procesar'];

function huella(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
function claveValida(clave) {
  var h = prop('WEB_CLAVE_HASH');
  if (!h || !clave || String(clave).length < 20) return false;
  var x = huella(clave), dif = 0;
  for (var i = 0; i < h.length; i++) dif |= h.charCodeAt(i) ^ x.charCodeAt(i);
  return dif === 0 && x.length === h.length;
}
function apiWeb(e) {
  var salida = function (o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); };
  var q;
  try { q = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return salida({ error: 'Petición no válida' }); }
  if (!claveValida(q.clave)) { Utilities.sleep(800); return salida({ error: 'CLAVE', mensaje: 'Clave de acceso incorrecta' }); }
  if (API_PERMITIDAS.indexOf(q.fn) < 0) return salida({ error: 'Función no permitida' });
  try {
    var r = globalThis[q.fn].apply(null, q.args || []);
    return salida({ r: r === undefined ? null : JSON.parse(JSON.stringify(r)) });
  } catch (err) { return salida({ error: String(err.message || err) }); }
}

/** Menú de la hoja: crea una clave nueva (invalida la anterior) y la muestra una sola vez. */
function crearClaveWeb() {
  var clave = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  setProps({ WEB_CLAVE_HASH: huella(clave) });
  SpreadsheetApp.getUi().alert('Clave de acceso para el panel web',
    'Cópiala ahora: no se volverá a mostrar.\n\n' + clave + '\n\nPégala en ' + ajustes().pages + '/ la primera vez que entres en cada navegador. Si la pierdes, crea otra (la anterior dejará de funcionar).',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

/** JSONP para que las páginas de GitHub lo lean sin problemas de CORS. */
function responder(obj, callback) {
  var cb = String(callback || '');
  if (/^[A-Za-z_$][\w$]{0,40}$/.test(cb)) return ContentService.createTextOutput(cb + '(' + JSON.stringify(obj) + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function envioValido(id) { return /^[a-f0-9]{16}$/.test(String(id || '')) ? buscarFila('Envios', id) : null; }

function registrarClic(envioId, n) {
  var envio = envioValido(envioId);
  if (!envio) return '';
  var url = enlacesDe(envio.campana_id, envio.paso)[Number(n)] || '';
  if (url) anadir('Eventos', { fecha: new Date(), envio_id: envioId, tipo: 'clic', detalle: url });
  return url;
}

function darDeBaja(envioId, via) {
  var envio = envioValido(envioId);
  if (!envio) return false;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var c = buscarFila('Contactos', envio.email);
    if (c && String(c.estado).toLowerCase() !== 'baja') {
      actualizar('Contactos', c._fila, { estado: 'baja', notas: 'Baja ' + Utilities.formatDate(new Date(), 'Europe/Madrid', 'dd/MM/yyyy HH:mm') + ' (' + via + ')' });
      anadir('Eventos', { fecha: new Date(), envio_id: envioId, tipo: 'baja', detalle: via });
    }
    leer('Inscripciones').forEach(function (i) {
      if (String(i.email).toLowerCase() === String(envio.email).toLowerCase() && i.estado === 'activa') actualizar('Inscripciones', i._fila, { estado: 'baja' });
    });
    return true;
  } finally { lock.releaseLock(); }
}
