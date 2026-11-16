const estado = { fichas: [], filtro: '' };

// Si la página se abre como archivo (file://), la API está en el servidor local.
const BASE_API = location.protocol === 'file:' ? 'http://localhost:3000' : '';

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

function lista(valores) {
  return Array.isArray(valores) && valores.length
    ? valores.map(escapar).join(', ')
    : '—';
}

function leerComoBase64(archivo) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(lector.result.split(',')[1]);
    lector.onerror = () => rechazar(lector.error);
    lector.readAsDataURL(archivo);
  });
}

function agregarProgreso(nombre, estadoTexto, clase) {
  const item = document.createElement('li');
  item.className = clase;
  item.textContent = `${nombre}: ${estadoTexto}`;
  $('#progreso').prepend(item);
  return item;
}

async function procesarArchivo(archivo) {
  const item = agregarProgreso(archivo.name, 'procesando…', 'en-curso');
  try {
    const contenidoBase64 = await leerComoBase64(archivo);
    const respuesta = await fetch(`${BASE_API}/api/fichas`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nombreArchivo: archivo.name, contenidoBase64 }),
    });
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.error || 'Error desconocido');

    item.className = 'ok';
    item.textContent = `${archivo.name}: ficha creada`;
    estado.fichas.unshift(datos);
    renderTabla();
  } catch (error) {
    item.className = 'error';
    item.textContent = `${archivo.name}: ${error.message}`;
  }
}

async function cargarFichas() {
  const respuesta = await fetch(`${BASE_API}/api/fichas`);
  estado.fichas = await respuesta.json();
  renderTabla();
}

function fichasFiltradas() {
  const filtro = estado.filtro.trim().toLowerCase();
  if (!filtro) return estado.fichas;
  return estado.fichas.filter((f) =>
    [f.nombre_completo, f.cargo_actual_o_ultimo, f.ciudad, f.departamento, f.email]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(filtro)
  );
}

function renderTabla() {
  const fichas = fichasFiltradas();
  $('#contador').textContent = `${fichas.length} de ${estado.fichas.length}`;
  $('#tabla-fichas').innerHTML = fichas
    .map((f) => `
      <tr data-id="${escapar(f.id)}">
        <td>${texto(f.nombre_completo)}</td>
        <td>${texto(f.cargo_actual_o_ultimo)}</td>
        <td>${texto(f.telefono_principal)}</td>
        <td>${texto(f.email)}</td>
        <td>${texto(f.anios_experiencia_total !== null && f.anios_experiencia_total !== undefined ? `${f.anios_experiencia_total} años` : null)}</td>
        <td>${f.alertas?.length ? `<span class="alerta">${f.alertas.length}</span>` : ''}</td>
      </tr>`)
    .join('');
}

function seccion(titulo, filas) {
  const contenido = filas
    .map(([etiqueta, valor]) => `<dt>${escapar(etiqueta)}</dt><dd>${valor}</dd>`)
    .join('');
  return `<div class="seccion"><h3>${escapar(titulo)}</h3><dl>${contenido}</dl></div>`;
}

function renderDetalle(f) {
  const titulos = (f.titulos || [])
    .map((t) => `${escapar(t.titulo)}${t.institucion ? ' · ' + escapar(t.institucion) : ''}${t.estado ? ' (' + escapar(t.estado) + ')' : ''}`)
    .join('<br>') || '—';

  $('#detalle').innerHTML = `
    <div class="cabecera-detalle">
      <h2>${texto(f.nombre_completo, 'Sin nombre')}</h2>
      <div class="acciones">
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
    ${seccion('Formación', [
      ['Formación máxima', texto(f.formacion_maxima)],
      ['Títulos', titulos],
      ['Cursos y certificaciones', lista(f.cursos_certificaciones)],
      ['Idiomas', lista(f.idiomas)],
    ])}
    ${seccion('Otros datos', [
      ['Licencia de conducir', texto(f.licencia_conducir)],
      ['Vehículo propio', texto(f.vehiculo_propio === null ? null : f.vehiculo_propio ? 'Sí' : 'No')],
      ['Destinos preferidos', lista(f.destinos_preferidos)],
      ['Referencias cargadas', texto(f.referencias_cargadas === null || f.referencias_cargadas === undefined ? null : f.referencias_cargadas ? 'Sí' : 'No')],
    ])}
    ${f.perfil_texto ? `<div class="seccion"><h3>Perfil (texto original)</h3><p>${escapar(f.perfil_texto)}</p></div>` : ''}
    <p class="pie-detalle">Archivo: ${texto(f.archivo_origen)} · Método: ${texto(f.metodo_extraccion)} · Procesado: ${texto(f.creada_en)}</p>
  `;

  $('#detalle').hidden = false;
  $('#detalle').scrollIntoView({ behavior: 'smooth' });

  $('#btn-cerrar').onclick = () => { $('#detalle').hidden = true; };
  $('#btn-json').onclick = () => descargarJson(f);
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
  await fetch(`${BASE_API}/api/fichas/${f.id}`, { method: 'DELETE' });
  estado.fichas = estado.fichas.filter((x) => x.id !== f.id);
  $('#detalle').hidden = true;
  renderTabla();
}

function iniciar() {
  const zona = $('#zona-carga');
  const entrada = $('#entrada-archivos');

  entrada.addEventListener('change', async () => {
    const archivos = [...entrada.files];
    entrada.value = '';
    for (const archivo of archivos) {
      await procesarArchivo(archivo);
    }
  });

  zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('activa'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('activa'));
  zona.addEventListener('drop', async (e) => {
    e.preventDefault();
    zona.classList.remove('activa');
    for (const archivo of [...e.dataTransfer.files]) {
      await procesarArchivo(archivo);
    }
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

  cargarFichas();
}

iniciar();
