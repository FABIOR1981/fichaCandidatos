const fs = require('fs');
const path = require('path');

/**
 * Implementación de la interfaz de persistencia (ver interfaz-persistencia.js)
 * usando un archivo JSON. Pensada para pruebas: un solo proceso, escrituras
 * atómicas (archivo temporal + renombrado).
 */
class PersistenciaJson {
  constructor(rutaArchivo) {
    this.ruta = rutaArchivo;
    fs.mkdirSync(path.dirname(rutaArchivo), { recursive: true });
    if (!fs.existsSync(rutaArchivo)) {
      this._escribir([]);
    }
  }

  async listar() {
    return this._leer().sort((a, b) => (b.creada_en || '').localeCompare(a.creada_en || ''));
  }

  async obtener(id) {
    return this._leer().find((f) => f.id === id) || null;
  }

  async guardar(ficha) {
    const fichas = this._leer();
    const indice = fichas.findIndex((f) => f.id === ficha.id);
    if (indice >= 0) {
      fichas[indice] = ficha;
    } else {
      fichas.push(ficha);
    }
    this._escribir(fichas);
    return ficha;
  }

  async eliminar(id) {
    const fichas = this._leer();
    const nuevas = fichas.filter((f) => f.id !== id);
    if (nuevas.length === fichas.length) return false;
    this._escribir(nuevas);
    return true;
  }

  _leer() {
    const contenido = fs.readFileSync(this.ruta, 'utf8');
    return contenido.trim() ? JSON.parse(contenido) : [];
  }

  _escribir(fichas) {
    const temporal = `${this.ruta}.tmp`;
    fs.writeFileSync(temporal, JSON.stringify(fichas, null, 2), 'utf8');
    fs.renameSync(temporal, this.ruta);
  }
}

module.exports = { PersistenciaJson };
