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

    function open(title, bodyHtml, footerHtml) {
        titleEl.textContent = title;
        bodyEl.innerHTML = bodyHtml;
        footerEl.innerHTML = footerHtml;
        overlay.style.display = 'flex';
        return new Promise((resolve) => { _resolveClose = resolve; });
    }

    function close(value) {
        overlay.style.display = 'none';
        if (_resolveClose) { _resolveClose(value); _resolveClose = null; }
    }

    closeBtn?.addEventListener('click', () => close(null));
    overlay?.addEventListener('click', (e) => { if (e.target === overlay) close(null); });

    /** Prompt dialog — returns the entered string or null */
    async function prompt(title, label, defaultValue = '') {
        const html = `<div class="form-group"><label>${label}</label>
            <input type="text" id="dlgInput" value="${defaultValue}" style="width:100%"></div>`;
        const footer = `<button class="btn-secondary" onclick="Dialogs.close(null)">Cancel</button>
            <button class="btn-confirm" id="dlgOk">OK</button>`;

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
        const footer = `<button class="btn-secondary" onclick="Dialogs.close(false)">Cancel</button>
            <button class="btn-confirm" style="background:var(--danger)" onclick="Dialogs.close(true)">Delete</button>`;
        return open(title, `<p>${message}</p>`, footer);
    }

    /** Folder picker — returns folderId or null */
    async function pickFolder(title, tree, currentFolderId) {
        const items = flattenFolders(tree, 0);
        const listHtml = `<div class="folder-picker" id="folderPickerList">
            <div class="folder-picker-item ${!currentFolderId ? 'selected' : ''}" data-id="">
                📁 Root
            </div>
            ${items.map(f => `<div class="folder-picker-item ${f.id === currentFolderId ? 'selected' : ''}" data-id="${f.id}">
                ${'&nbsp;'.repeat(f.depth * 4)}📁 ${f.name}
            </div>`).join('')}
        </div>`;
        const footer = `<button class="btn-secondary" onclick="Dialogs.close(null)">Cancel</button>
            <button class="btn-confirm" id="dlgPickOk">Select</button>`;

        open(title, listHtml, footer);

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
            _resolveClose = (v) => resolve(v);
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
