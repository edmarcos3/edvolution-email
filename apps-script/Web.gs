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
  if (p.a === 'b') darDeBaja(p.e, 'baja en un clic (Gmail)');
  return ContentService.createTextOutput('ok');
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
