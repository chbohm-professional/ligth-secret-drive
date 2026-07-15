/**
 * login.js — Google sign-in bootstrap.
 */
(function () {
    const errorDiv = document.getElementById('formError');
    const submitBtn = document.getElementById('loginBtn');

    if (!submitBtn) return;

    function showError(message) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }

    submitBtn.addEventListener('click', async () => {
        errorDiv.style.display = 'none';
        submitBtn.disabled = true;
        submitBtn.textContent = 'Connecting…';

        try {
            await API.loginWithGoogle();
            const config = await API.getConfig();

            if (!config.data.initialized) {
                window.location.href = '/unlock.html?action=init';
            } else if (!config.data.unlocked) {
                window.location.href = '/unlock.html';
            } else {
                window.location.href = '/explorer.html';
            }
        } catch (error) {
            showError(error.message || 'Could not connect to Google Drive.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Continue with Google';
        }
    });
})();