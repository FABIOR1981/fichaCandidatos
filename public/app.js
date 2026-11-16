import * as pdfjsLib from './vendor/pdf.min.mjs';
import { extraerTextoPdf, extraerTextoDocx } from './extraer-texto.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.mjs';

const OPCION_OTRA = '__otra__';
const estado = { contactos: [], filtro: '', departamentos: [], contactoAbierto: null };
const $ = (selector) => document.querySelector(selector);
const dialogo = $('#dialogo-form');
const form = $('#form-contacto');
const drawer = $('#detalle');

function escapar(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
  const total = estado.contactos.length;

  $('#resumen').textContent = total === 1 ? '1 contacto' : `${total} contactos`;

  const hayContactos = total > 0;
  const vacio = $('#vacio');
  vacio.hidden = contactos.length > 0;
  $('#vacio-texto').textContent = hayContactos
    ? `Sin resultados para “${estado.filtro.trim()}”.`
    : 'Todavía no hay contactos. Subí CVs o agregá uno a mano.';

  $('#tabla-contactos').innerHTML = contactos
    .map((c) => `
      <tr data-id="${escapar(c.id)}">
        <td>${escapar(c.nombre || 'Sin nombre')}</td>
        <td>${c.telefono ? escapar(c.telefono) : '<span class="texto-vacio">—</span>'}</td>
        <td class="oculto-movil">${c.email ? escapar(c.email) : '<span class="texto-vacio">—</span>'}</td>
        <td>${c.departamento ? escapar(c.departamento) : '<span class="texto-vacio">—</span>'}</td>
        <td>${c.localidad ? escapar(c.localidad) : '<span class="texto-vacio">—</span>'}</td>
        <td>${c.alertas?.length ? `<span class="alerta-chip" title="${escapar(c.alertas.join(' · '))}">${c.alertas.length}</span>` : ''}</td>
      </tr>`)
    .join('');
}

// ---------- Panel de detalle ----------

function filaDato(etiqueta, valor) {
  return `<div class="fila"><dt>${escapar(etiqueta)}</dt><dd>${valor || '<span class="texto-vacio">—</span>'}</dd></div>`;
}

function abrirDetalle(c) {
  estado.contactoAbierto = c;
  const ubicacion = [c.localidad, c.departamento].filter(Boolean).join(', ');
  drawer.innerHTML = `
    <div class="cabecera-drawer">
      <div>
        <h2>${escapar(c.nombre || 'Sin nombre')}</h2>
        <p class="subtitulo">${ubicacion ? escapar(ubicacion) : 'Sin ubicación'}</p>
      </div>
      <button type="button" id="cerrar-detalle" class="boton-icono" aria-label="Cerrar">×</button>
    </div>
    <dl>
      ${filaDato('Teléfono', c.telefono ? escapar(c.telefono) : '')}
      ${filaDato('Email', c.email ? escapar(c.email) : '')}
      ${filaDato('Departamento', c.departamento ? escapar(c.departamento) : '')}
      ${filaDato('Localidad', c.localidad ? escapar(c.localidad) : '')}
    </dl>
    ${c.alertas?.length ? `<div class="alertas">${c.alertas.map((a) => `<span class="alerta-chip">${escapar(a)}</span>`).join('')}</div>` : ''}
    <div class="acciones">
      <button type="button" id="btn-editar" class="boton primario">Editar</button>
      <button type="button" id="btn-eliminar" class="boton peligro">Eliminar</button>
    </div>
    <p class="origen">${c.archivo_origen ? `Cargado desde ${escapar(c.archivo_origen)}` : 'Cargado a mano'}</p>
  `;
  drawer.hidden = false;
  $('#cerrar-detalle').addEventListener('click', cerrarDetalle);
  $('#btn-editar').addEventListener('click', () => abrirFormulario(c));
  $('#btn-eliminar').addEventListener('click', () => eliminarContacto(c));
  $('#cerrar-detalle').focus();
}

