// Espejo interactivo

const socket = io();

// Exponemos el socket globalmente para que welcome.js pueda emitir eventos
window.mirrorSocket = socket;

const connectionDot = document.getElementById('connectionDot');
const connectionBadge = document.getElementById('connectionBadge');

socket.on('connect', () => {
    connectionDot.classList.add('online');
    connectionDot.classList.remove('offline');
    connectionBadge.textContent = 'Conectado';
    connectionBadge.classList.add('badge-connected');
    connectionBadge.classList.remove('badge-disconnected');

    // Si ya teníamos usuario activo y el servidor se reinició, recargar prendas
    if (window.currentUser && typeof window.cargarPrendasUsuario === 'function') {
        window.cargarPrendasUsuario(window.currentUser);
    }
});

socket.on('disconnect', () => {
    connectionDot.classList.remove('online');
    connectionDot.classList.add('offline');
    connectionBadge.textContent = 'Desconectado';
    connectionBadge.classList.remove('badge-connected');
    connectionBadge.classList.add('badge-disconnected');
});

// Variable para evitar doble arranque
let mainMirrorActivo = false;
// Sistema de Inactividad (Recordatorio de Voz)
let idleTimer = null;

window.resetIdleTimer = function () {
    if (idleTimer) clearTimeout(idleTimer);

    const infoBtn = document.getElementById('info-btn');
    const infoMsg = document.getElementById('info-voice-msg');

    // Restaurar estado normal
    if (infoBtn) infoBtn.classList.remove('illuminated');
    if (infoMsg) {
        infoMsg.classList.remove('highlight');
        infoMsg.textContent = 'activa la voz';
    }

    // Si estamos en el probador, programar aviso para dentro de 20s (se ilumina el boton de info)
    if (typeof window.currentView !== 'undefined' && window.currentView === 'outfit') {
        idleTimer = setTimeout(() => {
            if (infoBtn) infoBtn.classList.add('illuminated');
            if (infoMsg) {
                infoMsg.classList.add('highlight');
                infoMsg.textContent = 'activa la voz, di info';
            }
        }, 20000);
    }
}

// Inicializar el espejo de fondo
async function initMainMirror() {
    if (mainMirrorActivo) return; // evitar doble arranque

    const bgVideo = document.getElementById('mainMirrorVideo');
    if (!bgVideo) return;

    // Pedimos acceso a la webcam
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
            audio: false,
        });
        bgVideo.srcObject = stream;
        mainMirrorActivo = true;
        console.log('Espejo de fondo iniciado');
    } catch (err) {
        console.error('❌ No se pudo acceder a la cámara para el espejo de fondo:', err);
        // Fallo silencioso, el fondo queda oscuro, la interfaz sigue funcionando
    }
}

// Exponemos para que welcome.js lo llame al completar el login
window.initMainMirror = initMainMirror;

// Función centralizada para cambiar la vista (y los paneles laterales)
// mostrar panel de detalles para borrar outfits, limpiar selección y la lógica de la sección de tiempo y recomendaciones
window.currentView = 'armario';

window.activarVista = function (modo) {
    window.currentView = modo;
    console.log('Cambiando vista a:', modo);

    window.resetIdleTimer(); // Reiniciar al cambiar de vista

    // Ocultamos todas las vistas y limpiamos el estado activo de las pestañas
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

    // Activamos la vista solicitada
    const vista = document.getElementById(`${modo}-view`);
    if (vista) vista.classList.add('active');

    // Resaltamos la pestaña
    const tab = document.querySelector(`.nav-tab[data-view="${modo}"]`);
    if (tab) tab.classList.add('active');

    // Mostramos/ocultamos paneles laterales según el modo
    const detalles = document.getElementById('detallesSection');
    const weatherSec = document.getElementById('weather-section');
    const recommendSec = document.getElementById('recommendSection');

    if (modo === 'outfit') {
        if (detalles) detalles.style.display = 'none';
        if (weatherSec) weatherSec.style.display = 'none';
        if (recommendSec) recommendSec.style.display = 'none';

        // Arrancamos el espejo al entrar en la vista Outfit
        if (window.initEspejo) window.initEspejo();
    } else if (modo === 'outfits') {
        // mostramos el panel de detalles para poder borrar outfits
        if (detalles) detalles.style.display = 'block';
        if (weatherSec) weatherSec.style.display = 'none';
        if (recommendSec) recommendSec.style.display = 'none';

        // Cargamos los outfits guardados al entrar en la pestaña de Outfits
        if (window.currentUser && window.cargarOutfitsUsuario) {
            window.cargarOutfitsUsuario(window.currentUser);
        }
    } else {
        if (detalles) detalles.style.display = 'block';
        if (weatherSec) weatherSec.style.display = 'block';
        if (recommendSec) recommendSec.style.display = 'block';
    }

    // Limpiamos la selección al cambiar de vista
    if (selectedCard) {
        selectedCard.classList.remove('selected');
        selectedCard = null;
    }
    const garmentDetails = document.getElementById('garmentDetails');
    if (garmentDetails) {
        garmentDetails.innerHTML = '<p class="text-muted" style="font-size: 0.8rem;">Selecciona un elemento para ver detalles</p>';
    }

    // Gestionamos la visibilidad del contenedor de info
    const infoContainer = document.getElementById('info-btn-container');
    if (infoContainer) {
        if (modo === 'outfit') infoContainer.classList.remove('hidden');
        else infoContainer.classList.add('hidden');
    }

    // Gestionamos la visibilidad del puntero (mando)
    const pointer = document.getElementById('pointer');
    if (pointer) {
        if (modo === 'outfit') pointer.classList.add('hidden');
        else pointer.classList.remove('hidden');
    }
}

