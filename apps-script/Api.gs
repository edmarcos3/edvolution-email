// Funciones que llama la interfaz (Ui.html) con google.script.run.

function metricasPorCampana() {
  var envios = {}, m = {};
  leer('Envios').forEach(function (e) {
    envios[e.id] = e;
    var x = m[e.campana_id] = m[e.campana_id] || { enviados: 0, errores: 0, aperturas: {}, clics: {}, respuestas: {}, rebotes: {}, bajas: {} };
    e.estado === 'enviado' ? x.enviados++ : x.errores++;
  });
  leer('Eventos').forEach(function (ev) {
    var e = envios[ev.envio_id]; if (!e) return;
    var x = m[e.campana_id], k = { apertura: 'aperturas', clic: 'clics', respuesta: 'respuestas', rebote: 'rebotes', baja: 'bajas' }[ev.tipo];
    if (x && k) x[k][e.email] = 1; // personas únicas
  });
  Object.keys(m).forEach(function (id) {
    ['aperturas', 'clics', 'respuestas', 'rebotes', 'bajas'].forEach(function (k) { m[id][k] = Object.keys(m[id][k]).length; });
  });
  return m;
}

function datosApp() {
  var contactos = leer('Contactos');
  var listas = {};
  contactos.forEach(function (c) { if (activo(c)) listasDe(c).forEach(function (l) { listas[l] = (listas[l] || 0) + 1; }); });
  var met = metricasPorCampana();
  var ins = {};
  leer('Inscripciones').forEach(function (i) { var x = ins[i.secuencia_id] = ins[i.secuencia_id] || {}; x[i.estado] = (x[i.estado] || 0) + 1; });
  var aj = ajustes();
  return {
    ajustes: aj,
    listas: Object.keys(listas).sort().map(function (l) { return { nombre: l, n: listas[l] }; }),
    contactos: {
      activos: contactos.filter(activo).length,
      bajas: contactos.filter(function (c) { return String(c.estado).toLowerCase() === 'baja'; }).length,
      rebotados: contactos.filter(function (c) { return String(c.estado).toLowerCase() === 'rebotado'; }).length,
    },
    hoy: enviadosHoy(),
    seguimiento: !!(aj.exec && aj.pages),
    campanas: leer('Campanas').map(function (c) {
      var o = limpio(c); delete o.cuerpo; delete o._fila;
      o.met = met[c.id] || null; o.inscripciones = ins[c.id] || null;
      return o;
    }).reverse(),
    hojaUrl: libro().getUrl(),
  };
}

function obtenerCampana(id) {
  var c = leer('Campanas').filter(function (x) { return String(x.id) === String(id); })[0];
  if (!c) throw new Error('No encontrada');
  var o = limpio(c); delete o._fila;
  o.pasos = leer('Pasos').filter(function (p) { return String(p.secuencia_id) === String(id); })
    .sort(function (a, b) { return a.paso - b.paso; }).map(function (p) { return { dias: p.dias, asunto: p.asunto, cuerpo: p.cuerpo }; });
  return o;
}

function guardarCampana(o) {
  if (!String(o.nombre || '').trim()) throw new Error('Ponle un nombre interno');
  var esSec = o.tipo === 'secuencia';
  var pasos = esSec ? (o.pasos || []) : [];
  if (esSec && !pasos.length) throw new Error('La secuencia necesita al menos un email');
  if (esSec && !String(pasos[0].asunto || '').trim()) throw new Error('El primer email necesita asunto');
  if (!esSec && !String(o.asunto || '').trim()) throw new Error('Falta el asunto');
  var datos = {
    tipo: esSec ? 'secuencia' : 'campana', nombre: o.nombre, lista: o.lista || '', formato: o.formato || 'personal',
    asunto: esSec ? pasos[0].asunto : o.asunto, cuerpo: esSec ? pasos[0].cuerpo : o.cuerpo,
  };
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var id = o.id;
    if (id) {
      var actual = buscarFila('Campanas', id);
      if (!actual) throw new Error('No encontrada');
      if (!esSec && actual.estado !== 'borrador') throw new Error('Solo se pueden editar campañas en borrador');
      actualizar('Campanas', actual._fila, datos);
    } else {
      id = uid();
      datos.id = id; datos.estado = 'borrador'; datos.creada = new Date();
      anadir('Campanas', datos);
    }
    if (esSec) {
      var sh = hoja('Pasos');
      leer('Pasos').filter(function (p) { return String(p.secuencia_id) === String(id); }).map(function (p) { return p._fila; })
        .sort(function (a, b) { return b - a; }).forEach(function (f) { sh.deleteRow(f); });
      anadirVarios('Pasos', pasos.map(function (p, i) { return { secuencia_id: id, paso: i + 1, dias: i === 0 ? 0 : Number(p.dias) || 3, asunto: p.asunto || '', cuerpo: p.cuerpo || '' }; }));
    }
    return id;
  } finally { lock.releaseLock(); }
}

