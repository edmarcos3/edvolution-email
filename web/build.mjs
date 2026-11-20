// Genera el panel web estático (carpeta web/dist/email) y el zip para subir al servidor.
// Uso: node web/build.mjs   (desde la carpeta gmail/)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BASE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(BASE, 'web', 'dist');
const config = fs.readFileSync(path.join(BASE, 'docs', 'config.js'), 'utf8');
const exec = config.match(/EDV_EXEC_URL = '([^']+)'/)?.[1];
if (!exec || !exec.endsWith('/exec')) throw new Error('docs/config.js no tiene la URL /exec');

// Puente: google.script.run → API de Apps Script con la clave guardada en este navegador
const puente = `<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23001260'/%3E%3Ctext x='16' y='22' font-family='monospace' font-size='18' font-weight='700' fill='white' text-anchor='middle'%3Ee%3C/text%3E%3C/svg%3E">
<script src="config.js"></script>
<script>
(function () {
  var K = 'edv_email_clave';
  var leerClave = function () { try { return localStorage.getItem(K) || ''; } catch (e) { return ''; } };
  var guardarClave = function (v) { try { v ? localStorage.setItem(K, v) : localStorage.removeItem(K); } catch (e) {} };
  // Caché en el navegador: las lecturas se pintan al momento con lo último guardado y se refrescan por detrás
  var LECTURA = ['datosApp', 'obtenerCampana', 'detalleCampana', 'listarContactos'], PC = 'edv_c:', enCurso = {};
  var cLeer = function (k) { try { return localStorage.getItem(PC + k); } catch (e) { return null; } };
  var cGuardar = function (k, v) { try { localStorage.setItem(PC + k, v); } catch (e) {} };
  var cVaciar = function () { try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf(PC) === 0) localStorage.removeItem(k); }); } catch (e) {} };
  function refrescar(fn, args) {
    var k = fn + JSON.stringify(args);
    if (enCurso[k]) return enCurso[k];
    return enCurso[k] = red(fn, args).then(function (r) {
      delete enCurso[k];
      var nuevo = JSON.stringify(r), antes = cLeer(k);
      cGuardar(k, nuevo);
      if (antes !== null && antes !== nuevo) window.dispatchEvent(new CustomEvent('edv-fresco', { detail: { fn: fn, args: args, r: r } }));
      return r;
    }, function (e) { delete enCurso[k]; throw e; });
  }
  function llamar(fn, args) {
    if (LECTURA.indexOf(fn) >= 0) {
      var guardado = cLeer(fn + JSON.stringify(args)), p = refrescar(fn, args);
      if (guardado !== null) { p.catch(function () {}); return Promise.resolve(JSON.parse(guardado)); }
      return p;
    }
    cVaciar();
    return red(fn, args).then(function (r) { refrescar('datosApp', []).catch(function () {}); return r; });
  }
  function red(fn, args) {
    return fetch(window.EDV_EXEC_URL, { method: 'POST', body: JSON.stringify({ clave: leerClave(), fn: fn, args: args }) })
      .then(function (r) { return r.json(); })
      .catch(function () { throw new Error('No hay conexión con Google. Revisa tu conexión e inténtalo de nuevo.'); })
      .then(function (d) {
        if (d.error === 'CLAVE') { pedirClave(leerClave() ? 'La clave no es válida. Pega la clave actual.' : ''); throw new Error('Necesitas la clave de acceso'); }
        if (d.error) throw new Error(d.error);
        return d.r;
      });
  }
  window.google = { script: { get run() {
    var ok = function () {}, ko = function () {};
    var p = new Proxy({}, { get: function (t, k) {
      if (k === 'withSuccessHandler') return function (f) { ok = f; return p; };
      if (k === 'withFailureHandler') return function (f) { ko = f; return p; };
      return function () { llamar(k, Array.prototype.slice.call(arguments)).then(ok, function (e) { ko({ message: e.message }); }); };
    } });
    return p;
  } } };
  function pedirClave(msg) {
    if (document.getElementById('acceso')) return;
    var d = document.createElement('div');
    d.id = 'acceso';
    d.innerHTML = '<form><b>edvolution <span>email</span></b><p>Pega la clave de acceso. Se crea en la hoja de Google de hola@: <i>Edvolution Email → Crear clave de acceso web</i>.</p>' +
      (msg ? '<p class="err">' + msg + '</p>' : '') +
      '<input type="password" autocomplete="current-password" placeholder="Clave de acceso" required><button>Entrar</button>' +
      '<p class="nota">Se guarda solo en este navegador. No la uses en ordenadores compartidos.</p></form>';
    document.body.appendChild(d);
    var f = d.querySelector('form');
    f.onsubmit = function (ev) {
      ev.preventDefault();
      guardarClave(f.querySelector('input').value.trim());
      location.reload();
    };
    f.querySelector('input').focus();
  }
  window.edvSalir = function () { cVaciar(); guardarClave(''); location.reload(); };
  document.addEventListener('DOMContentLoaded', function () {
    var h = document.querySelector('header');
    if (h) { var b = document.createElement('button'); b.textContent = 'Salir'; b.onclick = window.edvSalir; h.appendChild(b); }
    if (!leerClave()) return pedirClave('');
    // Precarga los contactos para que la pestaña abra al momento
    setTimeout(function () { refrescar('listarContactos', [{ q: '', lista: '', estado: '', pagina: 1 }]).catch(function () {}); }, 1500);
  });
})();
</script>
<style>
#acceso { position:fixed; inset:0; background:#001260; display:flex; align-items:center; justify-content:center; z-index:50; padding:16px; }
#acceso form { background:#fff; border-radius:14px; padding:26px; max-width:400px; width:100%; }
#acceso b { font:700 18px 'IBM Plex Mono', monospace; color:#001260; } #acceso b span { color:#325cf6; }
#acceso p { font-size:13.5px; color:#5b6478; } #acceso .err { color:#c0392b; } #acceso .nota { font-size:12px; margin:10px 0 0; }
#acceso input { margin:6px 0 10px; } #acceso button { background:#325cf6; color:#fff; border:0; border-radius:8px; padding:9px 18px; font:inherit; cursor:pointer; }
@media (max-width: 760px) { .editor, .tres { grid-template-columns: 1fr !important; } header { flex-wrap: wrap; } .vista { position: static !important; } }
</style>`;

