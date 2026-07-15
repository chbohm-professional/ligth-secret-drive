/**
 * auth.js — Authentication state helpers shared across pages.
 */
const Auth = (() => {
    let _user = null;

    async function getUser() {
        if (_user) return _user;
        try {
            const res = await API.getMe();
            _user = res.data;
            return _user;
        } catch {
            return null;
        }
    }

    async function requireAuth() {
        const user = await getUser();
        if (!user) {
            window.location.href = '/login.html';
            return null;
        }
        return user;
    }

    async function requireUnlocked() {
        const user = await requireAuth();
        if (!user) return null;
        try {
            const res = await API.getConfig();
            if (!res.data.initialized) {
                window.location.href = '/unlock.html?action=init';
                return null;
            }
            if (!res.data.unlocked) {
                window.location.href = '/unlock.html';
                return null;
            }
            return user;
        } catch {
            window.location.href = '/login.html';
            return null;
        }
    }

    return { getUser, requireAuth, requireUnlocked };
})();

// On login.html: redirect if already authenticated
if (document.body.classList.contains('auth-page') && window.location.pathname === '/login.html') {
    (async () => {
        try {
            const res = await API.getConfig();
            if (res.data.unlocked) {
                window.location.href = '/explorer.html';
            } else if (!res.data.initialized) {
                window.location.href = '/unlock.html?action=init';
            } else {
                window.location.href = '/unlock.html';
            }
        } catch { /* not logged in, stay */ }
    })();
}
