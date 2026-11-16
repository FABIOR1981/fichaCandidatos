const { normalizarTelefono } = require('./lib/telefono');
const { extraerFichaConReglas } = require('./lib/reglas');

const LARGO_MINIMO_TEXTO = 40;

class ErrorValidacion extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.status = status;
  }
}

function texto(valor, maximo = 120) {
  if (valor === null || valor === undefined) return null;
  const limpio = String(valor).trim();
  return limpio ? limpio.slice(0, maximo) : null;
}

/** La agenda guarda solo: nombre, teléfono, email, departamento y localidad. */
function normalizarContacto(entrada) {
  return {
    nombre: texto(entrada.nombre),
    telefono: normalizarTelefono(entrada.telefono),
    email: texto(entrada.email)?.toLowerCase() || null,
    departamento: texto(entrada.departamento, 60),
    localidad: texto(entrada.localidad, 60),
  };
}

/** Alertas que se recalculan al guardar, comparando con el resto de la agenda. */
function calcularAlertas(contacto, otros, id) {
  const alertas = [];
  if (!contacto.nombre) alertas.push('nombre no detectado');
  if (!contacto.telefono) alertas.push('sin teléfono');
  if (!contacto.email) alertas.push('sin email');

  for (const otro of otros) {
    if (otro.id === id) continue;
    const mismoEmail = contacto.email && otro.email === contacto.email;
    const mismoTelefono = contacto.telefono && otro.telefono === contacto.telefono;
    if (mismoEmail || mismoTelefono) {
      alertas.push(`posible duplicado de ${otro.nombre || 'otro contacto'}`);
    }
  }
  return alertas;
}

class ServicioFichas {
  constructor(persistencia) {
    this.persistencia = persistencia;
  }

  async listar() {
    return this.persistencia.listar();
  }

  async obtener(id) {
    const ficha = await this.persistencia.obtener(id);
    if (!ficha) throw new ErrorValidacion('Contacto no encontrado', 404);
    return ficha;
  }

  async crearManual(datos) {
    const contacto = normalizarContacto(datos);
    if (!contacto.nombre) throw new ErrorValidacion('El nombre es obligatorio');

    const id = globalThis.crypto.randomUUID();
    const otros = await this.persistencia.listar();
    const ahora = new Date().toISOString();
    return this.persistencia.guardar({
      ...contacto,
      id,
      archivo_origen: null,
      alertas: calcularAlertas(contacto, otros, id),
      creada_en: ahora,
      actualizada_en: ahora,
    });
  }

  async crearDesdeTexto(nombreArchivo, textoCv) {
    if (!textoCv || textoCv.length < LARGO_MINIMO_TEXTO) {
      throw new ErrorValidacion(
        'No se pudo leer texto del archivo (¿es un PDF escaneado como imagen?)',
        422
      );
    }

    const extraida = extraerFichaConReglas(textoCv);
    const contacto = normalizarContacto({
      nombre: extraida.nombre_completo,
      telefono: extraida.telefono_principal,
      email: extraida.email,
      departamento: extraida.departamento,
      localidad: extraida.ciudad,
    });

    const id = globalThis.crypto.randomUUID();
    const otros = await this.persistencia.listar();
    const ahora = new Date().toISOString();
    return this.persistencia.guardar({
      ...contacto,
      id,
      archivo_origen: texto(nombreArchivo, 200),
      alertas: calcularAlertas(contacto, otros, id),
      creada_en: ahora,
      actualizada_en: ahora,
    });
  }

  async actualizar(id, datos) {
    const actual = await this.obtener(id);
    const contacto = normalizarContacto({ ...actual, ...datos });
    if (!contacto.nombre) throw new ErrorValidacion('El nombre es obligatorio');

    const otros = await this.persistencia.listar();
    return this.persistencia.guardar({
      ...contacto,
      id: actual.id,
      archivo_origen: actual.archivo_origen,
      alertas: calcularAlertas(contacto, otros, id),
      creada_en: actual.creada_en,
      actualizada_en: new Date().toISOString(),
    });
  }

  async eliminar(id) {
    const eliminada = await this.persistencia.eliminar(id);
    if (!eliminada) throw new ErrorValidacion('Contacto no encontrado', 404);
  }
}

module.exports = { ServicioFichas, ErrorValidacion, normalizarContacto };
