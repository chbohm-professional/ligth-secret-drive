/**
 * unlock.js — Master password form logic (unlock + first-time init).
 */
(async () => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action'); // 'init' or null
    const isInit = action === 'init';

    // UI refs
    const title = document.getElementById('authTitle');
    const subtitle = document.getElementById('authSubtitle');
    const logo = document.getElementById('authLogo');
    const confirmGroup = document.getElementById('confirmGroup');
    const submitBtn = document.getElementById('submitBtn');
    const errorDiv = document.getElementById('formError');
    const logoutLink = document.getElementById('logoutLink');

    // Redirect if not authenticated
    const user = await Auth.requireAuth();
    if (!user) return;

    if (isInit) {
        logo.textContent = '🔑';
        title.textContent = 'Crear carpeta encriptada';
        subtitle.textContent = 'Elige una contraseña maestra segura y guardela bien. NO PUEDE SER RECUPERADA.';
        confirmGroup.style.display = 'block';
        submitBtn.textContent = 'Crear carpeta';
    }

    function showError(msg) {
        errorDiv.textContent = msg;
        errorDiv.style.display = 'block';
    }


    // Mostrar / ocultar contraseñas
    document.querySelectorAll(".password-toggle").forEach(button => {

        button.addEventListener("click", () => {

            const wrapper = button.closest(".password-wrapper");
            const input = wrapper.querySelector("input");
            const icon = button.querySelector("i");

            if (input.type === "password") {

                input.type = "text";

                icon.classList.remove("fa-eye");
                icon.classList.add("fa-eye-slash");

            } else {

                input.type = "password";

                icon.classList.remove("fa-eye-slash");
                icon.classList.add("fa-eye");

            }

        });

    });


    document.getElementById('unlockForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        errorDiv.style.display = 'none';
        submitBtn.disabled = true;
        submitBtn.textContent = isInit ? 'Creando…' : 'Abriendo…';

        const password = document.getElementById('password').value;
        const confirm = document.getElementById('confirm').value;

        try {

            if (isInit) {

                if (password !== confirm) {
                    showError('Las contraseñas no coinciden.');
                    return;
                }

                await API.initVault(password, confirm);

            } else {

                await API.unlockVault(password);

            }

            window.location.href = '/explorer.html';

        } catch (err) {

            showError(err.message || 'La operación falló. Por favor, inténtalo de nuevo.');

        } finally {

            submitBtn.disabled = false;
            submitBtn.textContent = isInit ? 'Crear carpeta' : 'Abrir';

        }

    });


    logoutLink.addEventListener('click', async (e) => {

        e.preventDefault();

        try {
            await API.logout();
        } catch {}

        window.location.href = '/login.html';

    });

})();