// Vista previa en el navegador con el mismo código de plantilla que usa Google (sin esperar al servidor)
const plantilla = fs.readFileSync(path.join(BASE, 'apps-script', 'Plantilla.gs'), 'utf8');
const vistaLocal = `<script>
(function () {
${plantilla}
  window.vistaLocal = function (pieza, aj, c) {
    c = c || { nombre: 'Lucía Martín', organizacion: 'Colegio Ejemplo', cargo: 'Directora', email: 'lucia@ejemplo.com' };
    var md = personalizar(pieza.cuerpo, c), asunto = personalizar(pieza.asunto, c);
    var html = construirHtml(md, asunto, aj, pieza.formato).replace(/%%BAJA%%/g, '#').replace('%%PIXEL%%', '');
    if (pieza.formato !== 'newsletter' && !esHtml(md)) html = '<!doctype html><html><body style="margin:0;padding:20px;background:#fff">' + html + '</body></html>';
    return { asunto: asunto, html: html, para: c.email };
  };
})();
</script>`;
let html = fs.readFileSync(path.join(BASE, 'apps-script', 'Ui.html'), 'utf8')
  .replace('<base target="_top">', '')
  .replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Edvolution Email</title>\n' + puente + vistaLocal);
if (!html.includes('EDV_EXEC_URL')) throw new Error('No se pudo inyectar el puente');

fs.rmSync(DIST, { recursive: true, force: true });
// Dos landings: "email" (Privado, el panel) y "enlaces" (Público, lo que abren los destinatarios)
const PANEL = path.join(DIST, 'email'), PUBLICO = path.join(DIST, 'enlaces');
fs.mkdirSync(PANEL, { recursive: true }); fs.mkdirSync(PUBLICO, { recursive: true });
fs.writeFileSync(path.join(PANEL, 'index.html'), html);
fs.copyFileSync(path.join(BASE, 'docs', 'config.js'), path.join(PANEL, 'config.js'));
for (const f of ['r.html', 'baja.html', 'estilo.css', 'config.js']) fs.copyFileSync(path.join(BASE, 'docs', f), path.join(PUBLICO, f));
fs.writeFileSync(path.join(PUBLICO, 'index.html'), fs.readFileSync(path.join(BASE, 'docs', 'index.html')));

for (const [nombre, carpeta] of [['email-panel-PRIVADO.zip', 'email'], ['enlaces-PUBLICO.zip', 'enlaces']]) {
  const zip = path.join(BASE, nombre);
  fs.rmSync(zip, { force: true });
  execFileSync('zip', ['-r', '-X', '-q', zip, carpeta], { cwd: DIST });
  console.log('Listo:', nombre, '→', fs.readdirSync(path.join(DIST, carpeta)).join(', '));
}
fs.rmSync(path.join(BASE, 'edvolution-email-web.zip'), { force: true });
