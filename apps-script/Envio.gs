// Envío por la API de Gmail (permite cabeceras de baja y responder en el mismo hilo),
// tarea automática de campañas y secuencias, y detección de respuestas y rebotes.

function b64(s) { return Utilities.base64Encode(s, Utilities.Charset.UTF_8); }
function cabeceraUtf8(s) { return /^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + b64(s) + '?='; }

function construirMime(o) {
  var limite = 'edv' + uid();
  var h = [
    'From: ' + cabeceraUtf8(o.nombre) + ' <' + o.desde + '>',
    'To: ' + o.para,
    'Subject: ' + cabeceraUtf8(o.asunto),
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="' + limite + '"',
  ];
  if (o.bajaUrl) {
    h.push('List-Unsubscribe: <mailto:' + o.desde + '?subject=Baja>' + (o.bajaPost ? ', <' + o.bajaPost + '>' : ''));
    if (o.bajaPost) h.push('List-Unsubscribe-Post: List-Unsubscribe=One-Click');
  }
  if (o.inReplyTo) { h.push('In-Reply-To: ' + o.inReplyTo); h.push('References: ' + o.inReplyTo); }
  var parte = function (tipo, txt) {
    return ['--' + limite, 'Content-Type: ' + tipo + '; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(txt).replace(/(.{76})/g, '$1\r\n')].join('\r\n');
  };
  return h.join('\r\n') + '\r\n\r\n' + parte('text/plain', o.texto) + '\r\n' + parte('text/html', o.html) + '\r\n--' + limite + '--';
}

/** Envía y devuelve { id, threadId, messageId }. */
function enviarGmail(o) {
  var aj = ajustes();
  var mime = construirMime({
    nombre: aj.nombre, desde: aj.remitente, para: o.para, asunto: o.asunto, html: o.html, texto: o.texto,
    bajaUrl: o.bajaUrl, bajaPost: o.bajaPost, inReplyTo: o.inReplyTo,
  });
  var recurso = { raw: Utilities.base64EncodeWebSafe(mime, Utilities.Charset.UTF_8) };
  if (o.threadId) recurso.threadId = o.threadId;
  var r = Gmail.Users.Messages.send(recurso, 'me');
  var meta = Gmail.Users.Messages.get('me', r.id, { format: 'metadata', metadataHeaders: ['Message-ID'] });
  var mid = ((meta.payload && meta.payload.headers) || []).filter(function (x) { return /^message-id$/i.test(x.name); })[0];
  return { id: r.id, threadId: r.threadId, messageId: mid ? mid.value : '' };
}

function enlacesDe(campanaId, paso) {
  return leer('Enlaces').filter(function (e) { return String(e.campana_id) === String(campanaId) && Number(e.paso) === Number(paso); })
    .sort(function (a, b) { return a.n - b.n; }).map(function (e) { return e.url; });
}

/** Envía una pieza a un contacto y lo apunta en Envios. */
function enviarA(campanaId, paso, pieza, contacto, hilo, cacheEnlaces) {
  var envioId = uid();
  var clave = campanaId + '#' + paso;
  if (!cacheEnlaces[clave]) {
    // Nunca se renumeran: los enlaces nuevos (p. ej. tras editar una secuencia) se añaden al final
    var guardados = enlacesDe(campanaId, paso);
    var nuevos = prepararEmail(pieza, contacto, envioId, null).urls.filter(function (u) { return guardados.indexOf(u) < 0; });
    anadirVarios('Enlaces', nuevos.map(function (u, i) { return { campana_id: campanaId, paso: paso, n: guardados.length + i, url: u }; }));
    cacheEnlaces[clave] = guardados.concat(nuevos);
  }
  var e = prepararEmail(pieza, contacto, envioId, cacheEnlaces[clave]);
  var asunto = hilo && hilo.asunto ? hilo.asunto : e.asunto;
  try {
    var r = enviarGmail({ para: contacto.email, asunto: asunto, html: e.html, texto: e.texto, bajaUrl: e.bajaUrl, bajaPost: e.bajaPost, threadId: hilo && hilo.threadId, inReplyTo: hilo && hilo.inReplyTo });
    anadir('Envios', { id: envioId, campana_id: campanaId, paso: paso, email: contacto.email, fecha: new Date(), message_id: r.messageId, thread_id: r.threadId, estado: 'enviado' });
    return r;
  } catch (err) {
    anadir('Envios', { id: envioId, campana_id: campanaId, paso: paso, email: contacto.email, fecha: new Date(), estado: 'error', error: String(err.message || err).slice(0, 300) });
    return null;
  }
}

function enviadosHoy() {
  var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return leer('Envios').filter(function (e) { return e.fecha instanceof Date && e.fecha >= hoy && e.estado === 'enviado'; }).length;
}

// ── Tarea automática (cada 10 min) ───────────────────────────────────
function procesar() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) return { enviados: 0, respuestas: 0, rebotes: 0 };
  try {
    var ctx = { fin: Date.now() + 4.5 * 60 * 1000, quedan: ajustes().limite - enviadosHoy(), enviados: 0, enlaces: {} };
    enviarCampanas(ctx);
    avanzarSecuencias(ctx);
    var r = revisarBandeja();
    guardarResumen(); // el panel abre al momento con datos de hace menos de 10 min
    return { enviados: ctx.enviados, respuestas: r.respuestas, rebotes: r.rebotes };
  } finally { lock.releaseLock(); }
}
function hayMargen(ctx) { return Date.now() < ctx.fin && ctx.quedan > 0; }

