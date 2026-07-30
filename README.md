# Eture Photo Platform

El archivo fotográfico de Eture Sports. Los fotógrafos suben su selección de
cada entrenamiento y cada partido, y cada imagen se archiva en el perfil de los
jugadores y entrenadores que aparecen en ella.

- **Stack** — Next.js 16 · React 19 · TypeScript · Tailwind v4 · Drizzle · Postgres + pgvector
- **Infraestructura** — Vercel · Neon (Fráncfort) · Cloudflare R2 · Inngest · AWS Rekognition (Irlanda)
- **Sin servidores** que administrar: todo son servicios gestionados

Acceso **sólo por invitación**, con enlace mágico por correo. Tres niveles:
equipo, fotógrafo (sube, no ve galerías) y familia (sólo sus hijos).

---

## Puesta en marcha

```bash
npm install
cp .env.example .env.local     # y rellenar
npx auth secret                # genera AUTH_SECRET
npm run db:migrate             # crea el esquema, incluida la extensión pgvector
npm run dev                    # http://localhost:3000
npm test                       # lógica de decisión y zonas horarias
```

**La primera cuenta hay que crearla a mano**, porque no existe registro:

```sql
insert into app_user (email, name, role)
values ('tu@eturesports.com', 'Tu nombre', 'team');
```

Desde ahí, el resto se crean en Administración.

Para procesar fotos en local hace falta también el runner de Inngest, en otra
terminal:

```bash
npx inngest-cli@latest dev
```

---

## Cómo funciona

```
El fotógrafo sube su selección del entrenamiento del martes (100-200 fotos)
        ↓  el navegador calcula el SHA-256 ANTES de subir nada
        ↓  lo que ya existe no se sube: "42 nuevas, 380 ya estaban"
Cloudflare R2  ← subida directa, nunca a través de Vercel
        ↓
Inngest, una ejecución por foto, con reintentos
        ├─ derivados: web 1600px + miniatura 400px
        ├─ hash perceptual, para agrupar ráfagas
        ├─ sesión, deducida de la hora de captura EXIF
        ├─ caras detectadas y buscadas SÓLO entre el grupo de esa sesión
        ├─ dorsal, sólo si la sesión es un partido con equipación numerada
        └─ decisión: archivar, revisar, o dejar sin identificar
        ↓
Postgres
```

### Las tres decisiones que sostienen el diseño

**La búsqueda se acota al grupo de la sesión.** Con un catálogo de ~120
personas el reconocimiento ya acierta de sobra. El filtro está para el caso que
sí falla: dos personas que se parecen de verdad, hermanos sobre todo. Si uno de
los dos no es de ese grupo, confundirlos se vuelve imposible por construcción,
sin depender de lo fino que hile el modelo.

**El dorsal nunca archiva solo.** Un número mal leído metería a alguien en
fotos que no son suyas, y una sola de esas vista por una familia cuesta más
confianza que cien fotos sin asignar. El dorsal sólo confirma lo que la cara ya
sugiere. Y en entrenamiento no se lee siquiera: petos, camisetas sueltas y
números repetidos dan más ruido que señal, lo que gobierna
`session.numbersVisible`.

**Cada confirmación humana enseña al sistema.** Al confirmar una cara en la
cola de revisión, ese recorte se guarda como referencia. Con entrenamientos
semanales — las mismas 25 personas, el mismo campo, la misma luz — el sistema
converge en pocas sesiones. Sólo se indexan recortes confirmados por una
persona: realimentar los automáticos dejaría que un error se reforzara solo.

---

## Acceso

Sin contraseñas y sin registro. Se pide un enlace por correo, caduca a los 15
minutos y sirve una vez.

**Una dirección que no tenga cuenta no recibe enlace.** Es la diferencia entre
un sistema por invitación y una puerta abierta, y aquí hay fotografías de
menores. Dejado por defecto, un proveedor de enlaces mágicos crea la cuenta a
quien la pida.

| Rol | Ve |
| --- | --- |
| `team` | Todo: subida, revisión, sesiones, personas, administración |
| `photographer` | Sólo la pantalla de subida. Nunca galerías ajenas |
| `family` | Sólo los jugadores vinculados a su cuenta |

Las sesiones se guardan en base de datos, no en un token firmado, para que
**desactivar una cuenta corte el acceso en la petición siguiente** — no cuando
caduque una cookie treinta días después. Al desactivar se destruyen además
todas sus sesiones abiertas.

Se desactiva, no se borra: borrar la fila vaciaría de sentido el registro de
accesos, que es justo lo que responde a "quién ha visto las fotos de mi hijo".

Cada capa comprueba por su cuenta — el proxy, la página y la acción de
servidor. Las acciones de servidor y las rutas de API son puntos de entrada
públicos: que la página que las invoca esté protegida no las protege a ellas.

---

## Protección de datos

Un vector facial es dato biométrico: **categoría especial del artículo 9 del
RGPD**, y buena parte de los jugadores son menores. Esto no es un anexo, está
en el esquema:

