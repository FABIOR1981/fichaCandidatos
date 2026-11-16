const { normalizarTelefono, enmascararCedula } = require('./lib/telefono');
const { extraerFichaConReglas } = require('./lib/reglas');

const LARGO_MAXIMO_TEXTO = 300;
const LARGO_MINIMO_TEXTO = 40;

/** Alertas que se calculan al guardar, a partir de los datos actuales. */
const ALERTAS_CALCULADAS = [
  'nombre no detectado',
  'sin teléfono válido',
  'sin email',
  'sin resumen',
  'sin referencias',
];

class ErrorValidacion extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.status = status;
  }
}

function texto(valor, maximo = LARGO_MAXIMO_TEXTO) {
  if (valor === null || valor === undefined) return null;
  const limpio = String(valor).trim();
  return limpio ? limpio.slice(0, maximo) : null;
}

function numero(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function booleano(valor) {
  if (valor === true || valor === 'true' || valor === 'Sí' || valor === 'sí') return true;
  if (valor === false || valor === 'false' || valor === 'No' || valor === 'no') return false;
  return null;
}

/** Acepta arreglos o texto separado por comas. */
function lista(valor, maximo = 10) {
  const items = Array.isArray(valor) ? valor : String(valor || '').split(',');
  return items.map((i) => texto(i, 120)).filter(Boolean).slice(0, maximo);
}

function resumenDe({ cargo_actual_o_ultimo, anios_experiencia_total, personas_a_cargo_max }) {
  return [
    cargo_actual_o_ultimo || 'Cargo no identificado',
    anios_experiencia_total !== null && anios_experiencia_total !== undefined
      ? `${anios_experiencia_total} años de experiencia`
      : null,
    personas_a_cargo_max ? `hasta ${personas_a_cargo_max} personas a cargo` : null,
  ].filter(Boolean).join(' · ');
}

/** Convierte cualquier entrada (manual o extraída) en una ficha con tipos y formatos correctos. */
function normalizarFicha(entrada) {
  const ficha = {
    nombre_completo: texto(entrada.nombre_completo, 120),
    cedula: enmascararCedula(entrada.cedula),
    fecha_nacimiento: texto(entrada.fecha_nacimiento, 10),
    edad: numero(entrada.edad),
    ciudad: texto(entrada.ciudad),
    departamento: texto(entrada.departamento),
    nacionalidad: texto(entrada.nacionalidad),
    telefono_principal: normalizarTelefono(entrada.telefono_principal),
    telefono_alternativo: normalizarTelefono(entrada.telefono_alternativo),
    email: texto(entrada.email)?.toLowerCase() || null,
    redes_web: lista(entrada.redes_web, 5),
    cargo_actual_o_ultimo: texto(entrada.cargo_actual_o_ultimo),
    empresa_actual_o_ultima: texto(entrada.empresa_actual_o_ultima),
    anios_experiencia_total: numero(entrada.anios_experiencia_total),
    cantidad_empleos: numero(entrada.cantidad_empleos),
    personas_a_cargo_max: numero(entrada.personas_a_cargo_max),
    competencias_clave: lista(entrada.competencias_clave, 5),
    formacion_maxima: texto(entrada.formacion_maxima),
    titulos: Array.isArray(entrada.titulos)
      ? entrada.titulos
          .map((t) => (typeof t === 'string' ? { titulo: texto(t), institucion: null, estado: null } : t))
          .filter((t) => t && t.titulo)
          .slice(0, 10)
      : [],
    idiomas: lista(entrada.idiomas),
    cursos_certificaciones: lista(entrada.cursos_certificaciones, 20),
    licencia_conducir: texto(entrada.licencia_conducir, 10),
    vehiculo_propio: booleano(entrada.vehiculo_propio),
    destinos_preferidos: lista(entrada.destinos_preferidos),
    referencias_cargadas: booleano(entrada.referencias_cargadas),
    perfil_texto: texto(entrada.perfil_texto, 1000),
    notas: texto(entrada.notas, 2000),
  };
  ficha.resumen = resumenDe(ficha);
  return ficha;
}

/** Alertas derivadas de los datos + alertas de la extracción + posibles duplicados. */
function calcularAlertas(ficha, otrasFichas, alertasOrigen = []) {
  const alertas = [];
  if (!ficha.nombre_completo) alertas.push('nombre no detectado');
  if (!ficha.telefono_principal) alertas.push('sin teléfono válido');
  if (!ficha.email) alertas.push('sin email');
  if (!ficha.perfil_texto) alertas.push('sin resumen');
  if (ficha.referencias_cargadas === false) alertas.push('sin referencias');

  for (const otra of otrasFichas) {
    if (otra.id === ficha.id) continue;
    const mismoEmail = ficha.email && otra.email === ficha.email;
    const mismoTelefono = ficha.telefono_principal && otra.telefono_principal === ficha.telefono_principal;
    if (mismoEmail || mismoTelefono) {
      alertas.push(`posible duplicado de ${otra.nombre_completo || 'otra ficha'}`);
    }
  }

  const origen = alertasOrigen.filter((a) => !ALERTAS_CALCULADAS.includes(a));
  return [...new Set([...alertas, ...origen])];
}

class ServicioFichas {
  constructor(persistencia) {
    this.persistencia = persistencia;
  }

  async listar() {
    const fichas = await this.persistencia.listar();
    return fichas;
  }

  async obtener(id) {
    const ficha = await this.persistencia.obtener(id);
    if (!ficha) throw new ErrorValidacion('Ficha no encontrada', 404);
    return ficha;
  }

  async crearManual(datos) {
    const base = normalizarFicha(datos);
    if (!base.nombre_completo) throw new ErrorValidacion('El nombre es obligatorio');

    const otras = await this.persistencia.listar();
    const ficha = {
      ...base,
      id: globalThis.crypto.randomUUID(),
      metodo_extraccion: 'manual',
      archivo_origen: null,
      creada_en: new Date().toISOString(),
      actualizada_en: new Date().toISOString(),
    };
    ficha.alertas = calcularAlertas(ficha, otras);
    return this.persistencia.guardar(ficha);
  }

  async crearDesdeTexto(nombreArchivo, textoCv) {
    if (!textoCv || textoCv.length < LARGO_MINIMO_TEXTO) {
      throw new ErrorValidacion(
        'No se pudo leer texto del archivo (¿es un PDF escaneado como imagen?)',
        422
      );
    }

    const extraida = extraerFichaConReglas(textoCv);
    const base = normalizarFicha(extraida);
    const otras = await this.persistencia.listar();
    const ficha = {
      ...base,
      id: globalThis.crypto.randomUUID(),
      metodo_extraccion: 'reglas-locales',
      archivo_origen: texto(nombreArchivo, 200),
      alertas_origen: extraida.alertas,
      creada_en: new Date().toISOString(),
      actualizada_en: new Date().toISOString(),
    };
    ficha.alertas = calcularAlertas(ficha, otras, ficha.alertas_origen);
    return this.persistencia.guardar(ficha);
  }

  async actualizar(id, datos) {
    const actual = await this.obtener(id);
    const base = normalizarFicha({ ...actual, ...datos });
    if (!base.nombre_completo) throw new ErrorValidacion('El nombre es obligatorio');

    const otras = await this.persistencia.listar();
    const ficha = {
      ...actual,
      ...base,
      id: actual.id,
      metodo_extraccion: actual.metodo_extraccion,
      archivo_origen: actual.archivo_origen,
      alertas_origen: actual.alertas_origen || [],
      creada_en: actual.creada_en,
      actualizada_en: new Date().toISOString(),
    };
    ficha.alertas = calcularAlertas(ficha, otras, ficha.alertas_origen);
    return this.persistencia.guardar(ficha);
  }

  async eliminar(id) {
    const eliminada = await this.persistencia.eliminar(id);
    if (!eliminada) throw new ErrorValidacion('Ficha no encontrada', 404);
  }
}

module.exports = { ServicioFichas, ErrorValidacion, normalizarFicha };