function enviarCampanas(ctx) {
  var ahora = new Date();
  leer('Campanas').forEach(function (c) {
    if (c.tipo !== 'campana' || !hayMargen(ctx)) return;
    if (!(c.estado === 'enviando' || (c.estado === 'programada' && c.programada instanceof Date && c.programada <= ahora))) return;
    if (c.estado !== 'enviando') actualizar('Campanas', c._fila, { estado: 'enviando' });
    var hechos = {};
    leer('Envios').forEach(function (e) { if (String(e.campana_id) === String(c.id)) hechos[String(e.email).toLowerCase()] = 1; });
    var destinatarios = contactosDeLista(c.lista);
    var pendientes = destinatarios.filter(function (d) { return !hechos[d.email]; });
    for (var i = 0; i < pendientes.length && hayMargen(ctx); i++) {
      if (enviarA(c.id, 1, c, pendientes[i], null, ctx.enlaces)) { ctx.enviados++; ctx.quedan--; }
      Utilities.sleep(250);
    }
    if (i >= pendientes.length) actualizar('Campanas', c._fila, { estado: 'enviada', enviada: new Date(), total: destinatarios.length });
  });
}

function siguienteLaborable(fecha) {
  var d = new Date(fecha);
  while (d.getDay() === 0 || d.getDay() === 6) d = new Date(d.getTime() + 864e5);
  return d;
}

