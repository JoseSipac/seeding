# Especificación de API – Apple Music Analytics (PoC con MongoDB)

Este documento define el contrato de la API analítica propuesta para el panel administrativo de Apple Music dentro de esta Prueba de Concepto.  
La API expone cinco endpoints de solo lectura que corresponden directamente a las cinco consultas de negocio implementadas mediante Aggregation Pipelines sobre MongoDB.

- Formato de intercambio: **JSON**
- Verbo HTTP: **GET** en todos los endpoints
- Ámbito: consultas analíticas (no se realizan operaciones de escritura)

La lógica de cada endpoint está respaldada por las agregaciones definidas en `database/queries.js` contra la base de datos `apple_music_db`.

---

## 1. Reporte de Regalías por Artista

### Descripción funcional

Este endpoint responde a la pregunta de negocio:

> ¿Cuánto tiempo total (en segundos) se ha reproducido cada artista en el último mes?

La información se obtiene a partir de la colección `streams`, agrupando las reproducciones por artista y sumando el campo `seconds_played`.  
Posteriormente, se realiza un cruce con la colección `artists` para enriquecer los resultados con el nombre y género del artista.

### Definición del endpoint

- **Método:** `GET`
- **Ruta:** `/api/analytics/royalties`
- **Parámetros de entrada (query):**
  - `days` (opcional, numérico): cantidad de días hacia atrás a considerar.  
    En la PoC, la lógica implementada en `queries.js` utiliza un valor fijo de 30 días como ventana de análisis.

### Estructura de respuesta

La respuesta es un arreglo JSON de objetos, donde cada elemento representa un artista:

- `artist_id` (string): identificador único del artista.
- `artist_name` (string): nombre del artista.
- `genre` (string): género principal del artista.
- `total_seconds` (number): suma total de segundos reproducidos para ese artista en el período definido.

---

## 2. Top 10 Regional de Canciones (Guatemala, últimos 7 días)

### Descripción funcional

Este endpoint responde a la pregunta de negocio:

> ¿Cuáles son las 10 canciones más escuchadas en Guatemala en los últimos 7 días?

La consulta parte de la colección `streams`, se une con `users` para filtrar únicamente usuarios cuyo `country` sea `GT`, y se restringe a reproducciones realizadas en los últimos siete días.  
Luego se hace `lookup` con `songs` para obtener los datos de la canción y se agrupa por canción para contar el número total de reproducciones.

### Definición del endpoint

- **Método:** `GET`
- **Ruta:** `/api/charts/top-songs`
- **Parámetros de entrada (query):**
  - En la implementación actual de la PoC, el endpoint está diseñado específicamente para:
    - País: Guatemala (`country = "GT"`)
    - Ventana temporal: últimos 7 días
  - Conceptualmente, la ruta representa:  
    `Top 10 canciones por número de reproducciones en GT en los últimos 7 días`.

### Estructura de respuesta

La respuesta es un arreglo JSON de objetos, donde cada elemento representa una canción del ranking:

- `song_id` (string): identificador único de la canción.
- `title` (string): título de la canción.
- `artist_name` (string): nombre del artista principal de la canción.
- `genre` (string): género de la canción.
- `play_count` (number): número total de reproducciones de la canción en Guatemala en los últimos 7 días.

La lista se devuelve ordenada en forma descendente por `play_count` y limitada a los 10 primeros registros.

---

## 3. Usuarios “Zombis” con Suscripción Premium

### Descripción funcional

Este endpoint responde a la pregunta de negocio:

> ¿Qué usuarios tienen una suscripción Premium activa, pero no han reproducido ninguna canción en los últimos 30 días?

La lógica implementada parte de la colección `users`, filtrando aquellos cuyo campo `subscription` es `"Premium"`.  
Mediante un `lookup` se buscan streams recientes del usuario en la colección `streams` dentro de los últimos 30 días.  
Se consideran “usuarios zombis” aquellos cuyo arreglo de `recent_streams` está vacío.

### Definición del endpoint

- **Método:** `GET`
- **Ruta:** `/api/users/zombies`
- **Parámetros de entrada (query):**
  - En la PoC, los valores están fijados en la agregación:
    - Tipo de suscripción analizada: `Premium`
    - Ventana de inactividad: últimos 30 días

### Estructura de respuesta

