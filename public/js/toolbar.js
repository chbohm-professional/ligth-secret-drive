const btnBurger = document.getElementById("btnBurger");
const toolbarOverlay = document.getElementById("toolbarOverlay");
const toolbarClose = document.getElementById("toolbarClose");

btnBurger.addEventListener("click", () => {
    toolbarOverlay.style.display = "flex";
});

toolbarClose.addEventListener("click", () => {
    toolbarOverlay.style.display = "none";
});

toolbarOverlay.addEventListener("click", (e) => {
    if (e.target === toolbarOverlay) {
        toolbarOverlay.style.display = "none";
    }
});

// Cerrar menú al seleccionar una opción
document.querySelectorAll(".toolbar-dialog-body .toolbar-btn")
    .forEach(button => {
        button.addEventListener("click", () => {
            toolbarOverlay.style.display = "none";
        });
    });