function avanzarSecuencias(ctx) {
  var ahora = new Date();
  var activas = leer('Inscripciones').filter(function (i) { return i.estado === 'activa' && i.proximo instanceof Date && i.proximo <= ahora; });
  if (!activas.length) return;
  var campanas = {}; leer('Campanas').forEach(function (c) { campanas[c.id] = c; });
  var pasos = {}; leer('Pasos').forEach(function (p) { (pasos[p.secuencia_id] = pasos[p.secuencia_id] || []).push(p); });
  Object.keys(pasos).forEach(function (k) { pasos[k].sort(function (a, b) { return a.paso - b.paso; }); });
  var contactos = {}; leer('Contactos').forEach(function (c) { contactos[String(c.email).trim().toLowerCase()] = c; });

  activas.forEach(function (ins) {
    if (!hayMargen(ctx)) return;
    var sec = campanas[ins.secuencia_id], lista = pasos[ins.secuencia_id] || [];
    var c = contactos[String(ins.email).toLowerCase()];
    if (!sec || sec.estado === 'pausada') return;
    if (!c || !activo(c)) { actualizar('Inscripciones', ins._fila, { estado: c ? String(c.estado) : 'sin contacto' }); return; }
    c.email = String(c.email).trim().toLowerCase();
    var n = Number(ins.paso) || 1, p = lista[n - 1];
    if (!p) { actualizar('Inscripciones', ins._fila, { estado: 'terminada' }); return; }
    var pieza = { asunto: p.asunto || sec.asunto, cuerpo: p.cuerpo, formato: sec.formato || 'personal' };
    var hilo = null;
    if (n > 1 && ins.thread_id) {
      var primero = personalizar(lista[0].asunto || sec.asunto, c);
      hilo = { threadId: ins.thread_id, inReplyTo: ins.ultimo_msg, asunto: p.asunto ? '' : (/^re:/i.test(primero) ? primero : 'Re: ' + primero) };
    }
    var r = enviarA(sec.id, n, pieza, c, hilo, ctx.enlaces);
    if (!r) { actualizar('Inscripciones', ins._fila, { estado: 'error' }); return; }
    ctx.enviados++; ctx.quedan--;
    var sig = lista[n];
    actualizar('Inscripciones', ins._fila, sig
      ? { paso: n + 1, proximo: siguienteLaborable(new Date(Date.now() + (Number(sig.dias) || 3) * 864e5)), thread_id: r.threadId, ultimo_msg: r.messageId }
      : { paso: n, estado: 'terminada', thread_id: r.threadId, ultimo_msg: r.messageId });
    Utilities.sleep(250);
  });
}

/** Busca en Gmail respuestas y rebotes de los últimos días en los hilos que hemos enviado. */
function revisarBandeja() {
  var res = { respuestas: 0, rebotes: 0 };
  var hace = new Date(Date.now() - 30 * 864e5);
  var porHilo = {};
  leer('Envios').forEach(function (e) {
    if (e.thread_id && e.estado === 'enviado' && e.fecha instanceof Date && e.fecha >= hace) {
      var prev = porHilo[e.thread_id];
      if (!prev || e.fecha > prev.fecha) porHilo[e.thread_id] = e;
    }
  });
  if (!Object.keys(porHilo).length) return res;
  var ya = {};
  leer('Eventos').forEach(function (ev) { if (ev.tipo === 'respuesta' || ev.tipo === 'rebote') ya[ev.detalle] = 1; }); // detalle = id del mensaje de Gmail

  var lista = Gmail.Users.Messages.list('me', { q: '-from:me newer_than:4d', maxResults: 500 }).messages || [];
  lista.forEach(function (m) {
    var envio = porHilo[m.threadId];
    if (!envio || ya[m.id]) return;
    var meta = Gmail.Users.Messages.get('me', m.id, { format: 'metadata', metadataHeaders: ['From', 'Auto-Submitted'] });
    var hs = (meta.payload && meta.payload.headers) || [];
    var de = (hs.filter(function (x) { return x.name.toLowerCase() === 'from'; })[0] || {}).value || '';
    var auto = (hs.filter(function (x) { return x.name.toLowerCase() === 'auto-submitted'; })[0] || {}).value || '';
    var rebote = /mailer-daemon|postmaster/i.test(de);
    if (!rebote && /auto-replied/i.test(auto)) return; // respuestas automáticas (vacaciones): no cuentan
    anadir('Eventos', { fecha: new Date(), envio_id: envio.id, tipo: rebote ? 'rebote' : 'respuesta', detalle: m.id });
    ya[m.id] = 1;
    leer('Inscripciones').forEach(function (i) {
      if (i.thread_id === m.threadId && i.estado === 'activa') actualizar('Inscripciones', i._fila, { estado: rebote ? 'rebote' : 'respondida' });
    });
    if (rebote) {
      var c = buscarFila('Contactos', envio.email);
      if (c) actualizar('Contactos', c._fila, { estado: 'rebotado', notas: 'Rebote ' + Utilities.formatDate(new Date(), 'Europe/Madrid', 'dd/MM/yyyy') });
      res.rebotes++;
    } else res.respuestas++;
  });
  return res;
}
