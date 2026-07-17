/**
 * api.js — Browser-only Google Drive vault.
 *
 * Storage model:
 * - Authentication: Google Identity Services token flow in the browser
 * - Vault config: plaintext vault.config.json stored in the user's Drive
 * - Vault metadata: encrypted vault.index.enc stored in the user's Drive
 * - Vault file contents: encrypted blob files stored in the user's Drive
 */
const API = (() => {
    const APP_CONFIG = window.APP_CONFIG || {};
    const GOOGLE_CLIENT_ID = APP_CONFIG.googleClientId || '';
    const VAULT_ROOT_NAME = APP_CONFIG.vaultFolderName || 'Encrypted Vault';
    const GOOGLE_SCOPES = [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/drive.file',
    ].join(' ');
    const REQUIRED_SCOPES = GOOGLE_SCOPES.split(' ');

    const LOCAL_USER_KEY = 'secret-drive.googleUser';
    const LOCAL_TOKEN_KEY = 'secret-drive.googleAccessToken';
    const LOCAL_TOKEN_EXPIRY_KEY = 'secret-drive.googleAccessTokenExpiry';
    const SESSION_KEY_PREFIX = 'secret-drive.sessionKey.';
    const SESSION_INDEX_PREFIX = 'secret-drive.vaultIndex.';
    const VAULT_LABEL = 'vault-password-verifier-v1';
    const DEFAULT_ITERATIONS = 600000;
    const DEFAULT_FOLDERS = [];
    const textEncoder = new TextEncoder();
    const textDecoder = new TextDecoder();

    let googleReadyPromise = null;
    let tokenClient = null;
    let accessToken = localStorage.getItem(LOCAL_TOKEN_KEY) || '';
    let accessTokenExpiry = Number(localStorage.getItem(LOCAL_TOKEN_EXPIRY_KEY) || 0);
    let activeUser = readStoredUser();
    let tokenRequestPromise = null;
    const vaultContextCache = new Map();
    const vaultIndexCache = new Map();

    function ok(data, message) {
        return { success: true, data, ...(message ? { message } : {}) };
    }

    function fail(message) {
        throw new Error(message);
    }

    function nowIso() {
        return new Date().toISOString();
    }

    function generateId() {
        return crypto.randomUUID();
    }

    function readStoredUser() {
        try {
            const raw = localStorage.getItem(LOCAL_USER_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }

    function storeUser(user) {
        activeUser = user;
        if (user) {
            localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(user));
        } else {
            localStorage.removeItem(LOCAL_USER_KEY);
        }
    }

    function storeAccessToken(token, expiresInSeconds) {
        accessToken = token;
        accessTokenExpiry = Date.now() + Math.max((expiresInSeconds - 60) * 1000, 60 * 1000);
        localStorage.setItem(LOCAL_TOKEN_KEY, accessToken);
        localStorage.setItem(LOCAL_TOKEN_EXPIRY_KEY, String(accessTokenExpiry));
    }

    function clearAccessToken() {
        accessToken = '';
        accessTokenExpiry = 0;
        localStorage.removeItem(LOCAL_TOKEN_KEY);
        localStorage.removeItem(LOCAL_TOKEN_EXPIRY_KEY);
    }

    let CLIENT_ID;

    function getSessionKeyStorageName(userId) {
        return `${SESSION_KEY_PREFIX}${userId}`;
    }

    function getSessionIndexStorageName(userId) {
        return `${SESSION_INDEX_PREFIX}${userId}`;
    }

    function bytesToBase64(bytes) {
        let binary = '';
        bytes.forEach((byte) => {
            binary += String.fromCharCode(byte);
        });
        return btoa(binary);
    }

    function base64ToBytes(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    function bytesToHex(bytes) {
        return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    }

    function concatBytes(...chunks) {
        const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const joined = new Uint8Array(total);
        let offset = 0;

        for (const chunk of chunks) {
            joined.set(chunk, offset);
            offset += chunk.length;
        }

        return joined;
    }

    async function sha256(bytes) {
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return new Uint8Array(digest);
    }

    async function deriveKeyAndVerifier(password, saltBase64, iterations = DEFAULT_ITERATIONS) {
        const passwordKey = await crypto.subtle.importKey(
            'raw',
            textEncoder.encode(password),
            'PBKDF2',
            false,
            ['deriveBits']
        );
        const salt = base64ToBytes(saltBase64);
        const bits = await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt,
                iterations,
                hash: 'SHA-256',
            },
            passwordKey,
            512,
        );

        const derived = new Uint8Array(bits);
        const keyBytes = derived.slice(0, 32);
        const verifierMaterial = derived.slice(32, 64);
        const verifier = bytesToHex(await sha256(concatBytes(verifierMaterial, textEncoder.encode(VAULT_LABEL))));
        return { keyBytes, verifier };
    }

    async function importAesKey(keyBytes, usages) {
        return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, usages);
    }

    async function encryptBytes(plainBytes, keyBytes) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await importAesKey(keyBytes, ['encrypt']);
        const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plainBytes);
        return concatBytes(iv, new Uint8Array(encrypted));
    }

    async function decryptBytes(cipherBytes, keyBytes) {
        if (cipherBytes.length < 13) fail('Encrypted payload is corrupted.');
        const iv = cipherBytes.slice(0, 12);
        const payload = cipherBytes.slice(12);
        const key = await importAesKey(keyBytes, ['decrypt']);
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, payload);
        return new Uint8Array(decrypted);
    }

    function getUnlockedKey(userId) {
        const raw = sessionStorage.getItem(getSessionKeyStorageName(userId));
        return raw ? base64ToBytes(raw) : null;
    }

    function setUnlockedKey(userId, keyBytes) {
        sessionStorage.setItem(getSessionKeyStorageName(userId), bytesToBase64(keyBytes));
    }

    function clearUnlockedKey(userId) {
        sessionStorage.removeItem(getSessionKeyStorageName(userId));
    }

    function persistVaultIndexCache(userId, index) {
        vaultIndexCache.set(userId, index);
        sessionStorage.setItem(getSessionIndexStorageName(userId), JSON.stringify(index));
    }

    function clearVaultIndexCache(userId) {
        vaultIndexCache.delete(userId);
        sessionStorage.removeItem(getSessionIndexStorageName(userId));
    }

    function hydrateVaultIndexFromSession(userId) {
        if (vaultIndexCache.has(userId)) return vaultIndexCache.get(userId);
        try {
            const raw = sessionStorage.getItem(getSessionIndexStorageName(userId));
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            vaultIndexCache.set(userId, parsed);
            return parsed;
        } catch {
            return null;
        }
    }

    async function ensureGoogleReady() {
        if (googleReadyPromise) return googleReadyPromise;

        googleReadyPromise = new Promise((resolve, reject) => {
            if (!CLIENT_ID) {
                CLIENT_ID = GOOGLE_CLIENT_ID || JSON.parse(decode(ccb, 'ccb')).web.client_id;
            }

            if (!CLIENT_ID || CLIENT_ID === 'REPLACE_WITH_GOOGLE_CLIENT_ID') {
                reject(new Error('Set window.APP_CONFIG.googleClientId in /js/app-config.js before using Google Drive mode.'));
                return;
            }

            const waitForGoogle = () => {
                if (!window.google?.accounts?.oauth2) {
                    window.setTimeout(waitForGoogle, 50);
                    return;
                }

                tokenClient = window.google.accounts.oauth2.initTokenClient({
                    client_id: CLIENT_ID,
                    scope: GOOGLE_SCOPES,
                    callback: () => { },
                    error_callback: (error) => reject(error),
                });
                resolve();
            };

            waitForGoogle();
        });

        return googleReadyPromise;
    }

    async function requestAccessToken(prompt) {
        await ensureGoogleReady();

        if (tokenRequestPromise) return tokenRequestPromise;

        tokenRequestPromise = new Promise((resolve, reject) => {
            tokenClient.callback = (response) => {
                tokenRequestPromise = null;
                if (response?.error) {
                    reject(new Error(response.error));
                    return;
                }
                const grantedScopes = String(response.scope || '').split(/\s+/).filter(Boolean);
                const missingScopes = REQUIRED_SCOPES.filter((scope) => !grantedScopes.includes(scope));
                if (missingScopes.length > 0) {
                    clearAccessToken();
                    reject(new Error(`Google login is missing required scopes: ${missingScopes.join(', ')}`));
                    return;
                }
                storeAccessToken(response.access_token, response.expires_in || 3600);
                resolve(response.access_token);
            };

            tokenClient.requestAccessToken({ prompt });
        });

        return tokenRequestPromise;
    }

    async function requireDriveToken() {
        if (accessToken && Date.now() < accessTokenExpiry) {
            return accessToken;
        }

        await requestAccessToken('');

        return accessToken;
    }

    async function driveFetch(url, options = {}) {
        const token = await requireDriveToken();
        const response = await fetch(url, {
            ...options,
            headers: {
                Authorization: `Bearer ${token}`,
                ...(options.headers || {}),
            },
        });

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                clearAccessToken();
            }
            let message = `Google Drive request failed (${response.status})`;
            try {
                const payload = await response.json();
                message = payload.error?.message || payload.message || message;
            } catch { }
            fail(message);
        }

        return response;
    }

    async function driveJson(url, options = {}) {
        const response = await driveFetch(url, options);
        return response.json();
    }

    async function listDriveFiles(query, fields) {
        const params = new URLSearchParams({
            q: query,
            fields: fields || 'files(id,name,mimeType,parents,appProperties,size,modifiedTime)',
            spaces: 'drive',
            pageSize: '1000',
        });
        const data = await driveJson(`https://www.googleapis.com/drive/v3/files?${params.toString()}`);
        return data.files || [];
    }

    async function createDriveFolder(name, parentId, appProperties = {}) {
        const body = {
            name,
            mimeType: 'application/vnd.google-apps.folder',
            appProperties,
            ...(parentId ? { parents: [parentId] } : {}),
        };

        return driveJson('https://www.googleapis.com/drive/v3/files?fields=id,name,parents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    }

    async function uploadDriveFile({ fileId, name, parentId, mimeType, appProperties, data }) {
        const metadata = {
            ...(name ? { name } : {}),
            ...(!fileId && parentId ? { parents: [parentId] } : {}),
            ...(mimeType ? { mimeType } : {}),
            ...(appProperties ? { appProperties } : {}),
        };

        const boundary = `secret-drive-${generateId()}`;
        const metadataBlob = new Blob([JSON.stringify(metadata)], { type: 'application/json; charset=UTF-8' });
        const mediaBlob = data instanceof Blob ? data : new Blob([data], { type: mimeType || 'application/octet-stream' });
        const body = new Blob([
            `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
            metadataBlob,
            `\r\n--${boundary}\r\nContent-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`,
            mediaBlob,
            `\r\n--${boundary}--`,
        ]);

        const baseUrl = fileId
            ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}`
            : 'https://www.googleapis.com/upload/drive/v3/files';
        const method = fileId ? 'PATCH' : 'POST';

        return driveJson(`${baseUrl}?uploadType=multipart&fields=id,name,parents,modifiedTime,size`, {
            method,
            headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
            body,
        });
    }

    async function deleteDriveFile(fileId) {
        await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, { method: 'DELETE' });
    }

    async function copyDriveFile(fileId, name, parentId) {
        return driveJson(`https://www.googleapis.com/drive/v3/files/${fileId}/copy?fields=id,name,parents,modifiedTime,size`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, parents: parentId ? [parentId] : undefined }),
        });
    }

    async function downloadDriveBytes(fileId) {
        const response = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
        const buffer = await response.arrayBuffer();
        return new Uint8Array(buffer);
    }

    async function fetchGoogleProfile() {
        const response = await driveFetch('https://www.googleapis.com/oauth2/v3/userinfo');
        return response.json();
    }

    async function persistUserProfile(partial) {
        const next = {
            ...(activeUser || {}),
            ...partial,
            updatedAt: nowIso(),
        };
        storeUser(next);
        return next;
    }

    async function loginWithGoogle() {
        clearAccessToken();
        await requestAccessToken('');
        const profile = await fetchGoogleProfile();

        const user = await persistUserProfile({
            id: profile.sub,
            email: profile.email,
            displayName: profile.name || profile.email,
            driveFolderId: activeUser?.driveFolderId || null,
            driveFolderName: activeUser?.driveFolderName || null,
            createdAt: activeUser?.createdAt || nowIso(),
        });

        return ok({
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            driveFolderId: user.driveFolderId,
            driveFolderName: user.driveFolderName,
        });
    }

    async function getCurrentUser() {
        if (!activeUser) return null;
        return activeUser;
    }

    async function requireCurrentUser() {
        const user = await getCurrentUser();
        if (!user) fail('Please sign in to continue.');
        await requireDriveToken();
        return user;
    }

    async function requireUnlockedUser() {
        const user = await requireCurrentUser();
        const keyBytes = getUnlockedKey(user.id);
        if (!keyBytes) fail('Vault is locked.');
        return { user, keyBytes };
    }

    async function getVaultContext(user, createIfMissing = false) {
        const cached = vaultContextCache.get(user.id);
        if (cached && (!createIfMissing || cached.rootFolderId)) return cached;

        let rootFolder = null;
        if (user.driveFolderId) {
            rootFolder = { id: user.driveFolderId, name: user.driveFolderName || VAULT_ROOT_NAME };
        } else {
            const roots = await listDriveFiles(
                `trashed = false and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='secretDriveVaultRoot' and value='1' } and appProperties has { key='secretDriveOwner' and value='${user.id}' }`
            );
            rootFolder = roots[0] || null;
        }

        if (!rootFolder && !createIfMissing) return null;
        if (!rootFolder && createIfMissing) {
            rootFolder = await createDriveFolder(VAULT_ROOT_NAME, null, {
                secretDriveVaultRoot: '1',
                secretDriveOwner: user.id,
            });
            await persistUserProfile({ driveFolderId: rootFolder.id, driveFolderName: rootFolder.name });
            user.driveFolderId = rootFolder.id;
            user.driveFolderName = rootFolder.name;
        }

        const children = rootFolder
            ? await listDriveFiles(`trashed = false and '${rootFolder.id}' in parents`)
            : [];
        let configFile = children.find((file) => file.name === 'vault.config.json') || null;
        let indexFile = children.find((file) => file.name === 'vault.index.enc') || null;
        let blobsFolder = children.find((file) => file.name === 'blobs' && file.mimeType === 'application/vnd.google-apps.folder') || null;

        if (!blobsFolder && createIfMissing && rootFolder) {
            blobsFolder = await createDriveFolder('blobs', rootFolder.id, {
                secretDriveVaultBlobs: '1',
                secretDriveOwner: user.id,
            });
        }

        const context = {
            rootFolderId: rootFolder?.id || null,
            rootFolderName: rootFolder?.name || VAULT_ROOT_NAME,
            blobsFolderId: blobsFolder?.id || null,
            configFileId: configFile?.id || null,
            indexFileId: indexFile?.id || null,
        };

        vaultContextCache.set(user.id, context);
        return context;
    }

    async function saveVaultConfig(user, config) {
        const context = await getVaultContext(user, true);
        const uploaded = await uploadDriveFile({
            fileId: context.configFileId,
            name: 'vault.config.json',
            parentId: context.rootFolderId,
            mimeType: 'application/json',
            appProperties: {
                secretDriveVaultConfig: '1',
                secretDriveOwner: user.id,
            },
            data: JSON.stringify(config, null, 2),
        });
        context.configFileId = uploaded.id;
        vaultContextCache.set(user.id, context);
    }

    async function getVaultConfig(userId) {
        const user = await getCurrentUser();
        if (!user || user.id !== userId) return null;
        const context = await getVaultContext(user, false);
        if (!context?.configFileId) return null;

        const bytes = await downloadDriveBytes(context.configFileId);
        return JSON.parse(textDecoder.decode(bytes));
    }

    async function saveVaultIndex(user, keyBytes, index) {
        const context = await getVaultContext(user, true);
        const encrypted = await encryptBytes(textEncoder.encode(JSON.stringify(index)), keyBytes);
        const uploaded = await uploadDriveFile({
            fileId: context.indexFileId,
            name: 'vault.index.enc',
            parentId: context.rootFolderId,
            mimeType: 'application/octet-stream',
            appProperties: {
                secretDriveVaultIndex: '1',
                secretDriveOwner: user.id,
            },
            data: encrypted,
        });

        context.indexFileId = uploaded.id;
        vaultContextCache.set(user.id, context);
        persistVaultIndexCache(user.id, index);
    }

    async function loadVaultIndex(user, keyBytes) {
        const cached = hydrateVaultIndexFromSession(user.id);
        if (cached) return cached;

        const context = await getVaultContext(user, false);
        if (!context?.indexFileId) {
            const empty = { version: 1, folders: [], files: [] };
            persistVaultIndexCache(user.id, empty);
            return empty;
        }

        const encrypted = await downloadDriveBytes(context.indexFileId);
        const decrypted = await decryptBytes(encrypted, keyBytes);
        const parsed = JSON.parse(textDecoder.decode(decrypted));
        persistVaultIndexCache(user.id, parsed);
        return parsed;
    }

    async function updateVaultIndex(user, keyBytes, updater) {
        const current = await loadVaultIndex(user, keyBytes);
        const draft = structuredClone(current);
        const result = await updater(draft);
        await saveVaultIndex(user, keyBytes, draft);
        return result;
    }

    function buildTreeFromIndex(index) {
        const foldersByParent = new Map();
        for (const folder of index.folders) {
            const key = folder.parentId || 'root';
            if (!foldersByParent.has(key)) foldersByParent.set(key, []);
            foldersByParent.get(key).push(folder);
        }

        const filesByFolder = new Map();
        for (const file of index.files) {
            const key = file.folderId || 'root';
            if (!filesByFolder.has(key)) filesByFolder.set(key, []);
            filesByFolder.get(key).push(file);
        }

        function buildNode(folderId, name, path) {
            const subfolders = (foldersByParent.get(folderId || 'root') || [])
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((folder) => buildNode(folder.id, folder.name, folder.path));

            return {
                id: folderId,
                name,
                path,
                subfolders,
                files: (filesByFolder.get(folderId || 'root') || []).sort((a, b) => a.name.localeCompare(b.name)),
            };
        }

        return buildNode(null, 'Root', '/');
    }

    function findFolder(index, userId, folderId) {
        const folder = index.folders.find((item) => item.id === folderId && item.userId === userId);
        if (!folder) fail('Folder not found.');
        return folder;
    }

    function findFile(index, userId, fileId) {
        const file = index.files.find((item) => item.id === fileId && item.userId === userId);
        if (!file) fail('File not found.');
        return file;
    }

    function buildFolderPath(index, userId, parentId, name) {
        if (!parentId) return name;
        return `${findFolder(index, userId, parentId).path}/${name}`;
    }

    function rewriteDescendantPaths(index, folderId, userId) {
        const children = index.folders.filter((folder) => folder.parentId === folderId && folder.userId === userId);
        for (const child of children) {
            const parent = findFolder(index, userId, child.parentId);
            child.path = `${parent.path}/${child.name}`;
            child.updatedAt = nowIso();
            rewriteDescendantPaths(index, child.id, userId);
        }
    }

    async function getMe() {
        const user = await getCurrentUser();
        if (!user || !accessToken) fail('Not signed in.');
        return ok({
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            driveFolderId: user.driveFolderId || null,
            driveFolderName: user.driveFolderName || null,
        });
    }

    async function logout() {
        const user = await getCurrentUser();
        if (user) {
            clearUnlockedKey(user.id);
            clearVaultIndexCache(user.id);
            vaultContextCache.delete(user.id);
        }
        if (accessToken && window.google?.accounts?.oauth2?.revoke) {
            await new Promise((resolve) => {
                window.google.accounts.oauth2.revoke(accessToken, () => resolve());
            });
        }
        clearAccessToken();
        storeUser(null);
        return ok(null, 'Signed out');
    }

    async function getConfig() {
        const user = await requireCurrentUser();
        const config = await getVaultConfig(user.id);
        const context = await getVaultContext(user, false);
        return ok({
            initialized: Boolean(config),
            unlocked: Boolean(getUnlockedKey(user.id)),
            algorithm: config?.algorithm,
            version: config?.version,
            createdAt: config?.createdAt,
            kdf: config?.kdf,
            repository: config?.repository,
            driveFolderId: context?.rootFolderId || user.driveFolderId || null,
            driveFolderName: context?.rootFolderName || user.driveFolderName || null,
        });
    }

    async function initVault(password, confirm) {
        const user = await requireCurrentUser();
        if (password !== confirm) fail('Passwords do not match.');
        if (password.length < 12) fail('Password must be at least 12 characters.');
        if (await getVaultConfig(user.id)) fail('Vault already initialized.');

        const salt = crypto.getRandomValues(new Uint8Array(32));
        const { keyBytes, verifier } = await deriveKeyAndVerifier(password, bytesToBase64(salt), DEFAULT_ITERATIONS);
        const context = await getVaultContext(user, true);
        const config = {
            version: 1,
            algorithm: 'AES-256-GCM',
            kdf: 'PBKDF2-SHA256',
            salt: bytesToBase64(salt),
            passwordVerifier: verifier,
            iterations: DEFAULT_ITERATIONS,
            createdAt: nowIso(),
            repository: {
                provider: 'google-drive',
                rootFolderId: context.rootFolderId,
                blobsFolderId: context.blobsFolderId,
            },
        };
        const createdAt = nowIso();
        const index = {
            version: 1,
            folders: DEFAULT_FOLDERS.map((name) => ({
                id: generateId(),
                userId: user.id,
                parentId: null,
                name,
                path: name,
                createdAt,
                updatedAt: createdAt,
            })),
            files: [],
        };

        await saveVaultConfig(user, config);
        await saveVaultIndex(user, keyBytes, index);
        setUnlockedKey(user.id, keyBytes);

        return ok(null, 'Vault initialized');
    }

    async function unlockVault(password) {
        const user = await requireCurrentUser();
        const config = await getVaultConfig(user.id);
        if (!config) fail('Vault is not initialized yet.');

        const { keyBytes, verifier } = await deriveKeyAndVerifier(password, config.salt, config.iterations || DEFAULT_ITERATIONS);
        if (verifier !== config.passwordVerifier) fail('Wrong master password');
        setUnlockedKey(user.id, keyBytes);
        await loadVaultIndex(user, keyBytes);
        return ok(null, 'Vault unlocked');
    }

    async function lockVault() {
        const user = await requireCurrentUser();
        clearUnlockedKey(user.id);
        clearVaultIndexCache(user.id);
        return ok(null, 'Vault locked');
    }

    async function selectDriveFolder(folderId, folderName) {
        const user = await requireCurrentUser();
        await persistUserProfile({ driveFolderId: folderId || null, driveFolderName: folderName || null });
        vaultContextCache.delete(user.id);
        return ok(null);
    }

    async function listFolders(parentId) {
        const { user, keyBytes } = await requireUnlockedUser();
        const index = await loadVaultIndex(user, keyBytes);
        return ok(
            index.folders
                .filter((folder) => folder.userId === user.id && folder.parentId === (parentId || null))
                .sort((a, b) => a.name.localeCompare(b.name))
        );
    }

    async function createFolder(name, parentId) {
        const { user, keyBytes } = await requireUnlockedUser();
        const safeName = String(name || '').trim();
        if (!safeName) fail('Folder name is required.');

        const folder = await updateVaultIndex(user, keyBytes, async (index) => {
            const createdAt = nowIso();
            const item = {
                id: generateId(),
                userId: user.id,
                parentId: parentId || null,
                name: safeName,
                path: buildFolderPath(index, user.id, parentId || null, safeName),
                createdAt,
                updatedAt: createdAt,
            };
            index.folders.push(item);
            return item;
        });

        return ok(folder);
    }

    async function renameFolder(id, name) {
        const { user, keyBytes } = await requireUnlockedUser();
        const safeName = String(name || '').trim();
        if (!safeName) fail('Folder name is required.');

        const folder = await updateVaultIndex(user, keyBytes, async (index) => {
            const item = findFolder(index, user.id, id);
            item.name = safeName;
            item.path = buildFolderPath(index, user.id, item.parentId, safeName);
            item.updatedAt = nowIso();
            rewriteDescendantPaths(index, item.id, user.id);
            return item;
        });

        return ok(folder);
    }

    async function deleteFolder(id) {
        const { user, keyBytes } = await requireUnlockedUser();
        await updateVaultIndex(user, keyBytes, async (index) => {
            const folderIds = new Set([id]);
            let changed = true;

            while (changed) {
                changed = false;
                for (const folder of index.folders) {
                    if (folder.userId === user.id && folder.parentId && folderIds.has(folder.parentId) && !folderIds.has(folder.id)) {
                        folderIds.add(folder.id);
                        changed = true;
                    }
                }
            }

            const filesToDelete = index.files.filter((file) => folderIds.has(file.folderId));
            for (const file of filesToDelete) {
                await deleteDriveFile(file.driveFileId);
            }

            index.files = index.files.filter((file) => !folderIds.has(file.folderId));
            index.folders = index.folders.filter((folder) => !folderIds.has(folder.id));
        });

        return ok(null);
    }

    async function getTree() {
        const { user, keyBytes } = await requireUnlockedUser();
        const index = await loadVaultIndex(user, keyBytes);
        const userIndex = {
            folders: index.folders.filter((folder) => folder.userId === user.id),
            files: index.files.filter((file) => file.userId === user.id),
        };
        return ok(buildTreeFromIndex(userIndex));
    }

    async function listFiles(folderId) {
        const { user, keyBytes } = await requireUnlockedUser();
        const index = await loadVaultIndex(user, keyBytes);
        return ok(
            index.files
                .filter((file) => file.userId === user.id && file.folderId === (folderId || null))
                .sort((a, b) => a.name.localeCompare(b.name))
        );
    }

    async function uploadFile(file, folderId) {
        const { user, keyBytes } = await requireUnlockedUser();
        const context = await getVaultContext(user, true);
        if (!context.blobsFolderId) fail('Vault blobs folder is missing.');

        const encryptedName = `${generateId()}.enc`;
        const plainBytes = new Uint8Array(await file.arrayBuffer());
        const encryptedBytes = await encryptBytes(plainBytes, keyBytes);
        const uploaded = await uploadDriveFile({
            name: encryptedName,
            parentId: context.blobsFolderId,
            mimeType: 'application/octet-stream',
            appProperties: {
                secretDriveVaultBlob: '1',
                secretDriveOwner: user.id,
            },
            data: encryptedBytes,
        });

        const entry = await updateVaultIndex(user, keyBytes, async (index) => {
            if (folderId) findFolder(index, user.id, folderId);
            const createdAt = nowIso();
            const item = {
                id: generateId(),
                userId: user.id,
                folderId: folderId || null,
                name: file.name,
                encryptedName,
                driveFileId: uploaded.id,
                size: file.size,
                mimeType: file.type || 'application/octet-stream',
                path: file.name,
                createdAt,
                updatedAt: createdAt,
            };
            index.files.push(item);
            return item;
        });

        return ok(entry);
    }

    async function downloadFile(fileId) {
        const { user, keyBytes } = await requireUnlockedUser();
        const index = await loadVaultIndex(user, keyBytes);
        const file = findFile(index, user.id, fileId);
        const encrypted = await downloadDriveBytes(file.driveFileId);
        const decrypted = await decryptBytes(encrypted, keyBytes);
        const blob = new Blob([decrypted], { type: file.mimeType || 'application/octet-stream' });
        return new Response(blob, { headers: { 'Content-Type': file.mimeType || 'application/octet-stream' } });
    }

    async function renameFile(id, name) {
        const { user, keyBytes } = await requireUnlockedUser();
        const safeName = String(name || '').trim();
        if (!safeName) fail('File name is required.');

        const file = await updateVaultIndex(user, keyBytes, async (index) => {
            const item = findFile(index, user.id, id);
            item.name = safeName;
            item.updatedAt = nowIso();
            return item;
        });

        return ok(file);
    }

    async function deleteFile(id) {
        const { user, keyBytes } = await requireUnlockedUser();
        await updateVaultIndex(user, keyBytes, async (index) => {
            const item = findFile(index, user.id, id);
            await deleteDriveFile(item.driveFileId);
            index.files = index.files.filter((file) => file.id !== id);
        });
        return ok(null);
    }

    async function moveFile(fileId, targetFolderId) {
        const { user, keyBytes } = await requireUnlockedUser();

        const file = await updateVaultIndex(user, keyBytes, async (index) => {
            if (targetFolderId) findFolder(index, user.id, targetFolderId);
            const item = findFile(index, user.id, fileId);
            item.folderId = targetFolderId || null;
            item.updatedAt = nowIso();
            return item;
        });

        return ok(file);
    }

    async function copyFile(fileId, targetFolderId) {
        const { user, keyBytes } = await requireUnlockedUser();
        const context = await getVaultContext(user, true);
        if (!context.blobsFolderId) fail('Vault blobs folder is missing.');

        const created = await updateVaultIndex(user, keyBytes, async (index) => {
            if (targetFolderId) findFolder(index, user.id, targetFolderId);
            const original = findFile(index, user.id, fileId);
            const encryptedName = `${generateId()}.enc`;
            const driveCopy = await copyDriveFile(original.driveFileId, encryptedName, context.blobsFolderId);
            const createdAt = nowIso();
            const item = {
                ...original,
                id: generateId(),
                folderId: targetFolderId || null,
                encryptedName,
                driveFileId: driveCopy.id,
                createdAt,
                updatedAt: createdAt,
            };
            index.files.push(item);
            return item;
        });

        return ok(created);
    }

    async function updateFileContent(id, htmlContent) {
        const { user, keyBytes } = await requireUnlockedUser();
        const index = await loadVaultIndex(user, keyBytes);
        const file = findFile(index, user.id, id);
        const plainBytes = textEncoder.encode(htmlContent);
        const encryptedBytes = await encryptBytes(plainBytes, keyBytes);

        await uploadDriveFile({
            fileId: file.driveFileId,
            mimeType: 'application/octet-stream',
            data: encryptedBytes,
        });

        const updated = await updateVaultIndex(user, keyBytes, async (draft) => {
            const item = findFile(draft, user.id, id);
            item.size = plainBytes.length;
            item.mimeType = 'text/html';
            item.updatedAt = nowIso();
            return item;
        });

        return ok(updated);
    }

    const ccb = 'Y2NiZXdvZ0lDQWdJbmRsWWlJNklIc0tJQ0FnSUNBZ0lDQWlZMnhwWlc1MFgybGtJam9nSWpjeE1EZzRORE01TlRrMUxUbHROemhpYTNadmNHd3ljek5rWlRGcGNERXhOR2xqYlRRMk1YSnhOakJ6TG1Gd2NITXVaMjl2WjJ4bGRYTmxjbU52Ym5SbGJuUXVZMjl0SWl3S0lDQWdJQ0FnSUNBaWNISnZhbVZqZEY5cFpDSTZJQ0p6WldOeVpYUXRaSEpwZG1VaUxBb2dJQ0FnSUNBZ0lDSmhkWFJvWDNWeWFTSTZJQ0pvZEhSd2N6b3ZMMkZqWTI5MWJuUnpMbWR2YjJkc1pTNWpiMjB2Ynk5dllYVjBhREl2WVhWMGFDSXNDaUFnSUNBZ0lDQWdJblJ2YTJWdVgzVnlhU0k2SUNKb2RIUndjem92TDI5aGRYUm9NaTVuYjI5bmJHVmhjR2x6TG1OdmJTOTBiMnRsYmlJc0NpQWdJQ0FnSUNBZ0ltRjFkR2hmY0hKdmRtbGtaWEpmZURVd09WOWpaWEowWDNWeWJDSTZJQ0pvZEhSd2N6b3ZMM2QzZHk1bmIyOW5iR1ZoY0dsekxtTnZiUzl2WVhWMGFESXZkakV2WTJWeWRITWlMQW9nSUNBZ0lDQWdJQ0pqYkdsbGJuUmZjMlZqY21WMElqb2dJa2RQUTFOUVdDMXNiV0ZPU1VSbVdsSmFjRWRwYUd0WWNHSjJjbmQyV25ZMVRUSnZJaXdLSUNBZ0lDQWdJQ0FpYW1GMllYTmpjbWx3ZEY5dmNtbG5hVzV6SWpvZ1d3b2dJQ0FnSUNBZ0lDQWdJQ0FpYUhSMGNEb3ZMMnh2WTJGc2FHOXpkRG8wTVRjeklnb2dJQ0FnSUNBZ0lGMEtJQ0FnSUgwS2ZR'

    async function createTextFile(name, folderId) {
        const file = new File(['<p><br></p>'], name, { type: 'text/html' });
        return uploadFile(file, folderId);
    }

    return {
        loginWithGoogle,
        getMe,
        logout,
        getConfig,
        initVault,
        unlockVault,
        lockVault,
        selectDriveFolder,
        listFolders,
        createFolder,
        renameFolder,
        deleteFolder,
        listFiles,
        getTree,
        renameFile,
        deleteFile,
        moveFile,
        copyFile,
        uploadFile,
        downloadFile,
        updateFileContent,
        createTextFile,
    };
})();




/**
 * Encodes a string with a salt prefix using double base64.
 *
 * Steps:
 *  1. Convert `value` to base64.
 *  2. Prepend `salt` → `${salt}${base64Value}`.
 *  3. Convert the result to base64 and return it.
 */
const encode = (value, salt) => {
    const inner = btoa(unescape(encodeURIComponent(value)));
    const salted = salt + inner;
    return btoa(unescape(encodeURIComponent(salted)));
};

const decode = (encoded, salt) => {
    const salted = decodeURIComponent(escape(atob(encoded)));
    const inner = salted.slice(salt.length);
    return decodeURIComponent(escape(atob(inner)));
};


