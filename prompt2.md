Quiero rediseñar completamente el explorador de archivos de esta aplicación.

NO quiero un parche. Quiero que modifiques el código existente respetando la arquitectura actual.

## Objetivos

La aplicación debe funcionar correctamente tanto en escritorio como en celulares.

### 1. Eliminar el árbol lateral

Eliminar completamente el sidebar con el árbol de directorios de la pantalla principal.

El árbol seguirá existiendo pero únicamente dentro de un diálogo modal.

No debe quedar ningún espacio reservado para el sidebar.

---

### 2. Breadcrumb

Arriba debe aparecer únicamente la ruta actual.

Ejemplo:

Inicio / Proyectos / Documentos / Fotos

Cada elemento debe ser clickeable para volver directamente a esa carpeta.

---

### 3. Botón "Carpetas"

Agregar un botón 🗂 en la barra superior.

Al presionarlo debe abrir un diálogo modal con el árbol completo de directorios.

Desde ese árbol el usuario puede seleccionar cualquier carpeta.

Al seleccionar una carpeta:

- cerrar el diálogo
- navegar a esa carpeta
- actualizar el breadcrumb
- actualizar la lista de archivos

---

### 4. Eliminar la tabla

Eliminar completamente la tabla HTML.

NO usar:

<table>
<tr>
<td>

Reemplazarla por una lista de elementos.

Cada archivo/carpeta debe renderizarse así:

📄  archivo.txt              12 KB   Hoy              ⋮

o

📁  Fotos                    125 elem.               ⋮

Debe ser una única línea.

No quiero una segunda línea con detalles.

---

### 5. Layout de cada elemento

Cada elemento debe tener esta estructura:

Icono
Nombre
Tamaño
Fecha
Botón ⋮

Usar CSS Grid o Flex para que:

- el nombre ocupe todo el espacio disponible
- tamaño quede alineado
- fecha quede alineada
- botón ⋮ quede completamente a la derecha

---

### 6. Selección

Eliminar completamente los checkboxes.

La selección debe hacerse tocando/clickeando el elemento.

Ctrl+Click debe seguir funcionando en escritorio.

En móviles debe quedar preparado para pulsación larga.

---

### 7. Menú

Eliminar el uso exclusivo del menú contextual.

El botón ⋮ debe abrir exactamente el mismo menú.

El clic derecho debe seguir funcionando.

---

### 8. No romper funcionalidades

Debe seguir funcionando:

- abrir archivos
- editar archivos de texto
- descargar
- borrar
- mover
- copiar
- renombrar
- subir archivos
- drag & drop
- selección múltiple

---

### 9. Idioma

Toda la interfaz debe quedar en español.

Ejemplos:

Inicio
Carpetas
Nueva carpeta
Nuevo documento
Subir
Descargar
Eliminar
Seleccionar carpeta
Esta carpeta está vacía
Listo

---

### 10. IMPORTANTE

NO escribas código suponiendo cómo funciona el proyecto.

Analiza primero:

- explorer.html
- explorer.js
- files.js
- folders.js
- dialogs.js
- api.js
- upload.js

y cualquier otro archivo relacionado.

Después modifica el código existente.

No reemplaces funciones que ya existen.

No cambies nombres públicos de funciones si otros módulos las utilizan.

Mantén compatibilidad con el resto del proyecto.

Cuando necesites cambiar varios archivos, hazlo de manera consistente.

Quiero el resultado final funcionando, no ejemplos.