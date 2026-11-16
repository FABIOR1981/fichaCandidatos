/**
 * Implementación de la interfaz de persistencia (ver interfaz-persistencia.js)
 * guardada en memoria del Worker.
 *
 * Solo para pruebas: los datos se pierden al redesplegar o cuando Cloudflare
 * reinicia el Worker, y cada instancia tiene su propia copia. Para uso real,
 * reemplazar por una clase con D1 o KV que cumpla la misma interfaz.
 */
class PersistenciaMemoria {
  constructor() {
    this.fichas = new Map();
  }

  async listar() {
    return [...this.fichas.values()].sort((a, b) =>
      (b.creada_en || '').localeCompare(a.creada_en || '')
    );
  }

  async obtener(id) {
    return this.fichas.get(id) || null;
  }

  async guardar(ficha) {
    this.fichas.set(ficha.id, ficha);
    return ficha;
  }

  async eliminar(id) {
    return this.fichas.delete(id);
  }
}

module.exports = { PersistenciaMemoria };
