/**
 * upload.js — File upload with progress indicator.
 */
const Upload = (() => {
    async function uploadFiles(fileList, folderId) {
        const status = document.getElementById('statusText');
        const total = fileList.length;
        let done = 0;

        for (const file of fileList) {
            if (status) status.textContent = `Subiendo ${file.name}… (${done + 1}/${total})`;
            try {
                await API.uploadFile(file, folderId);
                done++;
            } catch (err) {
                alert(`Error al subir "${file.name}": ${err.message}`);
            }
        }

        if (status) status.textContent = done === total
            ? `${done} archivo${done === 1 ? '' : 's'} subido${done === 1 ? '' : 's'} correctamente.`
            : `${done}/${total} archivos subidos.`;

        return done;
    }

    function bindDropZone(element, onDrop) {
        element.addEventListener('dragover', (e) => { e.preventDefault(); element.classList.add('drag-over'); });
        element.addEventListener('dragleave', () => element.classList.remove('drag-over'));
        element.addEventListener('drop', (e) => {
            e.preventDefault();
            element.classList.remove('drag-over');
            const files = [...e.dataTransfer.files];
            if (files.length > 0) onDrop(files);
        });
    }

    return { uploadFiles, bindDropZone };
})();
