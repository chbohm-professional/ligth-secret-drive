/**
 * editor.js — WYSIWYG rich-text editor with encrypted auto-save.
 *
 * Auto-saves every 5 seconds when the document is dirty.
 * Manual save: Ctrl+S or the "Save" button.
 */
(async () => {
    const user = await Auth.requireUnlocked();
    if (!user) return;

    // ── URL params ──────────────────────────────────────────────────────
    const params = new URLSearchParams(window.location.search);
    const fileId   = params.get('id');
    const fileName = params.get('name') || 'Untitled';

    if (!fileId) { window.location.href = '/explorer.html'; return; }

    // ── DOM refs ────────────────────────────────────────────────────────
    const paper      = document.getElementById('editorContent');
    const statusEl   = document.getElementById('saveStatus');
    const nameEl     = document.getElementById('editorFilename');
    const wordEl     = document.getElementById('wordCount');
    const charEl     = document.getElementById('charCount');

    nameEl.textContent = fileName;
    document.title     = `${fileName} — Carpeta cifrada`;

    // ── Load content ────────────────────────────────────────────────────
    try {
        const res  = await API.downloadFile(fileId);
        const text = await res.text();
        paper.innerHTML = text.trim() ? text : '<p><br></p>';
    } catch {
        paper.innerHTML = '<p><br></p>';
    }
    paper.focus();
    placeCaretAtEnd(paper);

    // ── Auto-save state ─────────────────────────────────────────────────
    let isDirty          = false;
    let isSaving         = false;
    let lastSaved        = paper.innerHTML;
    const AUTOSAVE_MS    = 5000;

    function setStatus(msg, cls = '') {
        statusEl.textContent      = msg;
        statusEl.className        = `save-status ${cls}`;
    }

    async function save() {
        if (!isDirty || isSaving) return;
        const content = paper.innerHTML;
        if (content === lastSaved) { isDirty = false; return; }

        isSaving = true;
        setStatus('💾 Guardando…', 'saving');
        try {
            await API.updateFileContent(fileId, content);
            lastSaved = content;
            isDirty   = false;
            setStatus('✓ Guardado', 'saved');
            setTimeout(() => { if (!isDirty) setStatus(''); }, 2500);
        } catch (err) {
            setStatus('⚠ Error al guardar — ' + err.message, 'error');
        } finally {
            isSaving = false;
        }
    }

    setInterval(save, AUTOSAVE_MS);

    // Save before leaving page
    window.addEventListener('beforeunload', (e) => {
        if (isDirty) {
            save();
            e.preventDefault();
            e.returnValue = '';
        }
    });

    // ── Input events ────────────────────────────────────────────────────
    paper.addEventListener('input', () => {
        isDirty = true;
        updateCounts();
        updateToolbarState();
    });

    paper.addEventListener('keyup', updateToolbarState);
    paper.addEventListener('mouseup', updateToolbarState);
    document.addEventListener('selectionchange', updateToolbarState);

    // ── Keyboard shortcuts ───────────────────────────────────────────────
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
    });

    // Ctrl+B / Ctrl+I / Ctrl+U already handled by browser via contenteditable

    // ── Toolbar buttons ──────────────────────────────────────────────────
    document.querySelectorAll('.fmt-btn[data-cmd]').forEach(btn => {
        btn.addEventListener('mousedown', (e) => {
            e.preventDefault(); // keep focus in editor
            document.execCommand(btn.dataset.cmd, false, null);
            updateToolbarState();
        });
    });

    document.getElementById('headingSelect').addEventListener('change', (e) => {
        e.preventDefault();
        document.execCommand('formatBlock', false, e.target.value || 'p');
        paper.focus();
        updateToolbarState();
    });

    document.getElementById('btnInsertLink')?.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const url = window.prompt('Enter URL:', 'https://');
        if (url) document.execCommand('createLink', false, url);
        paper.focus();
    });

    document.getElementById('btnInsertHr')?.addEventListener('mousedown', (e) => {
        e.preventDefault();
        document.execCommand('insertHorizontalRule', false, null);
        paper.focus();
    });

    document.getElementById('btnSaveNow')?.addEventListener('click', () => {
        isDirty = true; // force save
        save();
    });

    // ── Paste: strip dangerous HTML, keep basic formatting ───────────────
    paper.addEventListener('paste', (e) => {
        e.preventDefault();
        const html  = e.clipboardData.getData('text/html');
        const plain = e.clipboardData.getData('text/plain');

        if (html) {
            const clean = sanitizePastedHtml(html);
            document.execCommand('insertHTML', false, clean);
        } else if (plain) {
            document.execCommand('insertText', false, plain);
        }
    });

    // ── Toolbar active state ─────────────────────────────────────────────
    function updateToolbarState() {
        const cmds = ['bold', 'italic', 'underline', 'strikeThrough',
                      'insertUnorderedList', 'insertOrderedList',
                      'justifyLeft', 'justifyCenter', 'justifyRight'];
        cmds.forEach(cmd => {
            const btn = document.querySelector(`.fmt-btn[data-cmd="${cmd}"]`);
            if (btn) btn.classList.toggle('active', document.queryCommandState(cmd));
        });

        // Update heading select
        const block = document.queryCommandValue('formatBlock').toLowerCase();
        const sel   = document.getElementById('headingSelect');
        const map   = { h1: 'h1', h2: 'h2', h3: 'h3', pre: 'pre', blockquote: 'blockquote' };
        sel.value = map[block] || 'p';
    }

    // ── Word / char count ────────────────────────────────────────────────
    function updateCounts() {
        const text  = paper.innerText || '';
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        const chars = text.replace(/\n/g, '').length;
        wordEl.textContent = `${words} word${words !== 1 ? 's' : ''}`;
        charEl.textContent = `${chars} char${chars !== 1 ? 's' : ''}`;
    }

    updateCounts();
    updateToolbarState();

    // ── Helpers ──────────────────────────────────────────────────────────
    function placeCaretAtEnd(el) {
        el.focus();
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }

    function sanitizePastedHtml(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        // Remove scripts, styles, and dangerous attributes
        div.querySelectorAll('script, style, meta, link').forEach(el => el.remove());
        div.querySelectorAll('*').forEach(el => {
            ['onclick', 'onerror', 'onload', 'style'].forEach(attr => el.removeAttribute(attr));
        });
        return div.innerHTML;
    }
})();
