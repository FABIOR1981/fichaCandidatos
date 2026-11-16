/**
 * Prueba sin IA: lee CVs de una carpeta, extrae el texto y valida
 * normalización de teléfonos, enmascarado de cédula y persistencia en JSON.
 *
 * Uso: node scripts/probar-extraccion.js /ruta/a/carpeta/con/cvs
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const { extraerTexto, normalizarTelefono, enmascararCedula } = require('../lib/extraccion');
const { PersistenciaJson } = require('../persistencia-json');
const { validarPersistencia } = require('../interfaz-persistencia');

async function main() {
  // 1) Normalización de teléfonos
  assert.strictEqual(normalizarTelefono('099 89 78 39'), '+598 99 897 839');
  assert.strictEqual(normalizarTelefono('098107986'), '+598 98 107 986');
  assert.strictEqual(normalizarTelefono('+59898107986'), '+598 98 107 986');
  assert.strictEqual(normalizarTelefono('59891431993'), '+598 91 431 993');
  assert.strictEqual(normalizarTelefono('12345'), null);
  assert.strictEqual(normalizarTelefono(null), null);
  console.log('ok  normalizarTelefono');

  // 2) Cédula enmascarada
  assert.strictEqual(enmascararCedula('4.368.647-5'), '***475');
  assert.strictEqual(enmascararCedula('1.2'), null);
  console.log('ok  enmascararCedula');

  // 3) Extracción de texto de la carpeta indicada
  const carpeta = process.argv[2];
  if (carpeta) {
    const archivos = fs.readdirSync(carpeta).filter((n) => /\.(pdf|docx)$/i.test(n));
    for (const nombre of archivos) {
      const buffer = fs.readFileSync(path.join(carpeta, nombre));
      const texto = await extraerTexto(nombre, buffer);
      const estado = texto.length >= 40 ? 'ok ' : 'ERR';
      console.log(`${estado} ${nombre} -> ${texto.length} caracteres`);
    }
  }

  // 4) Persistencia JSON cumple la interfaz y hace CRUD
  const archivoTemporal = path.join(os.tmpdir(), `prueba-fichas-${Date.now()}.json`);
  const persistencia = validarPersistencia(new PersistenciaJson(archivoTemporal));
  await persistencia.guardar({ id: 'a', nombre_completo: 'Prueba A', creada_en: '2026-01-01T00:00:00Z' });
  await persistencia.guardar({ id: 'b', nombre_completo: 'Prueba B', creada_en: '2026-02-01T00:00:00Z' });
  const listado = await persistencia.listar();
  assert.deepStrictEqual(listado.map((f) => f.id), ['b', 'a']);
  assert.strictEqual((await persistencia.obtener('a')).nombre_completo, 'Prueba A');
  assert.strictEqual(await persistencia.eliminar('a'), true);
  assert.strictEqual(await persistencia.eliminar('a'), false);
  fs.unlinkSync(archivoTemporal);
  console.log('ok  persistencia JSON (guardar, listar, obtener, eliminar)');

  console.log('\nTodas las pruebas pasaron.');
}

main().catch((error) => {
  console.error('FALLÓ:', error.message);
  process.exit(1);
});
