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
        const res = await API.listFiles(folderId);
        _files = res.data;
        renderFiles();
        updateToolbar();
        return _files;
    }

    function renderFiles() {
        const tbody = document.getElementById('fileList');
        if (!tbody) return;

        if (_files.length === 0) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="5">This folder is empty</td></tr>';
            return;
        }

        tbody.innerHTML = _files.map(f => `
            <tr class="file-row ${_selected.has(f.id) ? 'selected' : ''}"
                data-id="${f.id}" data-name="${escHtml(f.name)}"
                data-type="file" draggable="true">
                <td class="col-check"><input type="checkbox" data-id="${f.id}" ${_selected.has(f.id) ? 'checked' : ''}></td>
                <td class="col-name"><div class="file-name-cell">
                    <span class="file-icon">${fileIcon(f.mimeType, f.name)}</span>
                    <span>${escHtml(f.name)}</span>
                </div></td>
                <td class="col-size">${formatSize(f.size)}</td>
                <td class="col-date">${formatDate(f.createdAt)}</td>
                <td class="col-type">${fileType(f.mimeType, f.name)}</td>
            </tr>`).join('');

        // Events
        tbody.querySelectorAll('.file-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.type === 'checkbox') return;
                if (e.ctrlKey || e.metaKey) {
                    toggleSelect(row.dataset.id);
                } else {
                    _selected.clear();
                    toggleSelect(row.dataset.id);
                }
                renderFiles();
                updateToolbar();
            });
            row.querySelector('input[type=checkbox]').addEventListener('change', (e) => {
                if (e.target.checked) _selected.add(row.dataset.id);
                else _selected.delete(row.dataset.id);
                updateToolbar();
            });
            row.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (!_selected.has(row.dataset.id)) {
                    _selected.clear();
                    _selected.add(row.dataset.id);
                    renderFiles();
                }
                showContextMenu(e.clientX, e.clientY);
            });
            row.addEventListener('dblclick', () => {
                const file = _files.find(f => f.id === row.dataset.id);
                if (!file) return;
                if (isEditableFile(file)) {
                    window.location.href = `/editor.html?id=${encodeURIComponent(file.id)}&name=${encodeURIComponent(file.name)}`;
                } else {
                    downloadSelected();
                }
            });
        });

        document.getElementById('selectAll').checked = false;
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
        if (info) info.textContent = count > 0 ? `${count} item(s) selected` : '';
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
                alert(`Download failed: ${err.message}`);
            }
        }
    }

    async function deleteSelected() {
        if (_selected.size === 0) return;
        const ok = await Dialogs.confirm('Delete Files', `Delete ${_selected.size} item(s)? This cannot be undone.`);
        if (!ok) return;
        for (const id of [..._selected]) {
            try {
                await API.deleteFile(id);
                _files = _files.filter(f => f.id !== id);
                _selected.delete(id);
            } catch (err) {
                alert(`Error deleting file: ${err.message}`);
            }
        }
        renderFiles();
        updateToolbar();
        status('Items deleted.');
    }

    async function renameSelected() {
        if (_selected.size !== 1) return;
        const [id] = [..._selected];
        const file = _files.find(f => f.id === id);
        const newName = await Dialogs.prompt('Rename', 'New name', file.name);
        if (!newName || newName === file.name) return;
        try {
            await API.renameFile(id, newName);
            await loadFiles(_currentFolderId);
        } catch (err) { alert(err.message); }
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
        const targetId = await Dialogs.pickFolder('Copy to…', tree, _currentFolderId);
        if (targetId === undefined) return;
        try {
            await API.copyFile(id, targetId);
            await loadFiles(_currentFolderId);
        } catch (err) { alert(err.message); }
    }

    function status(msg) {
        const el = document.getElementById('statusText');
        if (el) el.textContent = msg;
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

    return { loadFiles, downloadSelected, deleteSelected, renameSelected, moveSelected, copySelected, getSelected: () => _selected };
})();
