const path = require('path');
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
const mammoth = require('mammoth');

const MAX_CARACTERES = 60000;

/** Extrae texto plano de un PDF o Word (.docx). */
async function extraerTexto(nombreArchivo, buffer) {
  const extension = path.extname(nombreArchivo).toLowerCase();
  let texto;

  if (extension === '.pdf') {
    const resultado = await pdfParse(buffer);
    texto = resultado.text;
  } else if (extension === '.docx') {
    const resultado = await mammoth.extractRawText({ buffer });
    texto = resultado.value;
  } else {
    throw new Error(`Formato no soportado: ${extension || '(sin extensión)'}. Usá PDF o DOCX.`);
  }

  texto = texto.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return texto.slice(0, MAX_CARACTERES);
}

/**
 * Normaliza un teléfono uruguayo a +598 9X XXX XXX.
 * Acepta "099 89 78 39", "098107986", "+59898107986", "59891431993", etc.
 * Devuelve null si no parece un número válido.
 */
function normalizarTelefono(valor) {
  if (!valor) return null;
  let digitos = String(valor).replace(/\D/g, '');
  if (digitos.startsWith('00598')) digitos = digitos.slice(5);
  else if (digitos.startsWith('598') && digitos.length === 11) digitos = digitos.slice(3);
  else if (digitos.startsWith('0') && digitos.length === 9) digitos = digitos.slice(1);

  if (digitos.length !== 8 || !digitos.startsWith('9')) return null;
  return `+598 ${digitos.slice(0, 2)} ${digitos.slice(2, 5)} ${digitos.slice(5)}`;
}

/**
 * La cédula se guarda solo parcialmente (últimos 3 dígitos) para no
 * conservar el dato completo en la aplicación de pruebas.
 */
function enmascararCedula(valor) {
  if (!valor) return null;
  const digitos = String(valor).replace(/\D/g, '');
  if (digitos.length < 6) return null;
  return `***${digitos.slice(-3)}`;
}

module.exports = { extraerTexto, normalizarTelefono, enmascararCedula, MAX_CARACTERES };
