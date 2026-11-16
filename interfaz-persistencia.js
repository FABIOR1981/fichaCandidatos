/**
 * Contrato de persistencia de la app.
 *
 * Cualquier implementación (JSON hoy, base de datos mañana) debe exponer:
 *
 *   listar()            -> Promise<Ficha[]>            fichas, más recientes primero
 *   obtener(id)         -> Promise<Ficha | null>
 *   guardar(ficha)      -> Promise<Ficha>              crea o actualiza (por ficha.id)
 *   eliminar(id)        -> Promise<boolean>            true si existía
 *
 * El resto de la app solo usa estos cuatro métodos, así que cambiar de
 * archivo JSON a base de datos no toca el servidor ni el frontend.
 */

const METODOS_REQUERIDOS = ['listar', 'obtener', 'guardar', 'eliminar'];

function validarPersistencia(implementacion) {
  for (const metodo of METODOS_REQUERIDOS) {
    if (typeof implementacion[metodo] !== 'function') {
      throw new Error(`La persistencia debe implementar ${metodo}()`);
    }
  }
  return implementacion;
}

module.exports = { METODOS_REQUERIDOS, validarPersistencia };
