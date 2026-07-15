/**
 * folders.js — Folder tree rendering and interaction.
 */
const Folders = (() => {
    let _tree = null;
    let _selectedId = null;
    let _onSelect = null;

    function setOnSelect(fn) { _onSelect = fn; }

    async function loadTree() {
        const res = await API.getTree();
        _tree = res.data;
        renderTree();
        return _tree;
    }

    function getTree() { return _tree; }
    function getSelectedId() { return _selectedId; }

    function renderTree() {
        const container = document.getElementById('folderTree');
        if (!container || !_tree) return;
        container.innerHTML = renderNode(_tree, 0);
        container.querySelectorAll('.tree-item').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = el.dataset.id === 'null' ? null : el.dataset.id;
                selectFolder(id);
            });
        });
    }

    function renderNode(node, depth) {
        const id = node.id === null ? 'null' : node.id;
        const isSelected = (node.id === null ? null : node.id) === _selectedId;
        const indent = depth * 16;

        const children = (node.subfolders || []).map(f => renderNode(f, depth + 1)).join('');
        const hasChildren = node.subfolders && node.subfolders.length > 0;

        return `<div>
            <div class="tree-item ${isSelected ? 'selected' : ''}" data-id="${id}" style="padding-left:${8 + indent}px">
                <span class="tree-toggle">${hasChildren ? '▶' : ' '}</span>
                <span class="tree-icon">📁</span>
                <span class="tree-label">${escHtml(node.name)}</span>
            </div>
            <div class="tree-children" data-parent="${id}" style="${hasChildren ? '' : 'display:none'}">${children}</div>
        </div>`;
    }

    function selectFolder(id) {
        _selectedId = id;
        renderTree();
        if (_onSelect) _onSelect(id);
    }

    async function createFolder(parentId, name) {
        const res = await API.createFolder(name, parentId);
        await loadTree();
        return res.data;
    }

    async function renameFolder(id, newName) {
        await API.renameFolder(id, newName);
        await loadTree();
    }

    async function deleteFolder(id) {
        await API.deleteFolder(id);
        if (_selectedId === id) selectFolder(null);
        await loadTree();
    }

    function escHtml(str) {
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    return { loadTree, renderTree, getTree, getSelectedId, selectFolder, setOnSelect, createFolder, renameFolder, deleteFolder };
})();
