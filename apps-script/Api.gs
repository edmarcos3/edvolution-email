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
    ejemplos: ejemplosPorLista(contactos),
  };
}

/** Un contacto activo por lista (y '' = cualquiera) para la vista previa en el navegador. */
function ejemplosPorLista(contactos) {
  var r = {};
  contactos.filter(activo).forEach(function (c) {
    var e = { nombre: c.nombre, organizacion: c.organizacion, cargo: c.cargo, email: String(c.email).trim().toLowerCase() };
    if (!r['']) r[''] = e;
    listasDe(c).forEach(function (l) { if (!r[l]) r[l] = e; });
  });
  return r;
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
      olvidar('Pasos');
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
  var html = pieza.formato === 'newsletter' || esHtml(pieza.cuerpo) ? e.html : '<!doctype html><html><body style="margin:0;padding:20px;background:#fff">' + e.html + '</body></html>';
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
    olvidar(nombre);
  };
  borrar('Pasos', 'secuencia_id'); borrar('Enlaces', 'campana_id'); borrar('Inscripciones', 'secuencia_id');
  hoja('Campanas').deleteRow(c._fila);
  olvidar('Campanas');
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

// ── Contactos ────────────────────────────────────────────────────────
var CAMPOS_CONTACTO = ['nombre', 'organizacion', 'cargo', 'listas', 'estado', 'consentimiento', 'notas'];
var RE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function listarContactos(f) {
  f = f || {};
  var q = String(f.q || '').toLowerCase().trim();
  var todos = leer('Contactos').filter(function (c) {
    if (f.lista && listasDe(c).indexOf(f.lista) < 0) return false;
    var est = String(c.estado || 'activo').toLowerCase();
    if (f.estado && est !== f.estado) return false;
    if (q && [c.email, c.nombre, c.organizacion, c.cargo].join(' ').toLowerCase().indexOf(q) < 0) return false;
    return true;
  }).reverse();
  var por = 50, pag = Math.max(1, Number(f.pagina) || 1);
  return { total: todos.length, pagina: pag, paginas: Math.max(1, Math.ceil(todos.length / por)),
    filas: todos.slice((pag - 1) * por, pag * por).map(function (c) { var o = limpio(c); delete o._fila; return o; }) };
}

/** Crea o actualiza un contacto por email. */
function guardarContacto(c) {
  var email = String(c.email || '').trim().toLowerCase();
  if (!RE_EMAIL.test(email)) throw new Error('Email no válido');
  var lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var actual = buscarFila('Contactos', email);
    var datos = {};
    CAMPOS_CONTACTO.forEach(function (k) { if (c[k] !== undefined) datos[k] = String(c[k]).trim(); });
    if (datos.estado && ['activo', 'baja', 'rebotado'].indexOf(datos.estado) < 0) throw new Error('Estado no válido');
    if (actual) { actualizar('Contactos', actual._fila, datos); return 'actualizado'; }
    if (!datos.consentimiento) throw new Error('Indica cómo dio su consentimiento');
    datos.email = email; datos.estado = datos.estado || 'activo'; datos.alta = new Date();
    anadir('Contactos', datos);
    return 'creado';
  } finally { lock.releaseLock(); }
}

/** Importa filas pegadas o CSV (email, nombre, organización, cargo). Añade las listas indicadas; no reactiva bajas. */
function importarContactos(texto, listas, consentimiento) {
  if (!String(consentimiento || '').trim()) throw new Error('Indica cómo dieron su consentimiento');
  var lineas = String(texto || '').replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim(); });
  if (!lineas.length) return { nuevos: 0, actualizados: 0, invalidos: 0 };
  var sep = /\t/.test(lineas[0]) ? '\t' : ((lineas[0].match(/;/g) || []).length > (lineas[0].match(/,/g) || []).length ? ';' : ',');
  var partir = function (l) {
    var cols = [], cur = '', dentro = false;
    for (var i = 0; i < l.length; i++) {
      var ch = l[i];
      if (ch === '"') { if (dentro && l[i + 1] === '"') { cur += '"'; i++; } else dentro = !dentro; }
      else if (ch === sep && !dentro) { cols.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cols.push(cur.trim());
    return cols;
  };
  var cab = partir(lineas[0]).map(function (x) { return x.toLowerCase(); });
  var idx = {
    email: cab.findIndex(function (x) { return /e-?mail|correo/.test(x); }),
    nombre: cab.findIndex(function (x) { return /^nombre|^name/.test(x); }),
    organizacion: cab.findIndex(function (x) { return /organiza|centro|empresa|instituci|colegio/.test(x); }),
    cargo: cab.findIndex(function (x) { return /cargo|puesto|rol/.test(x); }),
  };
  var filas = lineas.slice(1);
  if (idx.email < 0) { filas = lineas; idx = { email: partir(lineas[0]).findIndex(function (x) { return /@/.test(x); }), nombre: -1, organizacion: -1, cargo: -1 }; }
  var nuevasListas = String(listas || '').split(',').map(function (s) { return s.trim(); }).filter(String);
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var existentes = {}; leer('Contactos').forEach(function (c) { existentes[String(c.email).trim().toLowerCase()] = c; });
    var res = { nuevos: 0, actualizados: 0, invalidos: 0 }, altas = [], vistos = {};
    filas.forEach(function (l) {
      var c = partir(l), email = String(c[idx.email] || '').toLowerCase();
      if (!RE_EMAIL.test(email) || vistos[email]) { if (!vistos[email]) res.invalidos++; return; }
      vistos[email] = 1;
      var val = function (k) { return idx[k] >= 0 ? c[idx[k]] || '' : ''; };
      var ex = existentes[email];
      if (ex) {
        var ls = listasDe(ex); nuevasListas.forEach(function (x) { if (ls.indexOf(x) < 0) ls.push(x); });
        var cambios = { listas: ls.join(', ') };
        ['nombre', 'organizacion', 'cargo'].forEach(function (k) { if (!ex[k] && val(k)) cambios[k] = val(k); });
        actualizar('Contactos', ex._fila, cambios); res.actualizados++;
      } else {
        altas.push({ email: email, nombre: val('nombre'), organizacion: val('organizacion'), cargo: val('cargo'), listas: nuevasListas.join(', '), estado: 'activo', consentimiento: consentimiento, alta: new Date() });
        res.nuevos++;
      }
    });
    anadirVarios('Contactos', altas);
    return res;
  } finally { lock.releaseLock(); }
}
