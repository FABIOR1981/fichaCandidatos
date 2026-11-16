/**
 * Pruebas locales (sin navegador): extracción de PDF/DOCX con las mismas funciones
 * que usa el navegador, reglas de extracción y servicio de fichas.
 *
 * Uso: node scripts/probar.mjs /ruta/a/carpeta/con/cvs
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extraerTextoPdf, extraerTextoDocx } from '../public/extraer-texto.mjs';

const require = createRequire(import.meta.url);
const mammoth = require('mammoth');
const { extraerFichaConReglas } = require('../src/lib/reglas.js');
const { normalizarTelefono, enmascararCedula } = require('../src/lib/telefono.js');
const { ServicioFichas, ErrorValidacion } = require('../src/servicio-fichas.js');
const { PersistenciaMemoria } = require('../src/persistencia-memoria.js');

// 1) Teléfonos y cédula
assert.equal(normalizarTelefono('099 89 78 39'), '+598 99 897 839');
assert.equal(normalizarTelefono('+59898107986'), '+598 98 107 986');
assert.equal(normalizarTelefono('12345'), null);
assert.equal(enmascararCedula('4.368.647-5'), '***475');
assert.equal(enmascararCedula('***475'), '***475');
console.log('ok  teléfono y cédula');

// 2) Servicio: manual, editar, duplicados, eliminar
const servicio = new ServicioFichas(new PersistenciaMemoria());
const a = await servicio.crearManual({ nombre_completo: 'ana perez', telefono_principal: '099 11 22 33', email: 'ANA@mail.com' });
assert.equal(a.nombre_completo, 'ana perez');
assert.equal(a.email, 'ana@mail.com');
const b = await servicio.crearManual({ nombre_completo: 'Beto', email: 'ana@mail.com' });
assert.ok(b.alertas.some((x) => x.startsWith('posible duplicado')));
const editada = await servicio.actualizar(a.id, { ciudad: 'Mercedes' });
assert.equal(editada.ciudad, 'Mercedes');
assert.equal(editada.id, a.id);
await assert.rejects(servicio.crearManual({ email: 'x@x.com' }), ErrorValidacion);
await servicio.eliminar(b.id);
assert.equal((await servicio.listar()).length, 1);
console.log('ok  servicio (manual, editar, duplicados, validación, eliminar)');

// 3) CVs de ejemplo: extracción en Node con las mismas funciones del navegador
const carpeta = process.argv[2];
if (carpeta) {
  const servicioCvs = new ServicioFichas(new PersistenciaMemoria());
  for (const nombre of fs.readdirSync(carpeta).filter((n) => /\.(pdf|docx)$/i.test(n))) {
    const buffer = fs.readFileSync(path.join(carpeta, nombre));
    const texto = nombre.toLowerCase().endsWith('.pdf')
      ? await extraerTextoPdf(pdfjs, new Uint8Array(buffer))
      : await extraerTextoDocx(mammoth, { buffer });
    const f = await servicioCvs.crearDesdeTexto(nombre, texto);
    console.log(
      `ok  ${nombre.slice(0, 28).padEnd(28)} | ${String(f.nombre_completo).padEnd(30)} | ${String(f.telefono_principal).padEnd(16)} | ${String(f.email).padEnd(30)} | ${f.anios_experiencia_total ?? '-'} años | alertas: ${f.alertas.length}`
    );
  }
}
console.log('\nTodas las pruebas pasaron.');
