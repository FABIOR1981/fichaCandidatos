import * as pdfjsLib from './vendor/pdf.min.mjs';
import { extraerTextoPdf, extraerTextoDocx } from './extraer-texto.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.mjs';

const estado = { fichas: [], filtro: '', fichaActual: null };
const $ = (selector) => document.querySelector(selector);

const CAMPOS_LISTA = ['redes_web', 'competencias_clave', 'idiomas', 'cursos_certificaciones', 'destinos_preferidos'];
const CAMPOS_BOOLEANOS = ['vehiculo_propio', 'referencias_cargadas'];
const CAMPOS_NUMERICOS = ['edad', 'anios_experiencia_total', 'cantidad_empleos', 'personas_a_cargo_max'];

function escapar(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function texto(valor, respaldo = '—') {
  return valor === null || valor === undefined || valor === '' ? respaldo : escapar(valor);
}

function lista(valores) {
  return Array.isArray(valores) && valores.length ? valores.map(escapar).join(', ') : '—';
}

async function pedir(url, opciones = {}) {
  const respuesta = await fetch(url, {
    ...opciones,
    headers: { 'content-type': 'application/json', ...(opciones.headers || {}) },
  });
  if (respuesta.status === 204) return null;
  const datos = await respuesta.json();
  if (!respuesta.ok) throw new Error(datos.error || `Error ${respuesta.status}`);
  return datos;
}

// ---------- Listado ----------

async function cargarFichas() {
  estado.fichas = await pedir('/api/fichas');
  renderTabla();
}

function fichasFiltradas() {
  const filtro = estado.filtro.trim().toLowerCase();
  if (!filtro) return estado.fichas;
  return estado.fichas.filter((f) =>
    [f.nombre_completo, f.cargo_actual_o_ultimo, f.ciudad, f.departamento, f.email, f.telefono_principal]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(filtro)
  );
}

function renderTabla() {
  const fichas = fichasFiltradas();
  $('#contador').textContent = `${fichas.length} de ${estado.fichas.length}`;
  $('#vacio').hidden = estado.fichas.length > 0;
  $('#tabla-fichas').innerHTML = fichas
    .map((f) => `
      <tr data-id="${escapar(f.id)}">
        <td>${texto(f.nombre_completo, 'Sin nombre')}</td>
        <td>${texto(f.cargo_actual_o_ultimo)}</td>
        <td>${texto(f.telefono_principal)}</td>
        <td>${texto(f.email)}</td>
        <td>${f.anios_experiencia_total !== null && f.anios_experiencia_total !== undefined ? `${escapar(f.anios_experiencia_total)} años` : '—'}</td>
        <td>${f.alertas?.length ? `<span class="alerta">${f.alertas.length}</span>` : ''}</td>
      </tr>`)
    .join('');
}

// ---------- Detalle ----------

function seccion(titulo, filas) {
  const contenido = filas.map(([etiqueta, valor]) => `<dt>${escapar(etiqueta)}</dt><dd>${valor}</dd>`).join('');
  return `<div class="seccion"><h3>${escapar(titulo)}</h3><dl>${contenido}</dl></div>`;
}

function renderDetalle(f) {
  estado.fichaActual = f;
  const titulos = (f.titulos || [])
    .map((t) => `${escapar(t.titulo)}${t.institucion ? ' · ' + escapar(t.institucion) : ''}${t.estado ? ' (' + escapar(t.estado) + ')' : ''}`)
    .join('<br>') || '—';

  $('#detalle').innerHTML = `
    <div class="cabecera-detalle">
      <h2>${texto(f.nombre_completo, 'Sin nombre')}</h2>
      <div class="acciones">
        <button id="btn-editar" type="button" class="primario">Editar</button>
        <button id="btn-json" type="button">Descargar JSON</button>
        <button id="btn-eliminar" type="button" class="peligro">Eliminar</button>
        <button id="btn-cerrar" type="button">Cerrar</button>
      </div>
    </div>
    <p class="resumen">${texto(f.resumen)}</p>
    ${f.alertas?.length ? `<div class="alertas">${f.alertas.map(escapar).join(' · ')}</div>` : ''}
    ${seccion('Identificación', [
      ['Cédula', texto(f.cedula)],
      ['Fecha de nacimiento', texto(f.fecha_nacimiento)],
      ['Edad', texto(f.edad)],
      ['Ciudad', texto(f.ciudad)],
      ['Departamento', texto(f.departamento)],
      ['Nacionalidad', texto(f.nacionalidad)],
    ])}
    ${seccion('Contacto', [
      ['Teléfono principal', texto(f.telefono_principal)],
      ['Teléfono alternativo', texto(f.telefono_alternativo)],
      ['Email', texto(f.email)],
      ['Redes / web', lista(f.redes_web)],
    ])}
    ${seccion('Perfil laboral', [
      ['Cargo actual o último', texto(f.cargo_actual_o_ultimo)],
      ['Empresa', texto(f.empresa_actual_o_ultima)],
      ['Años de experiencia', texto(f.anios_experiencia_total)],
      ['Cantidad de empleos', texto(f.cantidad_empleos)],
      ['Personas a cargo (máx.)', texto(f.personas_a_cargo_max)],
      ['Competencias clave', lista(f.competencias_clave)],
    ])}
    ${seccion('Formación y otros datos', [
      ['Formación máxima', texto(f.formacion_maxima)],
      ['Títulos', titulos],
      ['Cursos y certificaciones', lista(f.cursos_certificaciones)],
      ['Idiomas', lista(f.idiomas)],
      ['Licencia de conducir', texto(f.licencia_conducir)],
      ['Vehículo propio', texto(f.vehiculo_propio === null || f.vehiculo_propio === undefined ? null : f.vehiculo_propio ? 'Sí' : 'No')],
      ['Destinos preferidos', lista(f.destinos_preferidos)],
      ['Referencias cargadas', texto(f.referencias_cargadas === null || f.referencias_cargadas === undefined ? null : f.referencias_cargadas ? 'Sí' : 'No')],
    ])}
    ${f.perfil_texto ? `<div class="seccion"><h3>Perfil (texto original)</h3><p>${escapar(f.perfil_texto)}</p></div>` : ''}
    ${f.notas ? `<div class="seccion"><h3>Notas internas</h3><p>${escapar(f.notas)}</p></div>` : ''}
    <p class="pie-detalle">Origen: ${f.metodo_extraccion === 'manual' ? 'carga manual' : texto(f.archivo_origen)} · Actualizada: ${texto(f.actualizada_en || f.creada_en)}</p>
  `;

  $('#detalle').hidden = false;
  $('#detalle').scrollIntoView({ behavior: 'smooth' });
  $('#btn-cerrar').onclick = () => { $('#detalle').hidden = true; };
  $('#btn-json').onclick = () => descargarJson(f);
  $('#btn-editar').onclick = () => abrirFormulario(f);
  $('#btn-eliminar').onclick = () => eliminarFicha(f);
}

function descargarJson(f) {
  const blob = new Blob([JSON.stringify(f, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `ficha-${f.id}.json`;
  enlace.click();
  URL.revokeObjectURL(url);
}

async function eliminarFicha(f) {
  if (!confirm(`¿Eliminar la ficha de ${f.nombre_completo || 'este candidato'}?`)) return;
  await pedir(`/api/fichas/${f.id}`, { method: 'DELETE' });
  estado.fichas = estado.fichas.filter((x) => x.id !== f.id);
  $('#detalle').hidden = true;
  renderTabla();
}

// ---------- Formulario (alta y edición) ----------

function abrirFormulario(ficha = null) {
  const form = $('#form-ficha');
  form.reset();
  $('#error-form').hidden = true;
  $('#titulo-formulario').textContent = ficha ? 'Editar ficha' : 'Nueva ficha';
  form.dataset.id = ficha ? ficha.id : '';

  if (ficha) {
    for (const [clave, valor] of Object.entries(ficha)) {
      const campo = form.elements[clave];
      if (!campo) continue;
      if (CAMPOS_LISTA.includes(clave)) campo.value = (valor || []).join(', ');
      else if (CAMPOS_BOOLEANOS.includes(clave)) campo.value = valor === null || valor === undefined ? '' : String(valor);
      else campo.value = valor ?? '';
    }
  }

  $('#formulario').hidden = false;
  $('#formulario').scrollIntoView({ behavior: 'smooth' });
  form.elements.nombre_completo.focus();
}

function cerrarFormulario() {
  $('#formulario').hidden = true;
}

function datosDelFormulario(form) {
  const datos = {};
  for (const campo of form.elements) {
    if (!campo.name) continue;
    const valor = campo.value.trim();
    if (CAMPOS_BOOLEANOS.includes(campo.name)) datos[campo.name] = valor === '' ? null : valor === 'true';
    else if (CAMPOS_NUMERICOS.includes(campo.name)) datos[campo.name] = valor === '' ? null : Number(valor);
    else if (CAMPOS_LISTA.includes(campo.name)) datos[campo.name] = valor ? valor.split(',').map((v) => v.trim()).filter(Boolean) : [];
    else datos[campo.name] = valor || null;
  }
  return datos;
}

async function guardarFormulario(evento) {
  evento.preventDefault();
  const form = evento.target;
  const id = form.dataset.id;
  try {
    const datos = datosDelFormulario(form);
    const ficha = id
      ? await pedir(`/api/fichas/${id}`, { method: 'PUT', body: JSON.stringify(datos) })
      : await pedir('/api/fichas', { method: 'POST', body: JSON.stringify(datos) });

    const indice = estado.fichas.findIndex((f) => f.id === ficha.id);
    if (indice >= 0) estado.fichas[indice] = ficha;
    else estado.fichas.unshift(ficha);
    renderTabla();
    cerrarFormulario();
    renderDetalle(ficha);
  } catch (error) {
    const aviso = $('#error-form');
    aviso.textContent = error.message;
    aviso.hidden = false;
  }
}

// ---------- Carga de archivos ----------

function agregarProgreso(nombre, mensaje, clase) {
  const item = document.createElement('li');
  item.className = clase;
  item.textContent = `${nombre}: ${mensaje}`;
  $('#progreso').prepend(item);
  return item;
}

async function extraerTexto(archivo) {
  const buffer = await archivo.arrayBuffer();
  if (archivo.name.toLowerCase().endsWith('.pdf')) {
    return extraerTextoPdf(pdfjsLib, new Uint8Array(buffer));
  }
  if (archivo.name.toLowerCase().endsWith('.docx')) {
    return extraerTextoDocx(window.mammoth, { arrayBuffer: buffer });
  }
  throw new Error('Formato no soportado (usá PDF o DOCX)');
}

async function procesarArchivo(archivo) {
  const item = agregarProgreso(archivo.name, 'procesando…', 'en-curso');
  try {
    const textoCv = await extraerTexto(archivo);
    const ficha = await pedir('/api/fichas/desde-texto', {
      method: 'POST',
      body: JSON.stringify({ nombreArchivo: archivo.name, texto: textoCv }),
    });
    item.className = 'ok';
    item.textContent = `${archivo.name}: ficha creada (${ficha.nombre_completo || 'sin nombre detectado'})`;
    estado.fichas.unshift(ficha);
    renderTabla();
  } catch (error) {
    item.className = 'error';
    item.textContent = `${archivo.name}: ${error.message}`;
  }
}

async function procesarArchivos(archivos) {
  for (const archivo of archivos) {
    await procesarArchivo(archivo);
  }
}

// ---------- Inicio ----------

function iniciar() {
  const zona = $('#zona-carga');
  const entrada = $('#entrada-archivos');

  entrada.addEventListener('change', async () => {
    const archivos = [...entrada.files];
    entrada.value = '';
    await procesarArchivos(archivos);
  });

  zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('activa'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('activa'));
  zona.addEventListener('drop', async (e) => {
    e.preventDefault();
    zona.classList.remove('activa');
    await procesarArchivos([...e.dataTransfer.files]);
  });

  $('#buscar').addEventListener('input', (e) => {
    estado.filtro = e.target.value;
    renderTabla();
  });

  $('#tabla-fichas').addEventListener('click', (e) => {
    const fila = e.target.closest('tr[data-id]');
    if (!fila) return;
    const ficha = estado.fichas.find((f) => f.id === fila.dataset.id);
    if (ficha) renderDetalle(ficha);
  });

  $('#btn-nueva').addEventListener('click', () => abrirFormulario());
  $('#btn-cancelar-form').addEventListener('click', cerrarFormulario);
  $('#btn-cancelar-form-2').addEventListener('click', cerrarFormulario);
  $('#form-ficha').addEventListener('submit', guardarFormulario);

  cargarFichas().catch((error) => {
    agregarProgreso('Listado', `no se pudo cargar: ${error.message}`, 'error');
  });
}

iniciar();
