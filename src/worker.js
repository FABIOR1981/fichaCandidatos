import { ServicioFichas, ErrorValidacion } from './servicio-fichas.js';
import { PersistenciaMemoria } from './persistencia-memoria.js';
import { validarPersistencia } from './interfaz-persistencia.js';

// Una instancia por proceso del Worker. Ver persistencia-memoria.js para el alcance de los datos.
const servicio = new ServicioFichas(validarPersistencia(new PersistenciaMemoria()));

const CABECERAS_JSON = { 'content-type': 'application/json; charset=utf-8' };

function respuestaJson(datos, estado = 200) {
  return new Response(JSON.stringify(datos), { status: estado, headers: CABECERAS_JSON });
}

async function leerJson(request) {
  try {
    return await request.json();
  } catch {
    throw new ErrorValidacion('El cuerpo debe ser JSON válido');
  }
}

async function manejarApi(request, url) {
  const partes = url.pathname.split('/').filter(Boolean); // ['api', 'fichas', id?, accion?]
  if (partes[0] !== 'api' || partes[1] !== 'fichas') {
    throw new ErrorValidacion('Ruta no encontrada', 404);
  }

  // /api/fichas
  if (partes.length === 2) {
    if (request.method === 'GET') return respuestaJson(await servicio.listar());
    if (request.method === 'POST') {
      const ficha = await servicio.crearManual(await leerJson(request));
      return respuestaJson(ficha, 201);
    }
  }

  // /api/fichas/desde-texto  (el navegador extrae el texto del PDF/Word y lo envía)
  if (partes.length === 3 && partes[2] === 'desde-texto' && request.method === 'POST') {
    const { nombreArchivo, texto } = await leerJson(request);
    const ficha = await servicio.crearDesdeTexto(nombreArchivo, texto);
    return respuestaJson(ficha, 201);
  }

  // /api/fichas/:id
  if (partes.length === 3) {
    const id = partes[2];
    if (request.method === 'GET') return respuestaJson(await servicio.obtener(id));
    if (request.method === 'PUT') {
      const ficha = await servicio.actualizar(id, await leerJson(request));
      return respuestaJson(ficha);
    }
    if (request.method === 'DELETE') {
      await servicio.eliminar(id);
      return new Response(null, { status: 204 });
    }
  }

  throw new ErrorValidacion('Método no permitido', 405);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    try {
      return await manejarApi(request, url);
    } catch (error) {
      const estado = error.status || 500;
      if (estado === 500) console.error(error);
      return respuestaJson({ error: estado === 500 ? 'Error interno' : error.message }, estado);
    }
  },
};
