# Fichas de candidatos

Aplicación web para ver, crear y editar fichas de candidatos. Las fichas se pueden crear
a mano o subiendo uno o varios CVs en PDF o Word. Todo corre en Cloudflare Workers
y no usa IA externa: el texto se extrae en el navegador y las reglas corren en el Worker.

Versión de prueba: los datos se guardan **en memoria**. Se pierden al redesplegar o cuando
Cloudflare reinicia el Worker.

## Estructura

```
ficha-candidatos/
├── wrangler.jsonc             Configuración del Worker (nombre, assets)
├── src/
│   ├── worker.js              Rutas /api/fichas y entrega de la interfaz
│   ├── servicio-fichas.js     Reglas de negocio: validación, duplicados, alertas
│   ├── persistencia-memoria.js Guarda las fichas en memoria (pruebas)
│   ├── interfaz-persistencia.js Contrato: listar, obtener, guardar, eliminar
│   └── lib/
│       ├── reglas.js          Extrae los campos del texto del CV (sin IA)
│       └── telefono.js        Teléfonos uruguayos y cédula enmascarada
├── public/
│   ├── index.html, app.js, estilos.css  Interfaz
│   ├── extraer-texto.mjs      Lee PDF (pdf.js) y Word (mammoth) en el navegador
│   └── vendor/                Copias de pdf.js y mammoth para el navegador
└── scripts/probar.mjs         Pruebas locales
```

## API

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/fichas` | Lista las fichas, más recientes primero |
| POST | `/api/fichas` | Crea una ficha a mano |
| POST | `/api/fichas/desde-texto` | Crea una ficha desde el texto de un CV (`{nombreArchivo, texto}`) |
| GET | `/api/fichas/:id` | Devuelve una ficha |
| PUT | `/api/fichas/:id` | Actualiza los campos enviados |
| DELETE | `/api/fichas/:id` | Elimina una ficha |

## Probar en tu computadora

1. Tener Node.js 18 o superior.
2. `npm install`
3. `npm run probar -- /ruta/a/carpeta/con/cvs` (pruebas de extracción y servicio)
4. `npm run dev` y abrir la URL que muestra (normalmente http://localhost:8787)

## Desplegar en Cloudflare

1. Tener una cuenta de Cloudflare.
2. `npx wrangler login` (abre el navegador para autorizar).
3. `npm run deploy`. Al terminar muestra la URL `https://ficha-candidatos.<tu-subdominio>.workers.dev`.
4. **Proteger el acceso** (importante): en el panel de Cloudflare, Zero Trust → Access →
   Applications, crear una aplicación self-hosted para esa URL y permitir solo tu email.
   Sin esto, cualquiera con la URL puede ver y subir CVs con datos personales.

Para cambiar el nombre de la URL, editar `name` en `wrangler.jsonc` antes de desplegar.

## Cambiar la memoria por una base de datos

La interfaz de persistencia está en `src/interfaz-persistencia.js`. Para guardar en
Cloudflare D1 o KV, crear una clase con `listar`, `obtener`, `guardar` y `eliminar`,
y pasarla a `validarPersistencia` en `src/worker.js` en lugar de `PersistenciaMemoria`.

## Extracción de CVs

Las reglas están en `src/lib/reglas.js`. Limitaciones conocidas:
- El **cargo actual** es el campo más débil en PDF de plataforma: a veces toma un departamento o una empresa.
- La **experiencia** se calcula desde los períodos de fechas y descuenta superposiciones.
- Los **CVs escaneados** (imagen sin texto) no se pueden leer; la app avisa y no inventa datos.
- Si se actualizan pdf.js o mammoth, volver a copiar los archivos de `node_modules` a `public/vendor/`.

## Privacidad

- Los CVs son datos personales entregados voluntariamente. Usarlos solo para selección.
- No se usa ninguna IA ni servicio externo para procesar los datos.
- La cédula se guarda enmascarada (últimos 3 dígitos).
- Revisar la finalidad, el consentimiento y el plazo de conservación según la Ley 18.331.
