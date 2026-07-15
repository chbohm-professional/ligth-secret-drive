/**
 * files.js — File list rendering and operations.
 */
const Files = (() => {
    let _files = [];
    let _selected = new Set();
    let _currentFolderId = null;

    async function loadFiles(folderId) {
        _currentFolderId = folderId;
        _selected.clear();
        const [foldersRes, filesRes] = await Promise.all([
            API.listFolders(folderId),
            API.listFiles(folderId),
        ]);
        const folders = foldersRes.data.map(f => ({ ...f, type: 'folder' }));
        const files = filesRes.data.map(f => ({ ...f, type: 'file' }));
        _files = [...folders, ...files].sort((a, b) => {
            if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
        renderFiles();
        updateToolbar();
        return _files;
    }

    function renderFiles() {
        const list = document.getElementById('fileList');
        if (!list) return;

        if (_files.length === 0) {
            list.innerHTML = '<div class="empty-row">Esta carpeta está vacía</div>';
            return;
        }

        list.innerHTML = _files.map(item => {
            const selectedClass = _selected.has(item.id) ? 'selected' : '';
            const isFolder = item.type === 'folder';
            const sizeLabel = isFolder ? `${getFolderCount(item.id)} elem.` : formatSize(item.size);
            const dateLabel = formatDate(item.updatedAt || item.createdAt);
            const icon = isFolder ? '📁' : fileIcon(item.mimeType, item.name);
            return `<div class="file-item ${selectedClass}" data-id="${item.id}" data-type="${item.type}" data-name="${escHtml(item.name)}" draggable="true">
                <div class="file-item-icon">${icon}</div>
                <div class="file-item-name">
                    <span>${escHtml(item.name)}</span>
                </div>
                <div class="file-item-size">${sizeLabel}</div>
                <div class="file-item-date">${dateLabel}</div>
                <button type="button" class="file-action-button" aria-label="Más opciones">⋮</button>
            </div>`;
        }).join('');

        list.querySelectorAll('.file-item').forEach(item => {
            const id = item.dataset.id;
            const type = item.dataset.type;
            const actionButton = item.querySelector('.file-action-button');
            let longPressTimer = null;

            const selectItem = (toggle = false) => {
                if (toggle) {
                    toggleSelect(id);
                } else {
                    _selected.clear();
                    _selected.add(id);
                }
                renderFiles();
                updateToolbar();
            };

            const openItem = () => {
                const entry = _files.find(f => f.id === id);
                if (!entry) return;
                if (entry.type === 'folder') {
                    Folders.selectFolder(entry.id);
                } else {
                    if (isEditableFile(entry)) {
                        window.location.href = `/editor.html?id=${encodeURIComponent(entry.id)}&name=${encodeURIComponent(entry.name)}`;
                    } else {
                        _selected.clear();
                        _selected.add(entry.id);
                        downloadSelected();
                    }
                }
            };

            item.addEventListener('click', (e) => {
                if (e.target === actionButton) return;
                if (e.ctrlKey || e.metaKey) {
                    selectItem(true);
                } else {
                    selectItem(false);
                }
            });

            item.addEventListener('dblclick', () => openItem());

            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (!_selected.has(id)) {
                    _selected.clear();
                    _selected.add(id);
                    renderFiles();
                }
                showContextMenu(e.clientX, e.clientY);
            });

            item.addEventListener('touchstart', () => {
                longPressTimer = window.setTimeout(() => {
                    toggleSelect(id);
                    renderFiles();
                    updateToolbar();
                }, 550);
            });
            item.addEventListener('touchend', () => {
                if (longPressTimer) window.clearTimeout(longPressTimer);
            });
            item.addEventListener('touchcancel', () => {
                if (longPressTimer) window.clearTimeout(longPressTimer);
            });

            actionButton?.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!_selected.has(id)) {
                    _selected.clear();
                    _selected.add(id);
                    renderFiles();
                    updateToolbar();
                }
                const rect = actionButton.getBoundingClientRect();
                showContextMenu(rect.right - 8, rect.bottom + 4);
            });
        });
    }

    function getFolderCount(folderId) {
        const tree = Folders.getTree();
        if (!tree) return 0;
        const node = findFolderNode(tree, folderId);
        return node ? ((node.subfolders?.length || 0) + (node.files?.length || 0)) : 0;
    }

    function findFolderNode(node, targetId) {
        if ((node.id === null ? null : node.id) === targetId) return node;
        for (const child of (node.subfolders || [])) {
            const found = findFolderNode(child, targetId);
            if (found) return found;
        }
        return null;
    }

    function toggleSelect(id) {
        if (_selected.has(id)) _selected.delete(id);
        else _selected.add(id);
    }

    function updateToolbar() {
        const count = _selected.size;
        const dlBtn = document.getElementById('btnDownload');
        const delBtn = document.getElementById('btnDelete');
        if (dlBtn) dlBtn.disabled = count === 0;
        if (delBtn) delBtn.disabled = count === 0;
        const info = document.getElementById('selectionInfo');
        if (info) info.textContent = count > 0 ? `${count} elemento${count === 1 ? '' : 's'} seleccionado${count === 1 ? '' : 's'}` : '';
    }

    function showContextMenu(x, y) {
        const menu = document.getElementById('contextMenu');
        menu.style.display = 'block';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
    }

    async function downloadSelected() {
        for (const id of _selected) {
            const file = _files.find(f => f.id === id);
            if (!file) continue;
            try {
                const res = await API.downloadFile(id);
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = file.name; a.click();
                setTimeout(() => URL.revokeObjectURL(url), 3000);
            } catch (err) {
                alert(`Error al descargar: ${err.message}`);
            }
        }
    }

    async function deleteSelected() {
        if (_selected.size === 0) return;
        const ok = await Dialogs.confirm('Eliminar archivos', `Eliminar ${_selected.size} elemento(s)? Esto no se puede deshacer.`);
        if (!ok) return;
        for (const id of [..._selected]) {
            try {
                await API.deleteFile(id);
                _files = _files.filter(f => f.id !== id);
                _selected.delete(id);
            } catch (err) {
                alert(`Error eliminando archivo: ${err.message}`);
            }
        }
        renderFiles();
        updateToolbar();
        status('Elementos eliminados.');
    }

    async function renameSelected() {
        if (_selected.size !== 1) return;
        const [id] = [..._selected];
        const file = _files.find(f => f.id === id);
        const newName = await Dialogs.prompt('Cambiar nombre', 'Nuevo nombre', file.name);
        if (!newName || newName === file.name) return;
        try {
            await API.renameFile(id, newName);
            await loadFiles(_currentFolderId);
        } catch (err) { alert(`Error al renombrar: ${err.message}`); }
    }

    async function moveSelected() {
        if (_selected.size !== 1) return;
        const [id] = [..._selected];
        const tree = Folders.getTree();
        const targetId = await Dialogs.pickFolder('Move to…', tree, _currentFolderId);
        if (targetId === undefined) return; // cancelled
        try {
            await API.moveFile(id, targetId);
            await loadFiles(_currentFolderId);
        } catch (err) { alert(err.message); }
    }

    async function copySelected() {
        if (_selected.size !== 1) return;
        const [id] = [..._selected];
        const tree = Folders.getTree();
        const targetId = await Dialogs.pickFolder('Copiar a…', tree, _currentFolderId);
        if (targetId === undefined) return;
        try {
            await API.copyFile(id, targetId);
            await loadFiles(_currentFolderId);
        } catch (err) { alert(`Error al copiar: ${err.message}`); }
    }

    function status(msg) {
        const el = document.getElementById('statusText');
        if (el) el.textContent = msg;
    }

    async function openSelected() {
        if (_selected.size !== 1) return;
        const [id] = [..._selected];
        const entry = _files.find(f => f.id === id);
        if (!entry) return;
        if (entry.type === 'folder') {
            Folders.selectFolder(entry.id);
        } else {
            if (isEditableFile(entry)) {
                window.location.href = `/editor.html?id=${encodeURIComponent(entry.id)}&name=${encodeURIComponent(entry.name)}`;
            } else {
                downloadSelected();
            }
        }
    }

    // Helpers
    function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    function formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const units = ['B','KB','MB','GB','TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
    }

    function formatDate(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function fileIcon(mimeType, name) {
        if (!mimeType) { const ext = name.split('.').pop().toLowerCase(); return extIcon(ext); }
        if (mimeType.startsWith('image/')) return '🖼️';
        if (mimeType.startsWith('video/')) return '🎬';
        if (mimeType.startsWith('audio/')) return '🎵';
        if (mimeType.includes('pdf')) return '📄';
        if (mimeType.includes('zip') || mimeType.includes('compressed')) return '🗜️';
        return '📄';
    }

    function extIcon(ext) {
        const map = { pdf:'📄', doc:'📝', docx:'📝', xls:'📊', xlsx:'📊', ppt:'📋', pptx:'📋',
            jpg:'🖼️', jpeg:'🖼️', png:'🖼️', gif:'🖼️', mp4:'🎬', mov:'🎬', mp3:'🎵',
            zip:'🗜️', rar:'🗜️', tar:'🗜️', gz:'🗜️', js:'📦', ts:'📦', json:'📦' };
        return map[ext] || '📄';
    }

    function fileType(mimeType, name) {
        if (!mimeType) return name.split('.').pop().toUpperCase() || 'File';
        const parts = mimeType.split('/');
        return parts[parts.length - 1].toUpperCase();
    }

    function isEditableFile(file) {
        const editableExts  = ['html', 'htm', 'txt', 'md', 'csv', 'json', 'xml', 'log'];
        const editableMime  = ['text/'];
        const ext = file.name.split('.').pop().toLowerCase();
        if (editableExts.includes(ext)) return true;
        if (file.mimeType && editableMime.some(m => file.mimeType.startsWith(m))) return true;
        return false;
    }

    return { loadFiles, downloadSelected, deleteSelected, renameSelected, moveSelected, copySelected, openSelected, getSelected: () => _selected };
})();
