import * as pdfjsLib from './vendor/pdf.min.mjs';
import { extraerTextoPdf, extraerTextoDocx } from './extraer-texto.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.mjs';

const estado = { contactos: [], filtro: '', departamentos: [] };
const $ = (selector) => document.querySelector(selector);

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

async function cargarContactos() {
  estado.contactos = await pedir('/api/fichas');
  renderTabla();
}

function contactosFiltrados() {
  const filtro = estado.filtro.trim().toLowerCase();
  if (!filtro) return estado.contactos;
  return estado.contactos.filter((c) =>
    [c.nombre, c.telefono, c.email, c.departamento, c.localidad]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(filtro)
  );
}

function renderTabla() {
  const contactos = contactosFiltrados();
  $('#contador').textContent = `${contactos.length} de ${estado.contactos.length}`;
  $('#vacio').hidden = estado.contactos.length > 0;
  $('#tabla-fichas').innerHTML = contactos
    .map((c) => `
      <tr data-id="${escapar(c.id)}">
        <td>${texto(c.nombre, 'Sin nombre')}</td>
        <td>${texto(c.telefono)}</td>
        <td>${texto(c.email)}</td>
        <td>${texto(c.departamento)}</td>
        <td>${texto(c.localidad)}</td>
        <td>${c.alertas?.length ? `<span class="alerta">${c.alertas.length}</span>` : ''}</td>
      </tr>`)
    .join('');
}

// ---------- Detalle ----------

function renderDetalle(c) {
  $('#detalle').innerHTML = `
    <div class="cabecera-detalle">
      <h2>${texto(c.nombre, 'Sin nombre')}</h2>
      <div class="acciones">
        <button id="btn-editar" type="button" class="primario">Editar</button>
        <button id="btn-eliminar" type="button" class="peligro">Eliminar</button>
        <button id="btn-cerrar" type="button">Cerrar</button>
      </div>
    </div>
    <dl class="datos">
      <dt>Teléfono</dt><dd>${texto(c.telefono)}</dd>
      <dt>Email</dt><dd>${texto(c.email)}</dd>
      <dt>Departamento</dt><dd>${texto(c.departamento)}</dd>
      <dt>Localidad</dt><dd>${texto(c.localidad)}</dd>
    </dl>
    ${c.alertas?.length ? `<div class="alertas">${c.alertas.map(escapar).join(' · ')}</div>` : ''}
    <p class="pie-detalle">Origen: ${c.archivo_origen ? escapar(c.archivo_origen) : 'carga manual'} · Actualizado: ${texto(c.actualizada_en || c.creada_en)}</p>
  `;

  $('#detalle').hidden = false;
  $('#detalle').scrollIntoView({ behavior: 'smooth' });
  $('#btn-cerrar').onclick = () => { $('#detalle').hidden = true; };
  $('#btn-editar').onclick = () => abrirFormulario(c);
  $('#btn-eliminar').onclick = () => eliminarContacto(c);
}

async function eliminarContacto(c) {
  if (!confirm(`¿Eliminar a ${c.nombre || 'este contacto'}?`)) return;
  await pedir(`/api/fichas/${c.id}`, { method: 'DELETE' });
  estado.contactos = estado.contactos.filter((x) => x.id !== c.id);
  $('#detalle').hidden = true;
  renderTabla();
}

// ---------- Formulario (alta y edición) ----------

const CAMPOS = ['nombre', 'telefono', 'email', 'departamento', 'localidad'];

async function cargarDepartamentos() {
  const datos = await pedir('/api/geografia');
  estado.departamentos = datos.departamentos;
  const select = $('#form-ficha').elements.departamento;
  for (const d of estado.departamentos) {
    select.add(new Option(d.nombre, d.nombre));
  }
}

const OPCION_OTRA = '__otra__';

