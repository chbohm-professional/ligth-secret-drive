# Google OAuth: cómo funciona

## Dos identidades distintas

Google OAuth utiliza dos grupos de credenciales que cumplen funciones diferentes:

### Credenciales de la aplicación

- `clientId`
- `clientSecret`

Identifican a tu aplicación ante Google.

Existe un único par por aplicación y se configura en Google Cloud Console.

### Credenciales del usuario

- `accessToken`
- `refreshToken`

Representan los permisos que un usuario otorgó a tu aplicación.

Existe un conjunto de tokens por cada usuario que autoriza el acceso.

---

## El flujo real

1. Tu aplicación redirige al usuario a Google para iniciar sesión y aceptar permisos.
2. Google devuelve un `authorization code`.
3. Tu servidor envía ese código a Google junto con el `clientId` y el `clientSecret`.
4. Google verifica que la solicitud proviene de una aplicación válida.
5. Google devuelve:
   - `accessToken`
   - `refreshToken`
6. Tu aplicación guarda esos tokens asociados al usuario.
7. A partir de ese momento puede realizar acciones en nombre del usuario (por ejemplo, acceder a Google Drive).

---

## ¿Por qué existe el clientSecret?

El `clientSecret` es la prueba de que el servidor que solicita los tokens realmente pertenece a tu aplicación y no a alguien que simplemente conoce el `clientId`.

Google verifica este secreto durante el intercambio del código de autorización por los tokens.

Por eso:

- Nunca debe enviarse al frontend.
- Debe permanecer únicamente en el backend.
- Debe almacenarse de forma segura.

---

## Resumen

| Credenciales | Quién las tiene | Cantidad | Propósito |
|-------------|----------------|-----------|------------|
| `clientId` + `clientSecret` | Servidor de la aplicación | Una por aplicación | Identificar la aplicación ante Google |
| `accessToken` + `refreshToken` | Base de datos, asociados a cada usuario | Uno por usuario | Actuar en nombre del usuario |

Sin un `clientId` y un `clientSecret` registrados en Google Cloud Console, Google no permite iniciar el flujo OAuth para ningún usuario.

---

## ¿Cómo encontrar un Client ID existente?

Abrí:

https://console.cloud.google.com/apis/credentials

En la sección **OAuth 2.0 Client IDs** vas a encontrar todos los clientes OAuth creados para el proyecto seleccionado.

Pasos:

1. Entrar a Google Cloud Console.
2. Verificar que estés en el proyecto correcto.
3. Buscar el cliente OAuth en la tabla **OAuth 2.0 Client IDs**.
4. Hacer clic sobre el nombre.
5. Ver:
   - `clientId`
   - `clientSecret` (haciendo clic en **Mostrar**)

Si tenés varios proyectos, revisá el selector de proyecto ubicado en la parte superior izquierda hasta encontrar el correcto.