function contactoEjemplo(lista) {
  return contactosDeLista(lista)[0] || { nombre: 'Lucía Martín', organizacion: 'Colegio Ejemplo', cargo: 'Directora', email: 'lucia@ejemplo.com' };
}

function vistaPrevia(pieza, lista) {
  var c = contactoEjemplo(lista);
  var e = prepararEmail(pieza, c, 'prueba', null);
  var html = pieza.formato === 'newsletter' ? e.html : '<!doctype html><html><body style="margin:0;padding:20px;background:#fff">' + e.html + '</body></html>';
  return { asunto: e.asunto, html: html, para: c.email };
}

function enviarPrueba(pieza, lista, emails) {
  var lista_ = String(emails || '').split(/[,;\s]+/).filter(function (x) { return /@/.test(x); }).slice(0, 5);
  if (!lista_.length) throw new Error('Escribe al menos un email de prueba');
  var c = contactoEjemplo(lista);
  var e = prepararEmail(pieza, c, 'prueba', null);
  lista_.forEach(function (para) { enviarGmail({ para: para, asunto: '[PRUEBA] ' + e.asunto, html: e.html, texto: e.texto }); });
  return lista_.length;
}

function parseFecha(cuando) {
  if (!cuando || cuando === 'ahora') return new Date();
  var d = Utilities.parseDate(cuando, 'Europe/Madrid', "yyyy-MM-dd'T'HH:mm");
  if (d < new Date(Date.now() - 60000)) throw new Error('La fecha ya ha pasado');
  return d;
}

/** Campaña: la deja programada. Secuencia: la activa e inscribe a los contactos activos de su lista. */
function programar(id, cuando) {
  var c = buscarFila('Campanas', id);
  if (!c) throw new Error('No encontrada');
  var fecha = parseFecha(cuando);
  var destinatarios = contactosDeLista(c.lista);
  if (c.tipo === 'campana') {
    if (c.estado !== 'borrador') throw new Error('Ya está programada o enviada');
    if (!destinatarios.length) throw new Error('La lista no tiene contactos activos');
    actualizar('Campanas', c._fila, { estado: 'programada', programada: fecha, total: destinatarios.length });
    return { n: destinatarios.length, fecha: fecha.toISOString() };
  }
  var n = inscribirEmails(id, destinatarios.map(function (d) { return d.email; }), fecha).nuevos;
  actualizar('Campanas', c._fila, { estado: 'activa', programada: fecha });
  return { n: n, fecha: fecha.toISOString() };
}

function inscribirEmails(id, emails, fecha) {
  var yaDentro = {};
  leer('Inscripciones').forEach(function (i) { if (String(i.secuencia_id) === String(id)) yaDentro[String(i.email).toLowerCase()] = 1; });
  var contactos = {}; leer('Contactos').forEach(function (c) { contactos[String(c.email).trim().toLowerCase()] = c; });
  var nuevos = [], faltan = [], inactivos = [];
  emails.map(function (e) { return String(e).trim().toLowerCase(); }).filter(String).forEach(function (em) {
    if (yaDentro[em]) return;
    var c = contactos[em];
    if (!c) { faltan.push(em); return; }
    if (!activo(c)) { inactivos.push(em); return; }
    yaDentro[em] = 1;
    nuevos.push({ id: uid(), secuencia_id: id, email: em, paso: 1, proximo: fecha || new Date(), estado: 'activa', alta: new Date() });
  });
  anadirVarios('Inscripciones', nuevos);
  return { nuevos: nuevos.length, faltan: faltan, inactivos: inactivos };
}