function cerrarDetalle() {
  drawer.hidden = true;
  estado.contactoAbierto = null;
}

async function eliminarContacto(c) {
  if (!confirm(`¿Eliminar a ${c.nombre || 'este contacto'}?`)) return;
  await pedir(`/api/fichas/${c.id}`, { method: 'DELETE' });
  estado.contactos = estado.contactos.filter((x) => x.id !== c.id);
  cerrarDetalle();
  renderTabla();
}

// ---------- Formulario (alta y edición) ----------

async function cargarDepartamentos() {
  const datos = await pedir('/api/geografia');
  estado.departamentos = datos.departamentos;
  const select = form.elements.departamento;
  for (const d of estado.departamentos) {
    select.add(new Option(d.nombre, d.nombre));
  }
}

/** Lista de localidades del departamento: primero las precargadas, al final "Otra". */
function actualizarLocalidades(nombreDepartamento, localidadSeleccionada = '') {
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
  const escribiendo = form.elements.localidad.value === OPCION_OTRA;
  form.elements.localidad_otra.hidden = !escribiendo;
  if (escribiendo) form.elements.localidad_otra.focus();
}

function localidadDelFormulario() {
  const valor = form.elements.localidad.value;
  return (valor === OPCION_OTRA ? form.elements.localidad_otra.value : valor).trim() || null;
}

function abrirFormulario(contacto = null) {
  form.reset();
  $('#error-form').hidden = true;
  $('#titulo-form').textContent = contacto ? 'Editar contacto' : 'Nuevo contacto';
  form.dataset.id = contacto ? contacto.id : '';
  if (contacto) {
    form.elements.nombre.value = contacto.nombre ?? '';
    form.elements.telefono.value = contacto.telefono ?? '';
    form.elements.email.value = contacto.email ?? '';
    form.elements.departamento.value = contacto.departamento ?? '';
  }
  actualizarLocalidades(form.elements.departamento.value, contacto?.localidad ?? '');
  dialogo.showModal();
  form.elements.nombre.focus();
}

async function guardarFormulario(evento) {
  evento.preventDefault();
  const id = form.dataset.id;
  const datos = {
    nombre: form.elements.nombre.value.trim() || null,
    telefono: form.elements.telefono.value.trim() || null,
    email: form.elements.email.value.trim() || null,
    departamento: form.elements.departamento.value || null,
    localidad: localidadDelFormulario(),
  };

  try {
    const contacto = id
      ? await pedir(`/api/fichas/${id}`, { method: 'PUT', body: JSON.stringify(datos) })
      : await pedir('/api/fichas', { method: 'POST', body: JSON.stringify(datos) });

    const indice = estado.contactos.findIndex((c) => c.id === contacto.id);
    if (indice >= 0) estado.contactos[indice] = contacto;
    else estado.contactos.unshift(contacto);

    dialogo.close();
    renderTabla();
    abrirDetalle(contacto);
  } catch (error) {
    const aviso = $('#error-form');
    aviso.textContent = error.message;
    aviso.hidden = false;
  }
}

// ---------- Carga de CVs ----------

function mostrarPanelCarga() {
  $('#panel-carga').hidden = false;
}

function agregarProgreso(nombre, mensaje, clase) {
  mostrarPanelCarga();
  const item = document.createElement('li');
  item.className = clase;
  item.innerHTML = `<span class="estado-punto"></span><span></span>`;
  item.lastElementChild.textContent = `${nombre}: ${mensaje}`;
  $('#progreso').prepend(item);
  return item;
}

async function extraerTexto(archivo) {
  const buffer = await archivo.arrayBuffer();
  const nombre = archivo.name.toLowerCase();
  if (nombre.endsWith('.pdf')) {
    return extraerTextoPdf(pdfjsLib, new Uint8Array(buffer));
  }
  if (nombre.endsWith('.docx')) {
    return extraerTextoDocx(window.mammoth, { arrayBuffer: buffer });
  }
  throw new Error('Formato no soportado (usá PDF o DOCX)');
}