// Escuchamos la orden del móvil para cambiar la vista
socket.on('nuevoModo', window.activarVista);

// Puntero remoto, que recibe la posición del touchpad del móvil
const pointer = document.getElementById('pointer');
const mirrorMain = document.getElementById('mirrorMain');
const garmentDetails = document.getElementById('garmentDetails');

// Referencia a la tarjeta actualmente bajo el puntero
let hoveredCard = null;
let selectedCard = null;

// El espejo recibe la posición normalizada (0-1) y mueve el puntero
socket.on('actualizarPuntero', (data) => {
    window.resetIdleTimer(); // Actividad detectada
    // Convertir coordenadas normalizadas a toda la pantalla
    const x = data.x * window.innerWidth;
    const y = data.y * window.innerHeight;

    if (pointer) {
        pointer.style.left = `${x}px`;
        pointer.style.top = `${y}px`;

        // Detección de hover con el puntero virtual
        // Ocultamos el pointer temporalmente para que elementFromPoint no lo detecte a él
        pointer.style.display = 'none';
        const elementUnder = document.elementFromPoint(x, y);
        pointer.style.display = '';

        // Buscar si el elemento (o un padre) es un garment-card
        const card = elementUnder ? elementUnder.closest('.garment-card') : null;

        if (card !== hoveredCard) {
            // Quitar hover de la tarjeta anterior
            if (hoveredCard) hoveredCard.classList.remove('pointer-hover');
            // Poner hover en la nueva
            if (card) card.classList.add('pointer-hover');
            hoveredCard = card;
        }

        // Auto-scroll si el puntero se acerca a los bordes superior/inferior
        if (elementUnder) {
            const scrollable = elementUnder.closest('.catalog-grid, .mirror-sidebar');
            if (scrollable) {
                const rect = scrollable.getBoundingClientRect();
                const relY = y - rect.top;       // Posición Y relativa al contenedor
                const margin = Math.min(rect.height * 0.15, 100); // 15% de margen o 100px máximo

                if (relY < margin) {
                    // Si está muy arriba, scroll hacia arriba
                    scrollable.scrollBy({ top: -12, behavior: 'auto' });
                } else if (relY > rect.height - margin) {
                    scrollable.scrollBy({ top: 12, behavior: 'auto' });
                }
            }
        }
    }
});

let deleteConfirming = false;

