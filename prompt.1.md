# Aplicación Node.js + Express para almacenamiento cifrado por usuario

## Objetivo

Quiero diseñar e implementar una aplicación web basada en **Node.js**, **Express** y **TypeScript** que permita a cada usuario almacenar y gestionar archivos de forma cifrada en un repositorio remoto propio.

La aplicación debe estar diseñada desde el inicio para soportar múltiples proveedores de almacenamiento (Filesystem, Google Drive, Dropbox, S3, WebDAV, etc.) mediante una arquitectura basada en interfaces, de forma que el resto del sistema no deba modificarse al cambiar el backend de almacenamiento.

---

# Contexto del proyecto

Ya dispongo de un proyecto desarrollado en **TypeScript**.

Quiero que toda la implementación **utilice como referencia la estructura actual del proyecto**.

No quiero que se genere un proyecto completamente nuevo.

Antes de comenzar a escribir código, analizar la estructura actual del proyecto y proponer cómo integrar esta nueva funcionalidad reutilizando al máximo:

- estructura de carpetas
- organización del código
- convenciones de nombres
- middlewares existentes
- configuración de TypeScript
- configuración de Express
- utilidades existentes
- patrones arquitectónicos
- estilo de código

Si alguna modificación importante fuera necesaria, justificar claramente el motivo.

---

# Arquitectura

La solución debe seguir principios SOLID y una arquitectura modular.

Separar claramente:

- Controllers
- Services
- Storage Providers
- Crypto
- Authentication
- Models
- DTOs
- Middlewares
- Routes
- Configuration

Toda dependencia del almacenamiento debe abstraerse mediante una interfaz.

---

# Backend de almacenamiento

Definir una interfaz denominada `StorageProvider`.

Ejemplo:

```ts
interface StorageProvider {
    createFolder(path: string): Promise<void>;
    deleteFolder(path: string): Promise<void>;
    list(path: string): Promise<FileEntry[]>;
    upload(path: string, stream: Readable): Promise<void>;
    download(path: string): Promise<Readable>;
    delete(path: string): Promise<void>;
    move(from: string, to: string): Promise<void>;
    rename(path: string, newName: string): Promise<void>;
    exists(path: string): Promise<boolean>;
}
```

Implementar inicialmente:

- FilesystemStorageProvider

Preparar la arquitectura para implementar posteriormente:

- GoogleDriveStorageProvider
- DropboxStorageProvider
- S3StorageProvider
- WebDAVStorageProvider

La lógica de negocio nunca debe depender del proveedor concreto.

---

# Primera implementación

La primera implementación debe almacenar la información en el filesystem utilizando una estructura como la siguiente:

```text
storage/
    users/
        {userId}/
            vault.config.json
            Documents/
            Photos/
            Videos/
```

Todos los archivos deberán almacenarse cifrados.

---

# Google OAuth

Cada usuario debe autenticarse mediante Google OAuth 2.0.

Durante el proceso deberá autorizar permisos de lectura y escritura sobre Google Drive.

Posteriormente deberá poder seleccionar una carpeta de su Drive que será utilizada como repositorio.

Debe ser posible cambiar esa carpeta posteriormente desde la configuración.

---

# Contraseña maestra

Luego del login con Google, el usuario deberá ingresar una contraseña maestra.

La contraseña será utilizada para derivar una clave mediante Argon2id.

La aplicación utilizará esa clave para cifrar y descifrar todos los archivos.

Nunca almacenar la contraseña en texto plano.

Guardar únicamente:

- salt
- parámetros de Argon2id
- passwordVerifier
- versión
- algoritmo

---

# Archivo de configuración

En el directorio raíz del repositorio debe existir un archivo:

```
vault.config.json
```

Ejemplo:

```json
{
  "version": 1,
  "algorithm": "AES-256-GCM",
  "kdf": "argon2id",
  "salt": "...",
  "passwordVerifier": "...",
  "createdAt": "...",
  "repository": {}
}
```

Este archivo:

- debe permanecer dentro del repositorio del usuario (Filesystem o Google Drive)
- no debe contener la contraseña
- no debe contener la clave de cifrado
- debe servir únicamente para validar la contraseña y conocer la configuración del repositorio

---

# Cifrado

Utilizar:

- AES-256-GCM
- Argon2id

El cifrado y descifrado deben realizarse utilizando streams para soportar archivos grandes.

Todos los archivos almacenados en el repositorio deberán permanecer cifrados.

---

# Gestión de archivos

La aplicación debe permitir:

- crear carpetas
- crear subcarpetas
- eliminar carpetas
- renombrar carpetas
- subir archivos
- descargar archivos
- eliminar archivos
- mover archivos
- copiar archivos
- renombrar archivos

Todos los nombres visibles para el usuario deberán ser los originales.

Internamente los archivos permanecerán cifrados.

---

# API REST

