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
        title.textContent = 'Create Vault';
        subtitle.textContent = 'Choose a strong master password. It cannot be recovered.';
        confirmGroup.style.display = 'block';
        submitBtn.textContent = 'Create Vault';
    }

    function showError(msg) {
        errorDiv.textContent = msg;
        errorDiv.style.display = 'block';
    }

    document.getElementById('unlockForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        errorDiv.style.display = 'none';
        submitBtn.disabled = true;
        submitBtn.textContent = isInit ? 'Creating…' : 'Unlocking…';

        const password = document.getElementById('password').value;
        const confirm = document.getElementById('confirm').value;

        try {
            if (isInit) {
                if (password.length < 12) { showError('Password must be at least 12 characters.'); return; }
                if (password !== confirm) { showError('Passwords do not match.'); return; }
                await API.initVault(password, confirm);
            } else {
                await API.unlockVault(password);
            }
            window.location.href = '/explorer.html';
        } catch (err) {
            showError(err.message || 'Operation failed. Please try again.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = isInit ? 'Create Vault' : 'Unlock';
        }
    });

    logoutLink.addEventListener('click', async (e) => {
        e.preventDefault();
        try { await API.logout(); } catch {}
        window.location.href = '/login.html';
    });
})();
