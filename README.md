# Ficha de candidatos (prueba)

Sube CVs en PDF o Word y genera una ficha con nombre, teléfono, email y otros datos.
Todo el procesamiento ocurre dentro de la aplicación: no se envía ningún dato a servicios externos.
Versión de prueba: los datos se guardan en un archivo JSON a través de `interfaz-persistencia.js`,
para cambiar luego a base de datos.

## Estructura

```
ficha-candidatos/
├── server.js               Servidor Express y rutas /api/fichas
├── interfaz-persistencia.js Contrato de persistencia (listar, obtener, guardar, eliminar)
├── persistencia-json.js    Implementación en archivo JSON (data/fichas.json)
├── lib/
│   ├── extraccion.js       Lee PDF/DOCX, normaliza teléfono, enmascara cédula
│   └── extraccion-reglas.js Extrae los campos de la ficha con reglas locales (sin IA)
├── public/                 Frontend (index.html, app.js, estilos.css)
├── scripts/probar-extraccion.js  Pruebas sin IA
└── data/fichas.json        Se crea solo al primer uso
```

## Puesta en marcha

1. Requiere Node.js 18 o superior.
2. `npm install`
3. (Opcional) Copiar `.env.example` a `.env` para cambiar el puerto.
4. `npm start` y abrir http://localhost:3000 (no abrir `index.html` como archivo)

## Pruebas

- `node scripts/probar-extraccion.js /ruta/a/cvs`: prueba normalización, cédula,
  lectura de PDF/DOCX y persistencia (no llama a la IA).

## Ajustar la extracción

Las reglas están en `lib/extraccion-reglas.js`. Cada campo se extrae con expresiones regulares
o por sección (encabezados como "Experiencia laboral", "Datos Personales", "PROFESIONAL").
Limitaciones conocidas:
- El **cargo actual** es el campo más débil: en PDF de plataforma no siempre toma el puesto correcto.
- La **experiencia** se calcula desde los períodos de fechas y descuenta superposiciones.
- Los **CVs escaneados** (imagen, sin texto) no se pueden leer.

Para probar las reglas sin levantar el servidor: `node scripts/probar-extraccion.js /ruta/a/cvs`.

## Cambiar la base de datos

Crear una clase con `listar`, `obtener`, `guardar` y `eliminar` (ver `interfaz-persistencia.js`)
y pasarla a `validarPersistencia` en `server.js` en lugar de `PersistenciaJson`.

## Privacidad

- Los CVs son datos personales entregados voluntariamente. Usar solo para selección.
- No se usa ninguna IA ni servicio externo: el procesamiento es local.
- La cédula se guarda enmascarada (últimos 3 dígitos).
- El archivo `data/fichas.json` contiene datos personales: no subirlo a git ni compartirlo.
- Revisar la finalidad, el consentimiento y el plazo de conservación según la Ley 18.331.
