/**
 * dialogs.js — Reusable modal dialogs.
 */
const Dialogs = (() => {
    const overlay = document.getElementById('modalOverlay');
    const modal = document.getElementById('modal');
    const titleEl = document.getElementById('modalTitle');
    const bodyEl = document.getElementById('modalBody');
    const footerEl = document.getElementById('modalFooter');
    const closeBtn = document.getElementById('modalClose');

    let _resolveClose = null;
    let _cancelValue = null;

    function open(title, bodyHtml, footerHtml, options = {}) {
        titleEl.textContent = title;
        bodyEl.innerHTML = bodyHtml;
        footerEl.innerHTML = footerHtml;
        overlay.style.display = 'flex';
        _cancelValue = options.cancelValue === undefined ? null : options.cancelValue;
        return new Promise((resolve) => { _resolveClose = resolve; });
    }

    function close(value) {
        overlay.style.display = 'none';
        const resolved = value === undefined ? _cancelValue : value;
        if (_resolveClose) { _resolveClose(resolved); _resolveClose = null; }
    }

    closeBtn?.addEventListener('click', () => close(undefined));
    overlay?.addEventListener('click', (e) => { if (e.target === overlay) close(undefined); });

    /** Prompt dialog — returns the entered string or null */
    async function prompt(title, label, defaultValue = '') {
        const html = `<div class="form-group"><label>${label}</label>
            <input type="text" id="dlgInput" value="${defaultValue}" style="width:100%"></div>`;
        const footer = `<button class="btn-secondary" onclick="Dialogs.close(null)">Cancelar</button>
            <button class="btn-confirm" id="dlgOk">Aceptar</button>`;

        open(title, html, footer);
        const input = document.getElementById('dlgInput');
        input.focus(); input.select();

        return new Promise((resolve) => {
            document.getElementById('dlgOk').onclick = () => {
                const val = input.value.trim();
                close(val || null);
                resolve(val || null);
            };
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { document.getElementById('dlgOk').click(); }
                if (e.key === 'Escape') { close(null); resolve(null); }
            });
            _resolveClose = (v) => resolve(v);
        });
    }

    /** Confirm dialog — returns true/false */
    async function confirm(title, message) {
        const footer = `<button class="btn-secondary" onclick="Dialogs.close(false)">Cancelar</button>
            <button class="btn-confirm" style="background:var(--danger)" onclick="Dialogs.close(true)">Eliminar</button>`;
        return open(title, `<p>${message}</p>`, footer);
    }

    /** Folder picker — returns folderId or null */
    async function pickFolder(title, tree, currentFolderId) {
        function renderNode(node, depth) {
            const id = node.id === null ? '' : node.id;
            const isSelected = node.id === currentFolderId;
            const indent = depth * 16;
            const name = node.id === null ? 'Inicio' : node.name;
            const children = (node.subfolders || []).map((child) => renderNode(child, depth + 1)).join('');
            return `<div class="folder-picker-item ${isSelected ? 'selected' : ''}" data-id="${id}" style="padding-left:${12 + indent}px">
                <span class="folder-picker-icon">📁</span>
                <span class="folder-picker-label">${escHtml(name)}</span>
            </div>${children}`;
        }

        const listHtml = `<div class="folder-picker" id="folderPickerList">
            ${renderNode(tree, 0)}
        </div>`;
        const footer = `<button class="btn-secondary" onclick="Dialogs.close(undefined)">Cancelar</button>
            <button class="btn-confirm" id="dlgPickOk">Seleccionar</button>`;

        open(title, listHtml, footer, { cancelValue: undefined });

        let selected = currentFolderId || null;
        document.querySelectorAll('.folder-picker-item').forEach(el => {
            el.addEventListener('click', () => {
                document.querySelectorAll('.folder-picker-item').forEach(x => x.classList.remove('selected'));
                el.classList.add('selected');
                selected = el.dataset.id || null;
            });
        });

        return new Promise((resolve) => {
            document.getElementById('dlgPickOk').onclick = () => { close(selected); resolve(selected); };
            const previousResolve = _resolveClose;
            _resolveClose = (v) => {
                resolve(v);
                if (previousResolve) previousResolve(v);
            };
        });
    }

    function flattenFolders(node, depth) {
        const result = [];
        for (const f of (node.subfolders || [])) {
            result.push({ id: f.id, name: f.name, depth });
            result.push(...flattenFolders(f, depth + 1));
        }
        return result;
    }

    return { open, close, prompt, confirm, pickFolder };
})();
