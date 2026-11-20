# Edvolution Email (Gmail + Google Sheets + GitHub Pages)

Herramienta propia de email que envía desde **hola@edvolution.io** con Gmail. Funciona en la nube de Google, así que programa los envíos aunque el Mac esté apagado. Es gratis.

- **Campañas**: un email a una lista, ahora o en una fecha.
- **Secuencias**: varios emails espaciados en días. Van en el mismo hilo ("Re: …") y se paran solas si la persona responde, rebota o se da de baja.
- **Métricas**: respuestas, clics, rebotes y bajas. Las aperturas son orientativas.
- **Formatos**: *personal* (parece un email escrito a mano, para comercial) o *newsletter* (plantilla de marca).

| Pieza | Qué es |
|---|---|
| `apps-script/` | El programa (Google Apps Script) que va dentro de la hoja de cálculo |
| `docs/` | Dos páginas públicas (redirección de clics y baja) que se publican con GitHub Pages |

---

## Instalación (una sola vez, ~20 min)

Hazlo todo con la sesión de Google de **hola@edvolution.io**. Si usas el navegador con varias cuentas, mejor en una ventana de incógnito o en un perfil de Chrome solo para esa cuenta.

### 1. La hoja de cálculo
1. En Google Drive de hola@: **Nuevo → Hojas de cálculo**. Llámala **Edvolution Email**.
2. En la hoja: **Extensiones → Apps Script**. Se abre el editor de código.

### 2. Copiar el código
En el editor de Apps Script:
1. Rueda dentada (**Configuración del proyecto**) → marca **"Mostrar el archivo de manifiesto appsscript.json"**.
2. Vuelve al editor (icono `< >`). Por cada fichero de `apps-script/`:
   - `appsscript.json`: ábrelo en el editor y sustituye todo su contenido.
   - `Code.gs` (el que viene por defecto): renómbralo a `Config` y pega `Config.gs`.
   - `Datos.gs`, `Plantilla.gs`, `Envio.gs`, `Web.gs`, `Api.gs`: **+ → Secuencia de comandos**, con el mismo nombre sin `.gs`, y pega el contenido.
   - `Ui.html`: **+ → HTML**, nombre `Ui`, y pega el contenido.
3. Guarda (⌘S).

> Alternativa más rápida para actualizar en el futuro: [clasp](https://github.com/google/clasp) (`npm i -g @google/clasp`, `clasp login`, `clasp clone <ID>` y `clasp push`). Claude puede hacerlo por ti si lo instalas.

### 3. Activar
1. Vuelve a la hoja y recárgala. Aparece el menú **Edvolution Email**.
2. **Edvolution Email → Configuración inicial**. Google pedirá permisos (enviar email, leer el buzón para detectar respuestas y rebotes, y editar la hoja). Acéptalos: el código es tuyo y solo se ejecuta en tu cuenta.
3. Se crean las pestañas y una tarea que procesa los envíos cada 10 minutos.

### 4. Publicar el registro de clics y bajas
En el editor de Apps Script: **Implementar → Nueva implementación** → tipo **Aplicación web**:
- Ejecutar como: **Yo (hola@edvolution.io)**
- Quién tiene acceso: **Cualquier usuario**

Copia la URL que termina en **`/exec`**.

> Si no aparece "Cualquier usuario", la consola de administración de Workspace lo está bloqueando: Apps → Google Workspace → Drive y Documentos → Opciones de uso compartido.

### 5. GitHub Pages
1. En GitHub crea un repositorio **público** llamado `edvolution-email`.
2. Sube el contenido de esta carpeta `gmail/` (como mínimo `docs/`). Antes, edita `docs/config.js` y pega tu URL `/exec`.
3. En el repositorio: **Settings → Pages → Branch: `main`, carpeta `/docs` → Save**.
4. En un minuto tendrás la web en `https://TU-USUARIO.github.io/edvolution-email`.

### 6. Ajustes en la app
**Edvolution Email → Abrir la app → Ajustes**:
- URL `/exec` y URL de GitHub Pages
- Nombre del remitente (p. ej. "Marcos · Edvolution") y firma
- Pie legal con razón social y **dirección postal**
- Máximo diario: empieza por **100–200**. Un buzón que nunca ha enviado volumen debe ir subiendo poco a poco.

---

## Uso diario

- **Contactos**: se editan directamente en la pestaña *Contactos*. Columnas: `email`, `nombre`, `organizacion`, `cargo`, `listas` (separadas por comas, p. ej. `webinar-nov, direcciones`), `estado` (`activo` / `baja` / `rebotado`) y `consentimiento` (cómo y cuándo lo dio). Para importar, pega filas desde otro Excel.
- **Variables**: `{{nombre}}` (solo el nombre de pila), `{{organizacion}}`, `{{cargo}}`. Con valor por defecto: `{{nombre|equipo}}`.
- **Botón** (formato newsletter): una línea `>> [Hablamos](https://edvolution.io/contacto/)`.
- **Prueba antes de enviar**: siempre "Enviar prueba" a ti mismo.
- Para enviar algo ya mismo: **Edvolution Email → Procesar envíos ahora**.

## Límites y buenas prácticas
- Google Workspace permite ~2.000 emails/día por buzón. La app nunca pasa del máximo que pongas en Ajustes.
- **LSSI (art. 21)**: no se pueden enviar emails comerciales a quien no lo haya consentido, salvo a clientes con relación previa. Apunta el consentimiento en Contactos.
- Las aperturas se miden con una imagen invisible; Gmail y Apple Mail la cargan por su cuenta. Mencionadlo en la política de privacidad y fiaos más de clics y respuestas.
- Si cambias `Web.gs`, en Apps Script: **Implementar → Gestionar implementaciones → editar → Versión: nueva**. La URL `/exec` no cambia.

---

## Panel web en landings.edvolution.io/email

El panel también funciona como web estática, fuera de la hoja de cálculo.

1. Genera el zip con `node web/build.mjs`. Crea `edvolution-email-web.zip`.
2. Sube su contenido al servidor de forma que quede en `https://landings.edvolution.io/email/`: `index.html` (el panel), `r.html` (clics), `baja.html` (bajas), `estilo.css` y `config.js`.
3. En la hoja de Google de hola@: **Edvolution Email → Crear clave de acceso web**. Copia la clave, que solo se muestra una vez.
4. Entra en `https://landings.edvolution.io/email/` y pega la clave. Se guarda solo en ese navegador. Para cerrar la sesión, usa el botón **Salir**.
5. Si pierdes la clave o crees que alguien la tiene, crea otra: la anterior deja de funcionar al momento.

Si cambias `Web.gs` o `Api.gs`, después de `clasp push` hay que actualizar la implementación (la URL no cambia):
`clasp update-deployment --user hola AKfycbwR6xBNsO8v5S2e1fju9l2HmesSVjeggBUWGgnas45P6vpZWp30hcA19CsdgDHaHKlQvg`