/** Añade contactos sueltos a una secuencia ya activa (p. ej. asistentes a un webinar). */
function inscribir(id, texto) {
  var c = buscarFila('Campanas', id);
  if (!c || c.tipo !== 'secuencia') throw new Error('No es una secuencia');
  var r = inscribirEmails(id, String(texto || '').split(/[,;\s]+/), new Date());
  if (c.estado === 'borrador') actualizar('Campanas', c._fila, { estado: 'activa', programada: new Date() });
  return r;
}

function cambiarEstado(id, estado) {
  var c = buscarFila('Campanas', id);
  if (!c) throw new Error('No encontrada');
  var permitido = { pausada: ['activa'], activa: ['pausada'], borrador: ['programada'] }[estado] || [];
  if (permitido.indexOf(c.estado) < 0) throw new Error('No se puede pasar de ' + c.estado + ' a ' + estado);
  actualizar('Campanas', c._fila, estado === 'borrador' ? { estado: 'borrador', programada: '' } : { estado: estado });
  return true;
}

function eliminarCampana(id) {
  var c = buscarFila('Campanas', id);
  if (!c) return true;
  if (['borrador'].indexOf(c.estado) < 0) throw new Error('Solo se pueden eliminar borradores');
  var borrar = function (nombre, campo) {
    var sh = hoja(nombre);
    leer(nombre).filter(function (x) { return String(x[campo]) === String(id); }).map(function (x) { return x._fila; })
      .sort(function (a, b) { return b - a; }).forEach(function (f) { sh.deleteRow(f); });
  };
  borrar('Pasos', 'secuencia_id'); borrar('Enlaces', 'campana_id'); borrar('Inscripciones', 'secuencia_id');
  hoja('Campanas').deleteRow(c._fila);
  return true;
}

function detalleCampana(id) {
  var envios = leer('Envios').filter(function (e) { return String(e.campana_id) === String(id); });
  var ids = {}; envios.forEach(function (e) { ids[e.id] = { email: e.email, paso: e.paso, fecha: aIso(e.fecha), estado: e.estado, error: e.error, aperturas: 0, clics: 0, respuesta: false, rebote: false, baja: false }; });
  var enlaces = {};
  leer('Eventos').forEach(function (ev) {
    var x = ids[ev.envio_id]; if (!x) return;
    if (ev.tipo === 'apertura') x.aperturas++;
    if (ev.tipo === 'clic') { x.clics++; enlaces[ev.detalle] = enlaces[ev.detalle] || { url: ev.detalle, clics: 0, personas: {} }; enlaces[ev.detalle].clics++; enlaces[ev.detalle].personas[x.email] = 1; }
    if (ev.tipo === 'respuesta') x.respuesta = true;
    if (ev.tipo === 'rebote') x.rebote = true;
    if (ev.tipo === 'baja') x.baja = true;
  });
  return {
    campana: obtenerCampana(id),
    envios: Object.keys(ids).map(function (k) { return ids[k]; }).sort(function (a, b) { return String(b.fecha).localeCompare(String(a.fecha)); }),
    enlaces: Object.keys(enlaces).map(function (k) { return { url: k, clics: enlaces[k].clics, personas: Object.keys(enlaces[k].personas).length }; }).sort(function (a, b) { return b.clics - a.clics; }),
    inscripciones: leer('Inscripciones').filter(function (i) { return String(i.secuencia_id) === String(id); })
      .map(function (i) { return { email: i.email, paso: i.paso, proximo: aIso(i.proximo), estado: i.estado }; }),
  };
}
