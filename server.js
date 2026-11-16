require('dotenv').config();

const express = require('express');
const crypto = require('crypto');
const path = require('path');

const { extraerTexto, enmascararCedula } = require('./lib/extraccion');
const { extraerFichaConReglas } = require('./lib/extraccion-reglas');
const { PersistenciaJson } = require('./persistencia-json');
const { validarPersistencia } = require('./interfaz-persistencia');

const PUERTO = process.env.PORT || 3000;
const persistencia = validarPersistencia(
  new PersistenciaJson(process.env.RUTA_DATOS || path.join(__dirname, 'data', 'fichas.json'))
);

const app = express();

// Permite abrir public/index.html como archivo (origen "null") o desde otro puerto local.
// Es una app de uso local; no exponer el servidor a internet sin autenticación.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/** Arma la ficha final: datos extraídos localmente, cédula enmascarada y metadatos. */
function construirFicha(datosExtraidos, nombreArchivo) {
  return {
    ...datosExtraidos,
    id: crypto.randomUUID(),
    cedula: enmascararCedula(datosExtraidos.cedula),
    archivo_origen: nombreArchivo,
    metodo_extraccion: 'reglas-locales',
    creada_en: new Date().toISOString(),
  };
}

/** Recibe un CV (PDF o DOCX en base64), extrae el texto y genera la ficha. */
app.post('/api/fichas', async (req, res) => {
  try {
    const { nombreArchivo, contenidoBase64 } = req.body || {};
    if (!nombreArchivo || !contenidoBase64) {
      return res.status(400).json({ error: 'Faltan nombreArchivo o contenidoBase64' });
    }

    const buffer = Buffer.from(contenidoBase64, 'base64');
    const texto = await extraerTexto(nombreArchivo, buffer);
    if (texto.length < 40) {
      return res.status(422).json({
        error: 'No se pudo leer texto del archivo (¿es un PDF escaneado como imagen?)',
      });
    }

    const datosExtraidos = extraerFichaConReglas(texto);
    const ficha = await persistencia.guardar(construirFicha(datosExtraidos, nombreArchivo));
    res.status(201).json(ficha);
  } catch (error) {
    console.error('Error al procesar', req.body?.nombreArchivo, error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/fichas', async (_req, res) => {
  res.json(await persistencia.listar());
});

app.get('/api/fichas/:id', async (req, res) => {
  const ficha = await persistencia.obtener(req.params.id);
  if (!ficha) return res.status(404).json({ error: 'No encontrada' });
  res.json(ficha);
});

app.delete('/api/fichas/:id', async (req, res) => {
  const eliminada = await persistencia.eliminar(req.params.id);
  if (!eliminada) return res.status(404).json({ error: 'No encontrada' });
  res.status(204).end();
});

app.listen(PUERTO, () => {
  console.log(`Ficha de candidatos en http://localhost:${PUERTO}`);
});
