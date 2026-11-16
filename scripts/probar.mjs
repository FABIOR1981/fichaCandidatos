/**
 * Pruebas locales (sin navegador): extracción de PDF/DOCX con las mismas funciones
 * que usa el navegador, y el servicio de la agenda.
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
const { normalizarTelefono } = require('../src/lib/telefono.js');
const { ServicioFichas, ErrorValidacion, normalizarContacto } = require('../src/servicio-fichas.js');
const { PersistenciaMemoria } = require('../src/persistencia-memoria.js');

// 1) Teléfonos
assert.equal(normalizarTelefono('099 89 78 39'), '+598 99 897 839');
assert.equal(normalizarTelefono('+59898107986'), '+598 98 107 986');
assert.equal(normalizarTelefono('12345'), null);
console.log('ok  teléfono');

// 1b) Ubicación: nombres oficiales y localidad manda sobre el departamento escrito
const u = (d, l) => normalizarContacto({ departamento: d, localidad: l });
assert.equal(u('soriano', 'dolores').localidad, 'Dolores');
assert.equal(u('Florida', 'cardal').departamento, 'Florida');
assert.equal(u(null, 'Bella Union').departamento, 'Artigas');
assert.equal(u('Soriano', 'Montevideo').departamento, 'Montevideo');
assert.equal(u('Soriano', 'Pueblo Inventado').localidad, 'Pueblo Inventado');
assert.equal(u('Inventado', null).departamento, null);
console.log('ok  departamento y localidad');

// 2) Agenda: alta manual, edición, duplicados, validación y eliminación
const servicio = new ServicioFichas(new PersistenciaMemoria());
const a = await servicio.crearManual({ nombre: 'ana perez', telefono: '099 11 22 33', email: 'ANA@mail.com' });
assert.equal(a.email, 'ana@mail.com');
assert.equal(a.telefono, '+598 99 112 233');
assert.deepEqual(Object.keys(a).filter((k) => !['id', 'alertas', 'creada_en', 'actualizada_en', 'archivo_origen'].includes(k)).sort(),
  ['departamento', 'email', 'localidad', 'nombre', 'telefono']);
const b = await servicio.crearManual({ nombre: 'Beto', email: 'ana@mail.com' });
assert.ok(b.alertas.some((x) => x.startsWith('posible duplicado')));
const editada = await servicio.actualizar(a.id, { localidad: 'Mercedes', departamento: 'Soriano' });
assert.equal(editada.localidad, 'Mercedes');
assert.equal(editada.id, a.id);
await assert.rejects(servicio.crearManual({ email: 'x@x.com' }), ErrorValidacion);
await servicio.eliminar(b.id);
assert.equal((await servicio.listar()).length, 1);
console.log('ok  agenda (alta, edición, duplicados, validación, eliminar)');

// 3) CVs de ejemplo: extracción con las mismas funciones del navegador
const carpeta = process.argv[2];
if (carpeta) {
  const agenda = new ServicioFichas(new PersistenciaMemoria());
  for (const nombre of fs.readdirSync(carpeta).filter((n) => /\.(pdf|docx)$/i.test(n))) {
    const buffer = fs.readFileSync(path.join(carpeta, nombre));
    const texto = nombre.toLowerCase().endsWith('.pdf')
      ? await extraerTextoPdf(pdfjs, new Uint8Array(buffer))
      : await extraerTextoDocx(mammoth, { buffer });
    const c = await agenda.crearDesdeTexto(nombre, texto);
    console.log(
      `ok  ${nombre.slice(0, 22).padEnd(22)} | ${String(c.nombre).padEnd(32)} | ${String(c.telefono).padEnd(16)} | ${String(c.email).padEnd(30)} | ${String(c.departamento).padEnd(8)} | ${String(c.localidad).padEnd(12)} | alertas: ${c.alertas.length}`
    );
  }
}
console.log('\nTodas las pruebas pasaron.');
