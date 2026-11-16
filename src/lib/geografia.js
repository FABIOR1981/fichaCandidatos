const DATOS = require('./geografia.json');

const DEPARTAMENTOS = DATOS.departamentos;

/** Quita acentos y mayúsculas para comparar nombres ("Bella Unión" == "bella union"). */
function clave(valor) {
  return String(valor)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Devuelve el departamento con su nombre oficial, o null si no existe. */
function buscarDepartamento(valor) {
  if (!valor) return null;
  const buscado = clave(valor);
  return DEPARTAMENTOS.find((d) => clave(d.nombre) === buscado) || null;
}

/**
 * Busca una localidad en todo el país. Si se conoce el departamento, lo prefiere.
 * Devuelve { localidad, departamento } con los nombres oficiales, o null.
 */
function ubicarLocalidad(valor, departamentoPreferido) {
  if (!valor) return null;
  const buscado = clave(valor);
  const enDepartamento = (d) => d.localidades.find((l) => clave(l) === buscado);

  const preferido = buscarDepartamento(departamentoPreferido);
  if (preferido) {
    const localidad = enDepartamento(preferido);
    if (localidad) return { localidad, departamento: preferido.nombre };
  }
  for (const d of DEPARTAMENTOS) {
    const localidad = enDepartamento(d);
    if (localidad) return { localidad, departamento: d.nombre };
  }
  return null;
}

module.exports = { DATOS, buscarDepartamento, ubicarLocalidad, clave };
