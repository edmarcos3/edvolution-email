// Markdown → email. Dos formatos:
//  - "newsletter": plantilla de marca Edvolution (cabecera azul, botones, pie legal)
//  - "personal":   parece un email escrito a mano (texto simple + firma), ideal para comercial

var C = { azul: '#001260', acento: '#325cf6', tinta: '#0b0b0b', suave: '#5b6478' };
var MONO = "'IBM Plex Mono', Menlo, Consolas, monospace";
var SANS = 'Roboto, Arial, Helvetica, sans-serif';

function escHtml(s) { return String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function mdInline(s) {
  return escHtml(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
}

/** Conversor Markdown mínimo: ## títulos, párrafos, listas, **negrita**, *cursiva*, [enlaces](url), > citas. */
function mdAHtml(md) {
  var out = [], list = null, para = [];
  function flushPara() { if (para.length) out.push('<p>' + mdInline(para.join(' ')) + '</p>'); para = []; }
  function flushList() { if (list) out.push('<' + list.tag + '>' + list.items.map(function (i) { return '<li>' + mdInline(i) + '</li>'; }).join('') + '</' + list.tag + '>'); list = null; }
  String(md || '').split('\n').forEach(function (raw) {
    var line = raw.replace(/\s+$/, ''), m;
    if (!line.trim()) { flushPara(); flushList(); return; }
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { flushPara(); flushList(); out.push('<h' + m[1].length + '>' + mdInline(m[2]) + '</h' + m[1].length + '>'); }
    else if ((m = line.match(/^\s*[-*]\s+(.*)$/)) || (m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara();
      var tag = /^\s*\d/.test(line) ? 'ol' : 'ul';
      if (!list || list.tag !== tag) { flushList(); list = { tag: tag, items: [] }; }
      list.items.push(m[1]);
    } else if ((m = line.match(/^>\s?(.*)$/))) { flushPara(); flushList(); out.push('<blockquote><p>' + mdInline(m[1]) + '</p></blockquote>'); }
    else { flushList(); para.push(line.trim()); }
  });
  flushPara(); flushList();
  return out.join('\n');
}

/** Sustituye {{nombre}}, {{organizacion}}, {{cargo}}, {{email}}. Admite valor por defecto: {{nombre|equipo}}. */
function personalizar(texto, c) {
  return String(texto || '').replace(/\{\{\s*(nombre|organizacion|organización|cargo|email)\s*(?:\|([^}]*))?\}\}/gi, function (_, campo, def) {
    var k = campo.toLowerCase().replace('organización', 'organizacion');
    var v = String((c && c[k]) || '').trim();
    if (k === 'nombre' && v) v = v.split(/\s+/)[0]; // solo el nombre de pila
    return v || (def || '').trim();
  });
}

/** Extrae los botones (línea ">> [Texto](url)") antes de convertir. */
function conBotones(md, pintar) {
  var botones = [];
  var pre = String(md || '').split('\n').map(function (l) {
    var m = l.match(/^\s*>>\s*\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\s*$/);
    if (!m) return l;
    botones.push(pintar(escHtml(m[1]), m[2]));
    return '\n%%BOTON' + (botones.length - 1) + '%%\n';
  }).join('\n');
  return {
    html: function () { return mdAHtml(pre).replace(/<p>%%BOTON(\d+)%%<\/p>/g, '%%BOTON$1%%'); },
    poner: function (html) { return html.replace(/%%BOTON(\d+)%%/g, function (_, i) { return botones[i]; }); },
  };
}

function htmlNewsletter(md, asunto, aj) {
  var b = conBotones(md, function (t, url) {
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 22px"><tr><td style="background:' + C.acento + ';border-radius:8px">' +
      '<a href="' + url + '" style="display:inline-block;padding:13px 24px;font-family:' + MONO + ';font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;text-transform:uppercase;letter-spacing:.03em">' + t + '</a></td></tr></table>';
  });
  var cuerpo = b.poner(b.html()
    .replace(/<h1>/g, '<h1 style="font-family:' + MONO + ';font-size:22px;line-height:1.3;color:' + C.azul + ';margin:0 0 14px">')
    .replace(/<h2>/g, '<h2 style="font-family:' + MONO + ';font-size:19px;line-height:1.3;color:' + C.azul + ';margin:30px 0 10px">')
    .replace(/<h3>/g, '<h3 style="font-family:' + MONO + ';font-size:16px;line-height:1.3;color:' + C.azul + ';margin:24px 0 8px">')
    .replace(/<h4>/g, '<h4 style="font-family:' + SANS + ';font-size:15px;color:' + C.azul + ';margin:20px 0 6px">')
    .replace(/<p>/g, '<p style="margin:0 0 16px;font-family:' + SANS + ';font-size:16px;line-height:1.6;color:' + C.tinta + '">')
    .replace(/<(ul|ol)>/g, '<$1 style="margin:0 0 16px;padding-left:22px;font-family:' + SANS + ';font-size:16px;line-height:1.6;color:' + C.tinta + '">')
    .replace(/<li>/g, '<li style="margin:0 0 6px">')
    .replace(/<blockquote>/g, '<blockquote style="margin:0 0 16px;padding:12px 18px;border-left:4px solid ' + C.acento + ';background:#f4f6fb">')
    .replace(/<a href=/g, '<a style="color:' + C.acento + ';font-weight:600" href='));
  var cab = aj.logo
    ? '<img src="' + escHtml(aj.logo) + '" alt="edvolution" height="30" style="display:block;height:30px;border:0">'
    : '<span style="font-family:' + MONO + ';font-size:20px;font-weight:700;color:#ffffff;letter-spacing:.02em">edvolution</span>';
  var web = aj.web || 'https://edvolution.io';
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escHtml(asunto) + '</title></head>' +
    '<body style="margin:0;padding:0;background:#f4f6fb">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6fb"><tr><td align="center" style="padding:24px 12px">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">' +
    '<tr><td style="background:' + C.azul + ';padding:22px 32px"><a href="' + escHtml(web) + '" style="text-decoration:none">' + cab + '</a></td></tr>' +
    '<tr><td style="padding:32px 32px 12px">' + cuerpo + '</td></tr>' +
    '<tr><td style="padding:22px 32px;border-top:1px solid #dfe4f0;font-family:' + SANS + ';font-size:12.5px;line-height:1.6;color:' + C.suave + '">' +
    escHtml(aj.pie) + '<br>Recibes este email porque estás suscrito a las comunicaciones de Edvolution.<br>' +
    '<a href="%%BAJA%%" style="color:' + C.suave + ';text-decoration:underline">Darme de baja</a> · <a href="' + escHtml(web) + '" style="color:' + C.suave + ';text-decoration:underline">' + escHtml(web.replace(/^https?:\/\//, '')) + '</a>' +
    '</td></tr></table></td></tr></table>%%PIXEL%%</body></html>';
}

function htmlPersonal(md, aj) {
  var b = conBotones(md, function (t, url) { return '<p style="margin:0 0 14px"><a href="' + url + '" style="color:#1a56db">' + t + ' →</a></p>'; });
  var cuerpo = b.poner(b.html()
    .replace(/<h\d>/g, '<p style="margin:16px 0 8px"><strong>').replace(/<\/h\d>/g, '</strong></p>')
    .replace(/<p>/g, '<p style="margin:0 0 14px">')
    .replace(/<(ul|ol)>/g, '<$1 style="margin:0 0 14px;padding-left:22px">')
    .replace(/<blockquote>/g, '<blockquote style="margin:0 0 14px;padding-left:12px;border-left:3px solid #ccc;color:#555">'));
  var firma = aj.firma ? '<p style="margin:18px 0 0;color:#444">' + escHtml(aj.firma).replace(/\n/g, '<br>') + '</p>' : '';
  return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#222">' + cuerpo + firma +
    '<p style="margin:26px 0 0;font-size:11.5px;color:#999">' + escHtml(aj.pie) + ' · Si prefieres no recibir más emails, <a href="%%BAJA%%" style="color:#999">avísame aquí</a>.</p></div>%%PIXEL%%';
}

function textoPlano(md, aj, bajaUrl) {
  var t = String(md || '')
    .replace(/^\s*>>\s*\[([^\]]+)\]\(([^)]+)\)\s*$/gm, '$1: $2')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2')
    .replace(/^#{1,4}\s+/gm, '').replace(/^>\s?/gm, '');
  return t + (aj.firma ? '\n\n' + aj.firma : '') + '\n\n--\n' + aj.pie + '\nBaja: ' + bajaUrl;
}

/** Lista ordenada de URLs con seguimiento de un HTML (sin repetir). */
function urlsDe(html) {
  var vistos = {}, out = [];
  html.replace(/href="(https?:\/\/[^"]+)"/g, function (_, u) { if (!vistos[u]) { vistos[u] = 1; out.push(u); } });
  return out;
}

/**
 * Prepara un email para un contacto.
 * pieza = { asunto, cuerpo, formato }; envioId = id del envío ('prueba' = sin seguimiento);
 * enlaces = array de URLs con seguimiento (posición = nº de enlace) o null para calcularlas.
 */
function prepararEmail(pieza, contacto, envioId, enlaces) {
  var aj = ajustes();
  var md = personalizar(pieza.cuerpo, contacto);
  var asunto = personalizar(pieza.asunto, contacto);
  var html = pieza.formato === 'newsletter' ? htmlNewsletter(md, asunto, aj) : htmlPersonal(md, aj);
  var urls = enlaces || urlsDe(html);
  var seguimiento = envioId !== 'prueba' && aj.exec && aj.pages;
  var bajaUrl = seguimiento ? aj.pages + '/baja.html?e=' + envioId : 'mailto:' + aj.remitente + '?subject=Baja';
  if (seguimiento) {
    html = html.replace(/href="(https?:\/\/[^"]+)"/g, function (m, u) {
      var n = urls.indexOf(u);
      return n < 0 ? m : 'href="' + aj.pages + '/r.html?e=' + envioId + '&amp;l=' + n + '"';
    });
  }
  html = html.replace(/%%BAJA%%/g, escHtml(bajaUrl))
    .replace('%%PIXEL%%', seguimiento ? '<img src="' + aj.exec + '?a=o&amp;e=' + envioId + '" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px">' : '');
  return {
    asunto: asunto, html: html, texto: textoPlano(md, aj, bajaUrl), urls: urls,
    bajaUrl: bajaUrl, bajaPost: seguimiento ? aj.exec + '?a=b&e=' + envioId : '',
  };
}
