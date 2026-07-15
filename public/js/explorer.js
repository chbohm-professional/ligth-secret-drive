/**
 * explorer.js — Main coordinator for the file explorer page.
 */
(async () => {
    // Auth guard
    const user = await Auth.requireUnlocked();
    if (!user) return;

    // Show user email
    const emailEl = document.getElementById('userEmail');
    if (emailEl) emailEl.textContent = user.email;

    // ── State ──────────────────────────────────────────────────────────────
    let currentFolderId = null;
    const breadcrumbPath = [{ id: null, name: 'Root' }];

    // ── Initial load ───────────────────────────────────────────────────────
    await Folders.loadTree();
    await Files.loadFiles(null);

    Folders.setOnSelect(async (folderId) => {
        currentFolderId = folderId;
        // Update breadcrumb from tree
        buildBreadcrumb(folderId);
        await Files.loadFiles(folderId);
        status('');
    });

    // ── Breadcrumb ─────────────────────────────────────────────────────────
    function buildBreadcrumb(targetId) {
        const crumbEl = document.getElementById('breadcrumb');
        if (!crumbEl) return;
        const tree = Folders.getTree();
        const path = [{ id: null, name: 'Inicio' }];
        findPath(tree, targetId, path);
        crumbEl.innerHTML = path.map((p, i) => {
            const isLast = i === path.length - 1;
            return `${i > 0 ? '<span class="breadcrumb-sep">/</span>' : ''}
                <span class="breadcrumb-item ${isLast ? 'active' : ''}" data-id="${p.id === null ? 'null' : p.id}">${p.name}</span>`;
        }).join('');
        crumbEl.querySelectorAll('.breadcrumb-item:not(.active)').forEach(el => {
            el.addEventListener('click', () => {
                const id = el.dataset.id === 'null' ? null : el.dataset.id;
                Folders.selectFolder(id);
            });
        });
    }

    function findPath(node, targetId, path) {
        if (node.id === targetId) return true;
        for (const sub of (node.subfolders || [])) {
            path.push({ id: sub.id, name: sub.name });
            if (findPath(sub, targetId, path)) return true;
            path.pop();
        }
        return false;
    }

    // ── Toolbar buttons ────────────────────────────────────────────────────
    document.getElementById('btnFolders')?.addEventListener('click', async () => {
        const tree = Folders.getTree();
        const targetId = await Dialogs.pickFolder('Seleccionar carpeta', tree, currentFolderId);
        if (targetId === undefined) return;
        currentFolderId = targetId;
        Folders.selectFolder(targetId);
    });

    document.getElementById('btnUpload')?.addEventListener('click', () => {
        document.getElementById('fileInput').click();
    });

    document.getElementById('fileInput')?.addEventListener('change', async (e) => {
        const files = [...e.target.files];
        if (files.length === 0) return;
        const uploaded = await Upload.uploadFiles(files, currentFolderId);
        if (uploaded > 0) await Files.loadFiles(currentFolderId);
        e.target.value = '';
    });

    document.getElementById('btnNewFolder')?.addEventListener('click', async () => {
        const name = await Dialogs.prompt('Nueva carpeta', 'Nombre de carpeta', 'Nueva carpeta');
        if (!name) return;
        try {
            await Folders.createFolder(currentFolderId, name);
            status(`Carpeta "${name}" creada.`);
        } catch (err) { alert(err.message); }
    });

    document.getElementById('btnNewDoc')?.addEventListener('click', async () => {
        const name = await Dialogs.prompt('Nuevo documento', 'Nombre del documento', 'Untitled.html');
        if (!name) return;
        try {
            const res = await API.createTextFile(name, currentFolderId);
            await Files.loadFiles(currentFolderId);
            openInEditor(res.data.id, res.data.name);
        } catch (err) { alert(err.message); }
    });

    document.getElementById('btnDownload')?.addEventListener('click', () => Files.downloadSelected());
    document.getElementById('btnDelete')?.addEventListener('click', () => Files.deleteSelected());

    document.getElementById('btnLock')?.addEventListener('click', async () => {
        try { await API.lockVault(); } catch {}
        window.location.href = '/unlock.html';
    });

    document.getElementById('btnLogout')?.addEventListener('click', async () => {
        try { await API.logout(); } catch {}
        window.location.href = '/login.html';
    });

    // ── Context menu ───────────────────────────────────────────────────────
    document.addEventListener('click', () => {
        document.getElementById('contextMenu').style.display = 'none';
    });

    document.getElementById('contextMenu')?.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        document.getElementById('contextMenu').style.display = 'none';
        if (action === 'open') Files.openSelected();
        if (action === 'download') Files.downloadSelected();
        if (action === 'delete') Files.deleteSelected();
        if (action === 'rename') Files.renameSelected();
        if (action === 'move') Files.moveSelected();
        if (action === 'copy') Files.copySelected();
    });

    // ── Drag-and-drop upload ───────────────────────────────────────────────
    Upload.bindDropZone(document.getElementById('content'), async (files) => {
        const uploaded = await Upload.uploadFiles(files, currentFolderId);
        if (uploaded > 0) await Files.loadFiles(currentFolderId);
    });

    // ── Helpers ────────────────────────────────────────────────────────────
    function openInEditor(id, name) {
        window.location.href = `/editor.html?id=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}`;
    }

    function status(msg) {
        const el = document.getElementById('statusText');
        if (el) el.textContent = msg || 'Listo';
    }
})();
