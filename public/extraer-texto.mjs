/**
 * Extracción de texto en el navegador (y en Node para pruebas).
 * PDF: pdf.js. Word: mammoth. Ninguno de los archivos sale del navegador.
 */

/**
 * Arma líneas en el mismo orden en que el PDF dibuja el texto (igual que pdf-parse):
 * se corta línea cuando cambia la posición vertical o cuando pdf.js indica fin de línea.
 * No se reordena por coordenadas, porque eso mezcla las columnas del CV.
 */
export function reconstruirLineas(items) {
  const lineas = [];
  let actual = '';
  let yActual = null;

  for (const item of items) {
    const y = item.transform ? item.transform[5] : null;
    const cambioDeLinea = yActual !== null && y !== null && Math.abs(y - yActual) > 2;
    if (cambioDeLinea && actual.trim()) {
      lineas.push(actual.trim());
      actual = '';
    }
    if (item.str) actual += item.str;
    if (item.hasEOL && actual.trim()) {
      lineas.push(actual.trim());
      actual = '';
    } else if (item.str) {
      actual += ' ';
    }
    if (y !== null) yActual = y;
  }
  if (actual.trim()) lineas.push(actual.trim());

  return lineas.map((l) => l.replace(/[ \t]+/g, ' ')).filter(Boolean).join('\n');
}

/** pdfjsLib: el módulo de pdf.js (pdf.min.mjs en el navegador, legacy/build/pdf.mjs en Node). */
export async function extraerTextoPdf(pdfjsLib, datosPdf) {
  const documento = await pdfjsLib.getDocument({ data: datosPdf }).promise;
  const paginas = [];
  for (let numero = 1; numero <= documento.numPages; numero++) {
    const pagina = await documento.getPage(numero);
    const contenido = await pagina.getTextContent();
    paginas.push(reconstruirLineas(contenido.items));
  }
  return paginas.join('\n').trim();
}

/** mammothLib: el módulo de mammoth. datos: { arrayBuffer } en el navegador, { buffer } en Node. */
export async function extraerTextoDocx(mammothLib, datos) {
  const resultado = await mammothLib.extractRawText(datos);
  return resultado.value.trim();
}
