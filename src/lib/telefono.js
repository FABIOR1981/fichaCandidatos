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
 * La cédula se guarda solo parcialmente (últimos 3 dígitos).
 * Si ya viene enmascarada ("***475") se conserva tal cual.
 */
function enmascararCedula(valor) {
  if (!valor) return null;
  const texto = String(valor).trim();
  if (/^\*{3}\d{3}$/.test(texto)) return texto;
  const digitos = texto.replace(/\D/g, '');
  if (digitos.length < 6) return null;
  return `***${digitos.slice(-3)}`;
}

module.exports = { normalizarTelefono, enmascararCedula };
