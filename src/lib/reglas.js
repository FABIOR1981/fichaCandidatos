/**
 * Extractor local por reglas: convierte el texto de un CV en los campos de la ficha.
 * No hace llamadas de red ni usa servicios externos.
 *
 * Soporta dos formatos:
 *  - "plataforma": PDF con encabezados fijos (Resumen, Datos Personales, Experiencia laboral...)
 *  - "libre": Word o texto con secciones en mayúsculas (PERFIL PROFESIONAL, PROFESIONAL, FORMACIÓN...)
 */

const { normalizarTelefono } = require('./telefono');

const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12,
};

const ENCABEZADOS = new Set([
  'RESUMEN', 'DATOS PERSONALES', 'EXPERIENCIA LABORAL', 'ESTUDIOS BÁSICOS', 'ESTUDIOS AVANZADOS',
  'CURSOS / CERTIFICACIONES', 'CONOCIMIENTOS', 'IDIOMAS', 'PREFERENCIAS LABORALES', 'REFERENCIAS',
  'WEB & REDES', 'PERFIL PROFESIONAL', 'PERFIL', 'PROFESIONAL', 'FORMACIÓN', 'FORMACIÓN COMPLEMENTARIA',
  'COMPETENCIAS', 'HERRAMIENTAS INFORMÁTICAS', 'CURSOS',
]);

const NIVELES_FORMACION = [
  { patron: /Doctorado/i, rango: 7 },
  { patron: /Maestr[ií]a|Posgrado/i, rango: 6 },
  { patron: /Licenciatura|Licenciado/i, rango: 5 },
  { patron: /Tecn[oó]logo/i, rango: 4 },
  { patron: /T[eé]cnico/i, rango: 3.5 },
  { patron: /Bachiller/i, rango: 3 },
  { patron: /Secundaria/i, rango: 2 },
  { patron: /Primaria/i, rango: 1 },
];

const SIN_DATOS = /No se han? ingresado/i;

/** Divide el texto en secciones según encabezados conocidos. */
function dividirSecciones(texto) {
  const secciones = {};
  let actual = '__inicio__';
  secciones[actual] = [];

  for (const linea of texto.split('\n')) {
    const limpia = linea.trim();
    if (ENCABEZADOS.has(limpia.toUpperCase())) {
      actual = limpia.toUpperCase();
      secciones[actual] = secciones[actual] || [];
      continue;
    }
    secciones[actual].push(linea);
  }

  const resultado = {};
  for (const [clave, lineas] of Object.entries(secciones)) {
    resultado[clave] = lineas.map((l) => l.trim()).filter(Boolean);
  }
  return resultado;
}

function unirSecciones(secciones, claves) {
  return claves.flatMap((clave) => secciones[clave] || []);
}

/** Convierte "ALL CAPS" a "Title Case". */
const PALABRAS_MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'en', 'a', 'e']);

function aTitulo(texto) {
  return texto
    .toLowerCase()
    .replace(/(^|[\s-])(\S+)/g, (_m, previo, palabra, indice, completo) => {
      const esPrimera = indice === 0;
      if (!esPrimera && PALABRAS_MINUSCULAS.has(palabra)) return previo + palabra;
      return previo + palabra.charAt(0).toUpperCase() + palabra.slice(1);
    });
}

const PATRON_NOMBRE = /^[A-Za-zÁÉÍÓÚÑáéíóúñ]+(?: [A-Za-zÁÉÍÓÚÑáéíóúñ]+){0,4}$/;

function detectarNombre(lineas) {
  const inicio = lineas.slice(0, 15);
  const indice = inicio.findIndex((l) => !ENCABEZADOS.has(l.toUpperCase()) && PATRON_NOMBRE.test(l) && l.split(' ').length >= 2);
  if (indice < 0) return null;

  // El apellido a veces viene en la línea siguiente ("Anderson Federico" / "Rodriguez Muela").
  let nombre = inicio[indice];
  const siguiente = inicio[indice + 1];
  if (siguiente && PATRON_NOMBRE.test(siguiente) && !ENCABEZADOS.has(siguiente.toUpperCase())
      && nombre.split(' ').length + siguiente.split(' ').length <= 5) {
    nombre = `${nombre} ${siguiente}`;
  }
  return nombre === nombre.toUpperCase() ? aTitulo(nombre) : nombre;
}