## Auth

```
POST /auth/google
GET  /auth/google/callback
POST /auth/logout
```

## Configuración

```
GET  /config
PUT  /config
POST /config/select-drive-folder
```

## Carpetas

```
GET    /folders
POST   /folders
PATCH  /folders/:id
DELETE /folders/:id
```

## Archivos

```
GET    /files
GET    /files/tree
POST   /files
PATCH  /files/:id
DELETE /files/:id
POST   /files/move
POST   /files/copy
```

## Upload

```
POST /upload
```

Debe aceptar `multipart/form-data`.

El archivo debe cifrarse antes de almacenarse.

## Download

```
GET /download/:id
```

Debe devolver el archivo ya descifrado.

---

# Frontend

Además de la API REST quiero desarrollar una aplicación web utilizando únicamente:

- HTML5
- CSS3
- JavaScript Vanilla

No utilizar:

- React
- Angular
- Vue
- Svelte
- Next.js
- Nuxt
- Bootstrap Studio
- ningún framework SPA

La aplicación web deberá consumir exclusivamente la API REST.

No deberá acceder directamente al filesystem ni a Google Drive.

---

# Flujo del usuario

El flujo esperado es:

```
Usuario
    ↓
Login con Google
    ↓
OAuth
    ↓
Autoriza acceso a Google Drive
    ↓
Selecciona carpeta del repositorio
    ↓
Ingresa contraseña maestra
    ↓
Repositorio desbloqueado
    ↓
Explorador de archivos
```

---

# Explorador de archivos

Una vez autenticado y desbloqueado el repositorio, el usuario deberá visualizar un explorador de archivos similar al explorador de Windows.

Debe permitir:

- navegar carpetas
- expandir y contraer directorios
- crear carpetas
- crear subcarpetas
- eliminar carpetas
- renombrar carpetas
- subir archivos
- descargar archivos
- mover archivos
- copiar archivos
- eliminar archivos
- renombrar archivos
- visualizar metadata
- visualizar tamaños
- visualizar fechas de modificación

La estructura visualizada deberá representar siempre la estructura lógica del repositorio.

El usuario nunca deberá visualizar nombres cifrados ni detalles internos del almacenamiento.

---

# Organización del frontend

Como referencia:

```text
public/
    index.html
    login.html
    unlock.html
    explorer.html

    css/

    js/
        api.js
        auth.js
        explorer.js
        upload.js
        folders.js
        files.js
        dialogs.js
```

Puede proponerse una organización diferente si resulta técnicamente superior.

---

# Seguridad

Implementar:

- Google OAuth
- validación de ownership de todos los recursos
- rate limiting
- protección CSRF
- validación de inputs
- manejo seguro de tokens OAuth
- separación entre autenticación y cifrado
- posibilidad de rotación futura de claves
- arquitectura preparada para soportar múltiples algoritmos de cifrado

---

# Tecnologías

- Node.js 22
- TypeScript
- Express
- Passport.js (o equivalente)
- Multer
- Zod
- Pino
- SQLite para la primera versión

Preparar la arquitectura para migrar posteriormente a PostgreSQL.

---

# Calidad del código

Quiero código de calidad profesional.

Seguir buenas prácticas:

- SOLID
- Clean Architecture
- Dependency Injection
- Repository Pattern cuando corresponda
- Interfaces para todos los servicios importantes
- Bajo acoplamiento
- Alta cohesión
- Código fuertemente tipado
- Manejo consistente de errores
- Logging estructurado
- Tests donde resulte razonable

---

# Objetivo de diseño

Toda la arquitectura debe permitir cambiar únicamente la implementación del `StorageProvider` para soportar nuevos repositorios.

No deberían modificarse:

- Controllers
- Services
- API REST
- Frontend

El objetivo es construir una aplicación similar conceptualmente a **Cryptomator** o **Proton Drive**, donde el usuario navega normalmente por sus carpetas mientras que todos los datos permanecen cifrados en el almacenamiento subyacente.

---

# Entregables esperados

Quiero que el desarrollo se realice por etapas.

## Etapa 1

- Analizar la estructura actual del proyecto.
- Explicar cómo integrar la nueva funcionalidad.
- Identificar componentes reutilizables.
- Proponer la arquitectura final.

Esperar mi aprobación antes de modificar código.

## Etapa 2

Implementar la infraestructura:

- configuración
- autenticación
- StorageProvider
- FilesystemStorageProvider
- CryptoService

## Etapa 3

Implementar la API REST.

## Etapa 4

Implementar el frontend HTML/CSS/JavaScript.

## Etapa 5

Integrar autenticación, cifrado y explorador de archivos.

## Etapa 6

Preparar la arquitectura para Google Drive.

En cada etapa explicar las decisiones arquitectónicas antes de generar código.

No asumir detalles del proyecto existente: si falta información, solicitarla antes de implementar.