socket.on('pointerClick', () => {
    window.resetIdleTimer();
    pointer.classList.add('pointer-click');
    setTimeout(() => pointer.classList.remove('pointer-click'), 300);

    pointer.style.display = 'none';
    const px = parseFloat(pointer.style.left);
    const py = parseFloat(pointer.style.top);
    const elUnder = document.elementFromPoint(px, py);
    pointer.style.display = '';

    // Lógica de los botones del sidebar
    if (elUnder) {
        if (elUnder.id === 'climaFilterBtn' || elUnder.closest('#climaFilterBtn')) {
            document.getElementById('climaFilterBtn')?.click();
            return;
        }
        if (elUnder.id === 'recommendBtn' || elUnder.closest('#recommendBtn')) {
            document.getElementById('recommendBtn')?.click();
            return;
        }
    }

    // Lógica de probar outfit
    if (elUnder && (elUnder.id === 'tryOutfitBtn' || elUnder.closest('#tryOutfitBtn'))) {
        if (selectedCard) {
            const outfitId = parseInt(selectedCard.getAttribute('data-id'));
            const outfit = (window.outfitsGuardados || []).find(o => o.id === outfitId);
            if (outfit) {
                console.log('Aplicando outfit al probador...');
                // Cambiamos a la vista de outfit y notificamos al móvil
                window.activarVista('outfit');
                socket.emit('cambiarModo', 'outfit');
                // Sincronizamos las prendas
                if (window.cargarOutfitEnProbador) window.cargarOutfitEnProbador(outfit);
            }
        }
        return;
    }

    // Lógica de eliminar prenda o outfit
    const deleteBtn = document.getElementById('deletePrendaBtn');
    if (deleteBtn) {
        if (elUnder && (elUnder.id === 'deletePrendaBtn' || elUnder.closest('#deletePrendaBtn'))) {
            if (!deleteConfirming) {
                // Primer click: pedir confirmación
                deleteConfirming = true;
                deleteBtn.textContent = '⚠️ ¿Seguro? Pulsa de nuevo';
                deleteBtn.classList.add('confirming');
                return;
            } else {
                // Segundo click: eliminar la prenda o el outfit
                if (selectedCard) {
                    const isOutfit = selectedCard.getAttribute('data-is-outfit') === 'true';
                    const id_eliminado = parseInt(selectedCard.getAttribute('data-id'));

                    if (isOutfit && window.eliminarOutfit) {
                        // --- ELIMINAR OUTFIT ---
                        window.eliminarOutfit(id_eliminado, selectedCard);
                    } else if (window.eliminarPrenda) {
                        // --- ELIMINAR PRENDA ---
                        window.eliminarPrenda(id_eliminado, selectedCard);
                    }

                    deleteConfirming = false;
                    garmentDetails.innerHTML = '<p class="text-muted" style="font-size: 0.8rem;">Selección eliminada</p>';
                    selectedCard = null;
                }
                return;
            }
        }
    }

    // Reset confirmación si se hace click en otro sitio
    deleteConfirming = false;

    if (hoveredCard) {
        if (selectedCard) selectedCard.classList.remove('selected');
        hoveredCard.classList.add('selected');
        selectedCard = hoveredCard;

        const isOutfit = hoveredCard.getAttribute('data-is-outfit') === 'true';

        if (isOutfit && window.mostrarDetallesOutfit) {
            // Mostramos los detalles del outfit
            garmentDetails.innerHTML = window.mostrarDetallesOutfit(hoveredCard);
        } else if (window.mostrarDetallesPrenda) {
            // Mostramos los detalles de la prenda
            garmentDetails.innerHTML = window.mostrarDetallesPrenda(hoveredCard);
        }
    }
});

const roberto = document.getElementById('robertoOverlay');

socket.on('eventRoberto', () => {
    if (window.currentView !== 'armario') return;
    // Si ocurre el evento, hacemos que aparezca con efecto la imagen por 5 segundos y desaparezca
    roberto.classList.remove('hidden');
    roberto.classList.add('vanish-effect');

    setTimeout(() => {
        roberto.classList.add('hidden');
        roberto.classList.remove('vanish-effect');
    }, 5000);

    // Ocultar directamente el popup de filtros en el DOM del espejo
    const filterOverlay = document.getElementById('filterOverlay');
    if (filterOverlay) {
        filterOverlay.classList.add('hidden');
    }
});

// Sistema de ayuda (info) con GIFs secuenciales
socket.on('mostrarInfo', () => {
    window.resetIdleTimer(); // Actividad detectada
    console.log('Iniciando secuencia de ayuda visual...');
    const overlay = document.getElementById('info-overlay');
    const gif = document.getElementById('info-gif');
    const title = document.getElementById('info-title');

    if (!overlay || !gif) return;

    // Primer gif
    overlay.classList.remove('hidden');
    if (title) title.textContent = "";
    gif.src = "gifs/Girar.gif";

    // Tras 5 segundos, pasamos al segundo gif
    setTimeout(() => {
        gif.src = "gifs/inclinar.gif";

        // Tras otros 5 segundos, pasamos al tercer gif
        setTimeout(() => {
            gif.src = "gifs/ok.gif";

            // Tras otros 5 segundos, cerramos el overlay
            setTimeout(() => {
                overlay.classList.add('hidden');
                console.log('Fin de la ayuda visual.');
            }, 5000);
        }, 5000);
    }, 5000);
});