La respuesta es un arreglo JSON de objetos, donde cada elemento representa un usuario con riesgo de churn:

- `user_id` (string): identificador único del usuario.
- `username` (string): nombre de usuario.
- `email` (string): correo electrónico del usuario.
- `country` (string): país del usuario (código ISO-2).
- `subscription` (string): tipo de suscripción (en la PoC, “Premium”).
- `created_at` (date/string): fecha de creación del usuario en la plataforma.

La ausencia de streams recientes (últimos 30 días) es la condición clave para que un usuario aparezca en esta respuesta.

---

## 4. Distribución de Edades – Usuarios que Escuchan Reggaeton

### Descripción funcional

Este endpoint responde a la pregunta de negocio:

> De todos los usuarios que escuchan Reggaeton, ¿cuál es la distribución por edades?

La agregación se construye a partir de la colección `streams`, realizando un `lookup` con `songs` para filtrar únicamente reproducciones de canciones con `genre = "Reggaeton"`.  
Posteriormente se agrupa por `user_id` para obtener usuarios únicos que han consumido este género.  
Con un nuevo `lookup` contra `users` se obtienen las fechas de nacimiento (`birth_date`) y se calcula la edad del usuario.  
Luego se asigna cada usuario a un rango de edad (por ejemplo, `15-20`, `21-30`, `31-40`, `41-50`, `other`) y se cuentan las cantidades y porcentajes.

### Definición del endpoint

- **Método:** `GET`
- **Ruta:** `/api/analytics/reggaeton-age-distribution`
- **Parámetros de entrada:**
  - En la PoC, el endpoint no recibe parámetros.  
    La consulta siempre considera:
    - Género musical: `Reggaeton`
    - Universo: usuarios que han reproducido al menos una canción de este género.

### Estructura de respuesta

La respuesta es un objeto JSON con dos partes principales:

- `total_users` (number): número total de usuarios que escuchan Reggaeton.
- `buckets` (array de objetos): cada elemento representa un rango de edad.
  - `age_range` (string): etiqueta del rango de edad (ej. `"21-30"`).
  - `count` (number): número de usuarios dentro de ese rango.
  - `percentage` (number): porcentaje que representa ese rango con respecto a `total_users`, redondeado a dos decimales.

---

## 5. Heavy Users del Artista “Bad Bunny”

### Descripción funcional

Este endpoint responde a la pregunta de negocio:

> ¿Cuáles son los 5 usuarios que más canciones distintas han escuchado del artista “Bad Bunny”?

La agregación parte de la colección `streams`, se une con `songs` para filtrar aquellas reproducciones donde `song.artist_name = "Bad Bunny"`.  
Para evitar contar múltiples reproducciones de la misma canción por el mismo usuario, se agrupa primero por la combinación `(user_id, song_id)` y luego se vuelve a agrupar por `user_id` para contabilizar el número de canciones distintas escuchadas.  
Finalmente, se ordenan los usuarios en orden descendente por este conteo y se toma el Top 5.

### Definición del endpoint

- **Método:** `GET`
- **Ruta:** `/api/analytics/bad-bunny-heavy-users`
- **Parámetros de entrada (query):**
  - En la PoC:
    - El artista está fijado en la lógica de agregación como `"Bad Bunny"`.
    - El límite de resultados se establece en 5 usuarios.

### Estructura de respuesta

La respuesta es un arreglo JSON de objetos, donde cada elemento representa un usuario “heavy user” de Bad Bunny:

- `user_id` (string): identificador único del usuario.
- `username` (string): nombre de usuario.
- `email` (string): correo electrónico registrado.
- `country` (string): país del usuario (código ISO-2).
- `distinctSongs` / `distinct_songs_listened` (number): número de canciones distintas de Bad Bunny que el usuario ha reproducido.

---

## Consideraciones generales

- Todos los endpoints descritos son de solo lectura y se implementan sobre la misma base de datos lógica: `apple_music_db`.
- Las colecciones principales involucradas son:
  - `users`
  - `artists`
  - `songs`
  - `streams`
- Las consultas están implementadas en el archivo `database/queries.js`, utilizando Aggregation Pipelines de MongoDB coherentes con las definiciones anteriores.
- Este contrato de API se utiliza como referencia para el diseño del dashboard administrativo (prototipo en v0) y para el video de presentación de la PoC.