- Sin fila viva en `consent` con `scope = 'biometric'`, **la persona no se
  indexa**. Lo comprueba el worker antes de llamar a Rekognition, no una
  política escrita.
- Una casilla de consentimiento vacía en el CSV **nunca** se interpreta como un
  sí.
- Quien no da consentimiento sigue teniendo galería: sus fotos se asignan a
  mano. Eso es lo que hace que decir "no" sea realmente libre.
- Revocar borra sus vectores y sus caras de referencia, no sus fotos — una foto
  tiene más gente dentro.
- `access_log` registra quién vio o descargó qué.

**Los entrenadores son el caso delicado, no los menores.** El tutor de un menor
puede consentir libremente; la AEPD sostiene que un empleado no, por el
desequilibrio de la relación laboral. Por eso `person.role` existe: el régimen
de consentimiento del cuerpo técnico tiene que ser distinto, con alternativa
manual real y sin ninguna consecuencia por negarse. **El archivo no debe usarse
jamás para inferir asistencia o presencia**: en cuanto se le diera ese uso,
cambiaría de categoría jurídica.

Pendiente antes de datos reales: evaluación de impacto (EIPD), registro de
actividades y contrato de encargado con AWS.

---

## Estructura

```
src/
├── db/schema.ts          Modelo de datos completo
├── lib/
│   ├── images.ts         Derivados, dHash, EXIF
│   ├── time.ts           Hora de cámara → instante real (ver abajo)
│   ├── sessions.ts       Foto → sesión, por hora de captura
│   ├── people.ts         Alta e importación CSV
│   ├── recognition.ts    Rekognition: caras y dorsales
│   ├── matching.ts       Umbrales y decisión
│   └── storage.ts        R2
├── inngest/functions/    El pipeline
└── app/                  Interfaz y rutas de API
```

### Una trampa que ya está resuelta

EXIF guarda la hora **sin zona horaria**: "18:04:11" es lo que marcaba el reloj
de la cámara. Los lectores devuelven eso como si fuera UTC, lo que en España son
una o dos horas de desfase. Sin corregirlo, un entrenamiento fotografiado a las
23:30 se archiva al día siguiente y no encuentra ninguna sesión. `lib/time.ts`
lo reinterpreta en `Europe/Madrid`, cambio de hora incluido, y `npm test` lo
cubre.

---

## Costes

A 12.000 fotos al año: **unos 65 $ anuales**. Rekognition ~51 $, R2 ~12 $ el
primer año, Inngest y Neon dentro de sus planes gratuitos, y Vercel y Resend ya
pagados. Sube unos 12 $ por temporada según crece el archivo.

Que se suba la selección editada y no la tarjeta entera es también un argumento
económico: a 4.000 fotos por sesión, el almacenamiento a cinco años pasa de
~190 $ a ~5.000 $, por un archivo peor.

---

## Lo que falta

Por orden de urgencia:

1. **Calibrar los umbrales** de `lib/matching.ts` contra unas 300 fotos
   etiquetadas a mano antes de abrir el archivo a las familias. Los valores
   actuales son un punto de partida razonado, no medido.
2. **Alta con retratos**: la pantalla para fotografiar a cada persona el día de
   la acreditación. Veinte minutos por temporada y es lo que hace que el
   reconocimiento funcione desde el primer día.
3. **Descarga de galería en ZIP** para las familias.
4. **Corrección de lote** cuando la cámara tenía el reloj mal puesto: aplicar un
   desfase a toda una subida en vez de foto a foto.
5. **Gestión de consentimientos** desde la interfaz, incluida la revocación con
   borrado de vectores.

Nota menor: `importPeople` captura los errores por fila, así que una caída de
la base de datos se reporta como muchas filas rechazadas en vez de como un
fallo de infraestructura. Conviene distinguirlo cuando se toque.

---

## Dependencias y seguridad

Dos sustituciones fijadas en `package.json`, ambas sobre código que sí se
despliega:

- **sharp ≥ 0.35.3** — cierra cuatro CVE de libvips. Importa especialmente
  aquí: sharp procesa imágenes subidas por terceros, que es exactamente el
  camino que un atacante controlaría.
- **postcss ≥ 8.5.25** — corrige lectura arbitraria de archivos vía
  `sourceMappingURL`.

Queda **un aviso sin resolver, y conviene saber por qué**: `brace-expansion`
arrastra un aviso de denegación de servicio a través de
`minimatch → glob → rimraf → gaxios → gcp-metadata`, que entra como dependencia
dura de Inngest a través de su instrumentación de OpenTelemetry. No hay
solución limpia: la corrección oficial está en `brace-expansion` 5.0.8, que
rompe `minimatch` v3, y todas las versiones compatibles caen dentro del rango
del aviso. Se deja como está a conciencia — el código afectado es un detector
de metadatos de Google Cloud que nunca se ejecuta en Vercel, y las rutas que
expande vienen de las propias librerías, no de entrada del usuario. Se
resolverá solo cuando Inngest actualice su cadena de OpenTelemetry.

Las 4 vulnerabilidades moderadas restantes están en `drizzle-kit`, herramienta
de desarrollo que no se despliega.