async function procesarArchivo(archivo) {
  const item = agregarProgreso(archivo.name, 'procesando…', 'en-curso');
  const mensaje = item.lastElementChild;
  try {
    const textoCv = await extraerTexto(archivo);
    const contacto = await pedir('/api/fichas/desde-texto', {
      method: 'POST',
      body: JSON.stringify({ nombreArchivo: archivo.name, texto: textoCv }),
    });
    item.className = 'ok';
    mensaje.textContent = `${archivo.name}: ${contacto.nombre || 'contacto creado sin nombre'}`;
    estado.contactos.unshift(contacto);
    renderTabla();
  } catch (error) {
    item.className = 'error';
    mensaje.textContent = `${archivo.name}: ${error.message}`;
  }
}

async function procesarArchivos(archivos) {
  const validos = archivos.filter((a) => /\.(pdf|docx)$/i.test(a.name));
  for (const archivo of archivos.filter((a) => !validos.includes(a))) {
    agregarProgreso(archivo.name, 'formato no soportado (usá PDF o DOCX)', 'error');
  }
  for (const archivo of validos) {
    await procesarArchivo(archivo);
  }
}

// ---------- Arrastrar archivos a cualquier parte ----------

function configurarArrastre() {
  const zona = $('#zona-soltar');
  const ocultar = () => { zona.hidden = true; };

  const esArchivo = (e) => [...(e.dataTransfer?.types || [])].includes('Files');

  window.addEventListener('dragenter', (e) => {
    if (!esArchivo(e)) return;
    zona.hidden = false;
  });
  // Se oculta solo cuando el puntero sale de la ventana, no al pasar por elementos hijos.
  window.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null || e.clientX <= 0 || e.clientY <= 0
        || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
      ocultar();
    }
  });
  window.addEventListener('dragover', (e) => {
    if (esArchivo(e)) e.preventDefault();
  });
  window.addEventListener('dragend', ocultar);
  window.addEventListener('blur', ocultar);
  window.addEventListener('drop', async (e) => {
    if (!esArchivo(e)) return;
    e.preventDefault();
    ocultar();
    await procesarArchivos([...e.dataTransfer.files]);
  });
}

// ---------- Inicio ----------

function iniciar() {
  $('#entrada-archivos').addEventListener('change', async (e) => {
    const archivos = [...e.target.files];
    e.target.value = '';
    await procesarArchivos(archivos);
  });

  $('#buscar').addEventListener('input', (e) => {
    estado.filtro = e.target.value;
    renderTabla();
  });

  $('#tabla-contactos').addEventListener('click', (e) => {
    const fila = e.target.closest('tr[data-id]');
    if (!fila) return;
    const contacto = estado.contactos.find((c) => c.id === fila.dataset.id);
    if (contacto) abrirDetalle(contacto);
  });

  $('#btn-nuevo').addEventListener('click', () => abrirFormulario());
  $('#btn-nuevo-vacio').addEventListener('click', () => abrirFormulario());
  $('#cerrar-form').addEventListener('click', () => dialogo.close());
  $('#cancelar-form').addEventListener('click', () => dialogo.close());
  $('#cerrar-carga').addEventListener('click', () => { $('#panel-carga').hidden = true; });

  form.elements.departamento.addEventListener('change', (e) => actualizarLocalidades(e.target.value));
  form.elements.localidad.addEventListener('change', mostrarCampoOtra);
  form.addEventListener('submit', guardarFormulario);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !drawer.hidden && !dialogo.open) cerrarDetalle();
  });

  configurarArrastre();

  cargarDepartamentos().catch((error) => {
    agregarProgreso('Departamentos', `no se pudieron cargar: ${error.message}`, 'error');
  });
  pedir('/api/fichas')
    .then((contactos) => {
      estado.contactos = contactos;
      renderTabla();
    })
    .catch((error) => {
      agregarProgreso('Listado', `no se pudo cargar: ${error.message}`, 'error');
    });
}

iniciar();