const PALABRAS_NIVEL = /^(HABLADO|LEÍDO|ESCRITO|Básico|Intermedio|Avanzado|Nativo)$/i;

function esRuidoCompetencia(item) {
  return item.length < 3 || /^[-–•]+$/.test(item) || /\b(de|y|a|en|con)$/i.test(item);
}

/** Interpreta fechas en español: "Junio de 2017", "2018", "Actualmente", "Actualidad". */
const RE_FECHA = /(?:(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+de\s+)?((?:19|20)\d{2})|\b(Actualmente|Actualidad)\b/gi;

function tokensDeFecha(texto) {
  return [...texto.matchAll(RE_FECHA)].map((m) => ({
    mes: m[1] ? MESES[m[1].toLowerCase()] : null,
    anio: m[2] ? Number(m[2]) : null,
    actual: Boolean(m[3]),
  }));
}

/** Pares (inicio, fin) de empleos, tomados en orden de aparición. */
function periodosLaborales(lineas) {
  const tokens = tokensDeFecha(lineas.join('\n'));
  const periodos = [];
  const hoy = new Date();

  for (let i = 0; i + 1 < tokens.length; i += 2) {
    const inicio = tokens[i];
    const fin = tokens[i + 1];
    if (!inicio.anio || inicio.actual) continue;

    const inicioMes = (inicio.anio * 12) + ((inicio.mes || 1) - 1);
    let finMes;
    if (fin.actual) finMes = (hoy.getFullYear() * 12) + hoy.getMonth();
    else if (fin.anio) finMes = (fin.anio * 12) + ((fin.mes || 12) - 1);
    else continue;

    if (finMes < inicioMes) continue;
    periodos.push({ inicio: inicioMes, fin: finMes });
  }
  return periodos;
}

/** Suma los meses cubiertos, sin contar dos veces los períodos superpuestos. */
function aniosSinSuperposicion(periodos) {
  if (!periodos.length) return null;
  const ordenados = [...periodos].sort((a, b) => a.inicio - b.inicio);
  let total = 0;
  let actual = null;
  for (const p of ordenados) {
    if (!actual || p.inicio > actual.fin) {
      if (actual) total += actual.fin - actual.inicio;
      actual = { ...p };
    } else {
      actual.fin = Math.max(actual.fin, p.fin);
    }
  }
  if (actual) total += actual.fin - actual.inicio;
  return Math.round((total / 12) * 10) / 10;
}

function primerPatron(texto, patron) {
  const coincidencia = texto.match(patron);
  return coincidencia ? coincidencia[1].trim() : null;
}

function telefonos(texto) {
  const patron = /(?<!\d)(?:\+?598[\s-]?|0)?9\d(?:[\s.-]?\d){6}(?!\d)/g;
  const vistos = [];
  for (const coincidencia of texto.matchAll(patron)) {
    const normalizado = normalizarTelefono(coincidencia[0]);
    if (normalizado && !vistos.includes(normalizado)) vistos.push(normalizado);
  }
  return vistos;
}

/** Títulos, instituciones y estado a partir de líneas de formación. */
function titulosDesde(lineas) {
  const titulos = [];
  lineas.forEach((linea, indice) => {
    if (!NIVELES_FORMACION.some((n) => n.patron.test(linea))) return;
    const ventana = lineas.slice(indice, indice + 3).join(' ');
    let estado = null;
    if (/INCOMPLETO/i.test(ventana)) estado = 'incompleto';
    else if (/CURSANDO|Actualmente|Actualidad/i.test(ventana)) estado = 'cursando';
    else if (/COMPLETO/i.test(ventana)) estado = 'completo';
    titulos.push({ titulo: linea.slice(0, 120), institucion: null, estado });
  });
  return titulos.slice(0, 6);
}

function formacionMaxima(lineas) {
  let mejor = null;
  for (const linea of lineas) {
    for (const nivel of NIVELES_FORMACION) {
      if (nivel.patron.test(linea) && (!mejor || nivel.rango > mejor.rango)) {
        mejor = { rango: nivel.rango, texto: linea.slice(0, 120) };
      }
    }
  }
  return mejor ? mejor.texto : null;
}

function listaDesde(lineas) {
  return lineas
    .filter((l) => !SIN_DATOS.test(l))
    .flatMap((l) => l.split(/\s*[|•]\s*/))
    .map((item) => item.trim())
    .filter((item) => item && item.length < 80 && !esRuidoCompetencia(item));
}

function idiomasDesde(lineas) {
  return listaDesde(lineas).filter((item) => !PALABRAS_NIVEL.test(item));
}

/** Extrae los campos de la ficha desde el texto del CV. */
function extraerFichaConReglas(texto) {
  const secciones = dividirSecciones(texto);
  const lineas = texto.split('\n').map((l) => l.trim()).filter(Boolean);

  const experiencia = unirSecciones(secciones, ['EXPERIENCIA LABORAL', 'PROFESIONAL']);
  const formacion = unirSecciones(secciones, ['ESTUDIOS BÁSICOS', 'ESTUDIOS AVANZADOS', 'FORMACIÓN']);
  const datosPersonales = unirSecciones(secciones, ['DATOS PERSONALES']);

  const periodos = periodosLaborales(experiencia);
  const anios = aniosSinSuperposicion(periodos);

  // Formato plataforma: el cargo va en mayúsculas (ej. "ENCARGADO DE LOCAL", de dos palabras o más).
  // Formato libre: "Cargo | Empresa | periodo" en una sola línea.
  const cargoMayusculas = experiencia.find((l) => /^[A-ZÁÉÍÓÚÑ\/ \-]{4,}$/.test(l) && l.includes(' ') && !/\d/.test(l));
  const lineaConBarras = experiencia.find((l) => l.includes('|') && /\d{4}/.test(l));
  let cargo = null;
  let empresa = null;
  if (cargoMayusculas) {
    cargo = aTitulo(cargoMayusculas);
  } else if (lineaConBarras) {
    const partes = lineaConBarras.split('|').map((p) => p.trim());
    cargo = partes[0] || null;
    empresa = partes[1] || null;
  }

  const todosTelefonos = telefonos(texto);
  const email = primerPatron(texto, /([A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/);

  const fechaNacimiento = (() => {
    const m = texto.match(/(\d{2})\/(\d{2})\/((?:19|20)\d{2})\s*-\s*(\d{1,3})\s*años/);
    return m ? { iso: `${m[3]}-${m[2]}-${m[1]}`, edad: Number(m[4]) } : { iso: null, edad: null };
  })();

  // "Mercedes, Soriano, Uruguay" o "Mercedes, Soriano  |  099 ..." (el Word no trae "Uruguay")
  const ciudadMatch = texto.match(/([^\n,|]+),\s*([^\n,|]+?)\s*(?:,\s*Uruguay|\s*\||\s*$)/m);
  const personasMatches = [...texto.matchAll(/(\d{1,3})\s+personas a cargo/gi)].map((m) => Number(m[1]));
  const personasACargo = personasMatches.length ? Math.max(...personasMatches) : null;

  const competencias = listaDesde(unirSecciones(secciones, ['CONOCIMIENTOS', 'COMPETENCIAS'])).slice(0, 5);
  const idiomas = idiomasDesde(unirSecciones(secciones, ['IDIOMAS']));
  const cursos = listaDesde(unirSecciones(secciones, ['CURSOS / CERTIFICACIONES', 'CURSOS', 'FORMACIÓN COMPLEMENTARIA']));

  // No se intenta contar referencias: el formato no es uniforme. Solo se marca si hay o no datos.
  const seccionReferencias = unirSecciones(secciones, ['REFERENCIAS']);
  let referenciasCargadas = null;
  if (seccionReferencias.length) {
    referenciasCargadas = !seccionReferencias.some((l) => SIN_DATOS.test(l));
  }

  const redes = unirSecciones(secciones, ['WEB & REDES'])
    .filter((l) => /[a-zA-Z]/.test(l) && !/@/.test(l) && !/^\+?\d/.test(l));

  const destinosLinea = primerPatron(texto, /DESTINOS PREFERIDOS\s+([^\n]+)/i);
  const destinos = destinosLinea ? destinosLinea.split('/').map((d) => d.trim()).filter(Boolean) : [];

  const perfil = unirSecciones(secciones, ['RESUMEN', 'PERFIL PROFESIONAL', 'PERFIL'])
    .filter((l) => !SIN_DATOS.test(l))
    .join(' ')
    .slice(0, 500) || null;

  const titulos = titulosDesde(formacion);
  const formacionMax = formacionMaxima(formacion);
  const formacionLimpia = formacionMax ? formacionMax.split('|')[0].replace(/[.\s]+$/, '').trim() : null;
  const incompleto = formacion.some((l) => /INCOMPLETO/i.test(l));

  const licencia = primerPatron(texto, /Categor[ií]a\s+([A-Z]\d?)\b/);
  const vehiculo = /Veh[ií]culo propio/i.test(texto) ? true : /Sin veh[ií]culo/i.test(texto) ? false : null;
  const nacionalidad = primerPatron(texto, /Nacionalidades?:\s*([^\n]+)/);

  const nombre = detectarNombre(lineas);

  const resumen = [
    cargo || 'Cargo no identificado',
    anios !== null ? `${anios} años de experiencia` : null,
    personasACargo ? `hasta ${personasACargo} personas a cargo` : null,
  ].filter(Boolean).join(' · ');

  const ficha = {
    nombre_completo: nombre,
    cedula: primerPatron(texto, /\b(\d\.\d{3}\.\d{3}-\d)\b/),
    fecha_nacimiento: fechaNacimiento.iso,
    edad: fechaNacimiento.edad,
    ciudad: ciudadMatch ? ciudadMatch[1].trim() : null,
    departamento: ciudadMatch ? ciudadMatch[2].trim() : null,
    nacionalidad,
    telefono_principal: todosTelefonos[0] || null,
    telefono_alternativo: todosTelefonos[1] || null,
    email,
    redes_web: [...new Set(redes)],
    cargo_actual_o_ultimo: cargo,
    empresa_actual_o_ultima: empresa,
    anios_experiencia_total: anios,
    cantidad_empleos: periodos.length || null,
    personas_a_cargo_max: personasACargo,
    competencias_clave: competencias,
    formacion_maxima: formacionLimpia,
    titulos,
    idiomas,
    cursos_certificaciones: cursos,
    licencia_conducir: licencia,
    vehiculo_propio: vehiculo,
    destinos_preferidos: destinos,
    referencias_cargadas: referenciasCargadas,
    perfil_texto: perfil,
    resumen,
  };

  const alertas = [];
  if (!ficha.nombre_completo) alertas.push('nombre no detectado');
  if (!ficha.telefono_principal) alertas.push('sin teléfono válido');
  if (!ficha.email) alertas.push('sin email');
  if (!ficha.perfil_texto) alertas.push('sin resumen');
  if (ficha.referencias_cargadas === false) alertas.push('sin referencias');
  if (!periodos.length) alertas.push('sin experiencia laboral cargada');
  if (incompleto) alertas.push('estudios incompletos');
  if (experiencia.filter((l) => /Actualmente|Actualidad/i.test(l)).length > 1) {
    alertas.push('varios empleos figuran como actuales (revisar)');
  }
  ficha.alertas = alertas;

  return ficha;
}

module.exports = { extraerFichaConReglas, dividirSecciones, aniosSinSuperposicion };