/** Llena la lista de localidades del departamento: primero las precargadas, al final "Otra". */
function actualizarLocalidades(nombreDepartamento, localidadSeleccionada = '') {
  const form = $('#form-ficha');
  const select = form.elements.localidad;
  const departamento = estado.departamentos.find((d) => d.nombre === nombreDepartamento);
  const precargadas = departamento ? departamento.localidades : [];

  select.innerHTML = '<option value="">—</option>'
    + precargadas.map((l) => `<option value="${escapar(l)}">${escapar(l)}</option>`).join('')
    + `<option value="${OPCION_OTRA}">+ Otra localidad (escribir)</option>`;

  if (localidadSeleccionada && !precargadas.includes(localidadSeleccionada)) {
    select.value = OPCION_OTRA;
    form.elements.localidad_otra.value = localidadSeleccionada;
  } else {
    select.value = localidadSeleccionada;
    form.elements.localidad_otra.value = '';
  }
  mostrarCampoOtra();
}

function mostrarCampoOtra() {
  const form = $('#form-ficha');
  const escribiendo = form.elements.localidad.value === OPCION_OTRA;
  form.elements.localidad_otra.hidden = !escribiendo;
  if (escribiendo) form.elements.localidad_otra.focus();
}

/** La localidad elegida de la lista o, si es "Otra", el texto escrito. */
function localidadDelFormulario(form) {
  const valor = form.elements.localidad.value;
  return (valor === OPCION_OTRA ? form.elements.localidad_otra.value : valor).trim() || null;
}

function abrirFormulario(contacto = null) {
  const form = $('#form-ficha');
  form.reset();
  $('#error-form').hidden = true;
  $('#titulo-formulario').textContent = contacto ? 'Editar contacto' : 'Nuevo contacto';
  form.dataset.id = contacto ? contacto.id : '';
  if (contacto) {
    for (const campo of ['nombre', 'telefono', 'email']) {
      form.elements[campo].value = contacto[campo] ?? '';
    }
    form.elements.departamento.value = contacto.departamento ?? '';
  }
  actualizarLocalidades(form.elements.departamento.value, contacto?.localidad ?? '');
  $('#formulario').hidden = false;
  $('#formulario').scrollIntoView({ behavior: 'smooth' });
  form.elements.nombre.focus();
}

function cerrarFormulario() {
  $('#formulario').hidden = true;
}

async function guardarFormulario(evento) {
  evento.preventDefault();
  const form = evento.target;
  const id = form.dataset.id;
  const datos = {};
  for (const campo of CAMPOS) {
    datos[campo] = campo === 'localidad'
      ? localidadDelFormulario(form)
      : form.elements[campo].value.trim() || null;
  }

  try {
    const contacto = id
      ? await pedir(`/api/fichas/${id}`, { method: 'PUT', body: JSON.stringify(datos) })
      : await pedir('/api/fichas', { method: 'POST', body: JSON.stringify(datos) });

    const indice = estado.contactos.findIndex((c) => c.id === contacto.id);
    if (indice >= 0) estado.contactos[indice] = contacto;
    else estado.contactos.unshift(contacto);
    renderTabla();
    cerrarFormulario();
    renderDetalle(contacto);
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
    const contacto = await pedir('/api/fichas/desde-texto', {
      method: 'POST',
      body: JSON.stringify({ nombreArchivo: archivo.name, texto: textoCv }),
    });
    item.className = 'ok';
    item.textContent = `${archivo.name}: contacto creado (${contacto.nombre || 'sin nombre detectado'})`;
    estado.contactos.unshift(contacto);
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
    const contacto = estado.contactos.find((c) => c.id === fila.dataset.id);
    if (contacto) renderDetalle(contacto);
  });

  $('#form-ficha').elements.departamento.addEventListener('change', (e) => {
    actualizarLocalidades(e.target.value);
  });
  $('#form-ficha').elements.localidad.addEventListener('change', mostrarCampoOtra);

  $('#btn-nueva').addEventListener('click', () => abrirFormulario());
  $('#btn-cancelar-form').addEventListener('click', cerrarFormulario);
  $('#btn-cancelar-form-2').addEventListener('click', cerrarFormulario);
  $('#form-ficha').addEventListener('submit', guardarFormulario);

  cargarDepartamentos().catch((error) => {
    agregarProgreso('Departamentos', `no se pudieron cargar: ${error.message}`, 'error');
  });
  cargarContactos().catch((error) => {
    agregarProgreso('Listado', `no se pudo cargar: ${error.message}`, 'error');
  });
}

iniciar();
