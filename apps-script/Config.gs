// Menú, configuración inicial y tarea automática.

// URLs de esta instalación (se pueden cambiar en Ajustes de la app)
var EXEC_URL_DEFECTO = 'https://script.google.com/macros/s/AKfycbwR6xBNsO8v5S2e1fju9l2HmesSVjeggBUWGgnas45P6vpZWp30hcA19CsdgDHaHKlQvg/exec';
var PAGES_URL_DEFECTO = 'https://landings.edvolution.io/email';

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Edvolution Email')
    .addItem('Abrir la app', 'abrirApp')
    .addSeparator()
    .addItem('Procesar envíos ahora', 'procesarDesdeMenu')
    .addItem('Configuración inicial', 'configurar')
    .addItem('Crear clave de acceso web', 'crearClaveWeb')
    .addToUi();
}

function abrirApp() {
  var html = HtmlService.createHtmlOutputFromFile('Ui').setWidth(1200).setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'Edvolution Email');
}

function procesarDesdeMenu() {
  var r = procesar();
  SpreadsheetApp.getUi().alert('Hecho: ' + r.enviados + ' emails enviados, ' + r.respuestas + ' respuestas y ' + r.rebotes + ' rebotes nuevos.');
}

/** Crea las pestañas, guarda el id de la hoja e instala la tarea cada 10 minutos. Se puede repetir sin riesgo. */
function configurar() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  setProps({ SHEET_ID: ss.getId() });
  Object.keys(HOJAS).forEach(function (n) {
    var sh = ss.getSheetByName(n) || ss.insertSheet(n);
    var cab = HOJAS[n];
    var actual = sh.getRange(1, 1, 1, cab.length).getValues()[0];
    if (actual.join('') === '') {
      sh.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold').setBackground('#001260').setFontColor('#ffffff');
      sh.setFrozenRows(1);
    }
  });
  var c = ss.getSheetByName('Contactos');
  if (c.getLastRow() === 1) {
    var yo = Session.getEffectiveUser().getEmail();
    c.appendRow([yo, 'Prueba', 'Edvolution', '', 'pruebas', 'activo', 'interno', new Date(), 'Contacto de prueba: puedes borrarlo']);
    c.getRange('A2').setNote('Columnas: email, nombre, organización, cargo, listas (separadas por comas), estado (activo / baja / rebotado), consentimiento (cómo y cuándo lo dio).');
  }
  var hoja1 = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (hoja1 && hoja1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(hoja1);

  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'procesar') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('procesar').timeBased().everyMinutes(10).create();

  var faltan = [];
  if (!ajustes().exec) faltan.push('la URL de la aplicación web (para medir aperturas, clics y bajas)');
  if (!ajustes().pages) faltan.push('la URL de GitHub Pages');
  SpreadsheetApp.getUi().alert('Listo: pestañas creadas y envíos automáticos cada 10 minutos.' +
    (faltan.length ? '\n\nFalta en Ajustes de la app: ' + faltan.join(' y ') + '. Mientras tanto se envía sin seguimiento y la baja es por email.' : ''));
}

function ajustes() {
  return {
    remitente: Session.getEffectiveUser().getEmail(),
    nombre: prop('NOMBRE', 'Edvolution'),
    firma: prop('FIRMA', ''),
    pie: prop('PIE', 'Transformación Digital Europea S.L.'),
    web: prop('WEB', 'https://edvolution.io'),
    logo: prop('LOGO_URL', ''),
    exec: prop('EXEC_URL', EXEC_URL_DEFECTO),
    pages: prop('PAGES_URL', PAGES_URL_DEFECTO).replace(/\/+$/, ''),
    limite: Number(prop('LIMITE_DIARIO', '400')),
  };
}

function guardarAjustes(a) {
  var limpiar = function (s) { return String(s || '').trim(); };
  setProps({
    NOMBRE: limpiar(a.nombre) || 'Edvolution',
    FIRMA: String(a.firma || ''),
    PIE: limpiar(a.pie),
    WEB: limpiar(a.web) || 'https://edvolution.io',
    LOGO_URL: limpiar(a.logo),
    EXEC_URL: limpiar(a.exec),
    PAGES_URL: limpiar(a.pages).replace(/\/+$/, ''),
    LIMITE_DIARIO: String(Math.max(1, Math.min(1500, Number(a.limite) || 400))),
  });
  return ajustes();
}
