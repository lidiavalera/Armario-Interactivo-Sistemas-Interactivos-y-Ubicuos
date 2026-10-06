// Movil que es un mando para el espejo interactivo
// Control remoto: touchpad, filtros por voz,
// ACELERÓMETRO + ORIENTACIÓN para el probador

const socket = io();

const modeButtons = document.querySelectorAll('.mode-btn');
const touchpadSection = document.getElementById('touchpadSection');
const outfitSection = document.getElementById('outfitSection');

// Función para aplicar el cambio de modo en la interfaz del móvil
function aplicarCambioModo(modo) {
    // Quitar la clase active a todos y ponérsela al correspondiente
    modeButtons.forEach(btn => {
        if (btn.getAttribute('data-mode') === modo) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Mostrar/ocultar secciones según el modo
    const accionesSec = document.getElementById('accionesSection');

    if (modo === 'outfit') {
        if (outfitSection) outfitSection.style.display = 'block';
        if (touchpadSection) touchpadSection.style.display = 'none';
        pedirPermisoYArrancar();
    } else if (modo === 'outfits') {
        if (outfitSection) outfitSection.style.display = 'none';
        if (touchpadSection) touchpadSection.style.display = 'block';
        if (accionesSec) accionesSec.style.display = 'none';
        detenerSensores();
    } else {
        // Modo armario u otros
        if (outfitSection) outfitSection.style.display = 'none';
        if (touchpadSection) touchpadSection.style.display = 'block';
        if (accionesSec) accionesSec.style.display = 'block';
        detenerSensores();
    }
}

// Escuchar los clics en los botones de "Modo" del mando
modeButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
        const modo = e.target.getAttribute('data-mode');
        aplicarCambioModo(modo);

        // Enviar la orden al servidor
        socket.emit('cambiarModo', modo);
        if (modo === 'outfit') {
            socket.emit('activarEspejo');
        }
    });
});

// Escuchar cambios de modo enviados por el espejo u otros dispositivos
socket.on('nuevoModo', (modo) => {
    console.log('Sincronizando nuevo modo:', modo);
    aplicarCambioModo(modo);
});

// Indicador de conexión
const connectionDot = document.getElementById('connectionDot');
socket.on('connect', () => { connectionDot.classList.add('online'); connectionDot.classList.remove('offline'); });
socket.on('disconnect', () => { connectionDot.classList.remove('online'); connectionDot.classList.add('offline'); });

// Touchpad
const touchpad = document.getElementById('touchpad');
const touchDot = document.getElementById('touchDot');

// Array de toques activos
const touches = [];

function addTouch(touch) {
    touches.push({
        id: touch.identifier,
        x: touch.clientX,
        y: touch.clientY,
    });
}

function removeTouch(touchId) {
    const idx = touches.findIndex(touch => touch.id === touchId);
    if (idx !== -1) {
        touches.splice(idx, 1);
    }
}

// Evento cuando se pone un dedo en la pantalla (touchstart)
touchpad.addEventListener("touchstart", function (e) {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
        addTouch(e.changedTouches[i]);
    }
    touchDot.style.display = 'block';
}, { passive: false });

// Evento cuando se levanta un dedo (touchend)
touchpad.addEventListener("touchend", function (e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
        removeTouch(e.changedTouches[i].identifier);
    }
    if (touches.length === 0) {
        touchDot.style.display = 'none';
    }
});

// Evento cuando se arrastra el dedo (touchmove)
touchpad.addEventListener("touchmove", function (e) {
    e.preventDefault(); // Evita que la pantalla se mueva (haga scroll)
    const changedTouches = e.changedTouches;
    for (let ct of changedTouches) {
        const idx = touches.findIndex(touch => touch.id === ct.identifier);
        if (idx !== -1) {
            const t = touches[idx];
            t.x = ct.clientX;
            t.y = ct.clientY;
        }
    }
}, { passive: false });

// Bucle de renderizado
function onFrame() {
    if (touches.length > 0) {
        // Usamos el primer toque como puntero principal
        const touch = touches[0];
        const rect = touchpad.getBoundingClientRect();

        // Posición relativa dentro del touchpad
        const localX = touch.x - rect.left;
        const localY = touch.y - rect.top;

        // Mover el punto visual local (feedback en el móvil)
        touchDot.style.left = `${localX}px`;
        touchDot.style.top = `${localY}px`;

        // Normalizar a rango [0, 1] para enviar al espejo
        const normX = Math.max(0, Math.min(1, localX / rect.width));
        const normY = Math.max(0, Math.min(1, localY / rect.height));

        // Emitir la posición del puntero al servidor
        socket.emit('moverPuntero', { x: normX, y: normY });
    }

    requestAnimationFrame(onFrame);
}

requestAnimationFrame(onFrame);

// Botón de click del puntero
const clickBtn = document.getElementById('pointerClickBtn');
if (clickBtn) {
    clickBtn.addEventListener('click', () => {
        socket.emit('pointerClick');
    });
}

// Categorias
const categorias = ['superior', 'inferior', 'calzado'];
const categoriasLabels = { superior: '👕 Superior', inferior: '👖 Inferior', calzado: '👟 Calzado' };
let categoriaActiva = 'superior';

socket.on('categoriaActualizada', data => {
    categoriaActiva = data.categoria;
    actualizarUI();
});

// Emitir cambio de categoria
function emitirCambio(tipo, direccion) {
    if (tipo === 'prenda') {
        socket.emit('cambiarPrenda', { categoria: categoriaActiva, direccion });
        console.log(`[sensor] prenda ${direccion} (cat: ${categoriaActiva})`);
    } else {
        const idx = categorias.indexOf(categoriaActiva);
        categoriaActiva = direccion === 'siguiente'
            ? categorias[(idx + 1) % categorias.length]
            : categorias[(idx - 1 + categorias.length) % categorias.length];
        socket.emit('cambiarCategoria', { direccion });
        actualizarUI();
        console.log(`[sensor] categoría ${direccion}: ${categoriaActiva}`);
    }
}

// Actualizar la UI
function actualizarUI() {
    const label = document.getElementById('outfitCatLabel');
    const dots = document.getElementById('outfitCatDots');
    if (label) label.textContent = categoriasLabels[categoriaActiva];
    if (dots) {
        dots.innerHTML = categorias.map(c =>
            `<span class="cat-dot ${c === categoriaActiva ? 'active' : ''}"></span>`
        ).join('');
    }
}

// Feedback de acelerómetro
function flashFeedback(text, color = '#4fc3f7') {
    const el = document.getElementById('accelFeedback');
    if (!el) return;
    el.textContent = text;
    el.style.color = color;
    el.style.opacity = '1';
    el.style.transform = 'translate(-50%, -50%) scale(1.3)';
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translate(-50%, -50%) scale(1)';
    }, 700);
}

// Estado
function setStatus(msg) {
    const el = document.getElementById('accelStatus');
    if (el) el.textContent = msg;
}

// Sistema de gestos (móvil boca arriba en la mano):
//
//  → Mover a la derecha  (acelerómetro, eje X+) → prenda siguiente
//  ← Mover a la izquierda (acelerómetro, eje X-) → prenda anterior
//  ↓ Bajar el móvil      (acelerómetro, eje Y-)  → categoría siguiente
//  ↑ Girar 90° hacia ti  (orientación, beta 0→90°) → categoría anterior
//
// El giro hacia arriba usa DeviceOrientationEvent.beta porque es un
// movimiento angular sostenido (fácil de detectar) en lugar de un
// impulso lineal (difícil). El móvil parte de plano (beta≈0) y al
// girarlo hacia tu cara llega a beta≈90. Cuando cruza el umbral
// de 65° se dispara el evento.

// Acelerómetro para gestos izquierda, derecha y abajo
const ACCEL_THRESHOLD = 8;    // m/s² para reconocer un flick
const ACCEL_COOLDOWN = 800;  // ms entre gestos
const AXIS_DOMINANCE = 1.8;  // eje dominante vs perpendicular
const HISTORY_LEN = 3;

const histX = new Array(HISTORY_LEN).fill(0);
const histY = new Array(HISTORY_LEN).fill(0);
let histIdx = 0;

let lastGesture = 0;
let sensoresActivos = false;

function onDeviceMotion(e) {
    if (!sensoresActivos) return;

    const acc = e.acceleration && e.acceleration.x !== null
        ? e.acceleration
        : e.accelerationIncludingGravity;
    if (!acc) return;

    histX[histIdx] = acc.x || 0;
    histY[histIdx] = acc.y || 0;
    histIdx = (histIdx + 1) % HISTORY_LEN;

    const ax = histX.reduce((s, v) => s + v, 0) / HISTORY_LEN;
    const ay = histY.reduce((s, v) => s + v, 0) / HISTORY_LEN;

    // Actualizar bolita visual
    updateBall(ax, ay);

    const now = Date.now();
    if (now - lastGesture < ACCEL_COOLDOWN) return;

    const absX = Math.abs(ax);
    const absY = Math.abs(ay);

    // Detección de agitar vigorosamente (Shake), para el easter egg de modo aleatorio
    const SHAKE_THRESHOLD = 15; // umbral de aceleración alta
    if (absX > SHAKE_THRESHOLD || absY > SHAKE_THRESHOLD) {
        lastGesture = now;
        socket.emit('randomizarOutfit');
        flashFeedback('🎲 Outfit Aleatorio en Espejo!', '#ffeb3b');
        console.log('[sensor] Shake detectado!');
        return;
    }

    if (absX < ACCEL_THRESHOLD && absY < ACCEL_THRESHOLD) return;

    if (absX > absY * AXIS_DOMINANCE) {
        // Movimiento horizontal
        lastGesture = now;
        if (ax > 0) {
            emitirCambio('prenda', 'siguiente');
            flashFeedback('→ Siguiente', '#4fc3f7');
        } else {
            emitirCambio('prenda', 'anterior');
            flashFeedback('← Anterior', '#4fc3f7');
        }
    } else if (absY > absX * AXIS_DOMINANCE && ay < 0) {
        // Movimiento hacia abajo 
        // Solo el gesto de bajar; el de subir lo gestiona la orientación
        lastGesture = now;
        emitirCambio('categoria', 'siguiente');
        flashFeedback('↓ ' + categoriasLabels[categoriaActiva], '#a78bfa');
    }
}

// Orientación, gesto hacia arriba (beta 0° → 90°)
// beta ≈ 0°  → móvil plano boca arriba
// beta ≈ 90° → móvil vertical (pantalla mirando hacia ti)

const BETA_TRIGGER = 65;   // ángulo al que se dispara (°)
const BETA_RESET = 25;   // ángulo al que se "recarga" el gesto (°)
const ORIENT_COOLDOWN = 900; // ms entre gestos de orientación

let betaEnPosPlana = false;       // true cuando el móvil estaba plano antes del giro
let lastOrientGesture = 0;

function onDeviceOrientation(e) {
    if (!sensoresActivos) return;

    const beta = e.beta !== null ? e.beta : 0;
    // beta puede ser negativo si el móvil está boca abajo; usamos valor absoluto
    // para que funcione independientemente de si la pantalla mira arriba o abajo
    const absBeta = Math.abs(beta);

    // Detectar posición plana (recarga del gesto)
    if (absBeta < BETA_RESET) {
        betaEnPosPlana = true;
    }

    // Detectar cruce del umbral
    if (betaEnPosPlana && absBeta >= BETA_TRIGGER) {
        const now = Date.now();
        if (now - lastOrientGesture >= ORIENT_COOLDOWN &&
            now - lastGesture >= ORIENT_COOLDOWN) {

            lastOrientGesture = now;
            lastGesture = now;   // bloquear también el acelerómetro
            betaEnPosPlana = false; // requiere volver a plano antes del próximo giro

            emitirCambio('categoria', 'anterior');
            flashFeedback('↑ ' + categoriasLabels[categoriaActiva], '#a78bfa');
            console.log(`[orient] categoría anterior (beta=${absBeta.toFixed(1)}°)`);
        }
    }
}


// Bolita que refleja el movimiento del teléfono
function updateBall(ax, ay) {
    const ball = document.getElementById('accelBall');
    if (!ball) return;
    const bx = Math.max(-50, Math.min(50, ax * 3.5));
    const by = Math.max(-50, Math.min(50, -ay * 3.5));
    ball.style.transform = `translate(calc(-50% + ${bx}px), calc(-50% + ${by}px))`;
}

// Arranque y permisos
// Tanto DeviceMotionEvent como DeviceOrientationEvent requieren
// permiso en iOS 13+. Pedimos ambos con el mismo botón.
function arrancarSensores() {
    window.addEventListener('devicemotion', onDeviceMotion);
    window.addEventListener('deviceorientation', onDeviceOrientation);
    sensoresActivos = true;
    setStatus('✅ Sensores activos');

    const btn = document.getElementById('accelPermBtn');
    if (btn) btn.style.display = 'none';
}

function detenerSensores() {
    window.removeEventListener('devicemotion', onDeviceMotion);
    window.removeEventListener('deviceorientation', onDeviceOrientation);
    sensoresActivos = false;
}

async function pedirPermisoYArrancar() {
    if (sensoresActivos) return;

    const needsPermission =
        (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') ||
        (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function');

    if (!needsPermission) {
        // Android o iOS antiguo,arrancar directo
        arrancarSensores();
        return;
    }

    // iOS 13+, pedir los dos permisos en secuencia
    try {
        const motionState = typeof DeviceMotionEvent.requestPermission === 'function'
            ? await DeviceMotionEvent.requestPermission()
            : 'granted';

        const orientState = typeof DeviceOrientationEvent.requestPermission === 'function'
            ? await DeviceOrientationEvent.requestPermission()
            : 'granted';

        if (motionState === 'granted' && orientState === 'granted') {
            arrancarSensores();
        } else {
            setStatus('❌ Permiso denegado — usa los botones');
        }
    } catch (err) {
        console.error(err);
        setStatus('❌ Error al pedir permiso');
    }
}

const accelPermBtn = document.getElementById('accelPermBtn');
if (accelPermBtn) accelPermBtn.addEventListener('click', pedirPermisoYArrancar);

const voiceBtnOutfit = document.getElementById('voiceBtnOutfit');

actualizarUI();


// Filtro por voz — basado en ubicomp-main/08.speech/speech.js
const filterBtn = document.getElementById('filterBtn');
const clearFilterBtn = document.getElementById('clearFilterBtn');

// Compatibilidad para navegadores (Chrome usa webkitSpeechRecognition)
const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
const SpeechGrammarList = window.webkitSpeechGrammarList || window.SpeechGrammarList;

if (SpeechRecognition && filterBtn) {
    const recognition = new SpeechRecognition();

    // Definición de palabras clave y gramática JSGF
    const keywords = ['sudadera', 'pantalón', 'pantalones', 'camiseta', 'zapato', 'zapatos',
        'rojo', 'azul', 'negro', 'blanco',
        'calor', 'medio', 'frío',
        'reciente', 'antiguo',
        'roberto', 'info', 'información',
        'fin'];
    const grammar = '#JSGF V1.0; grammar filtros; public <filtro> = ' + keywords.join(' | ') + ' ;';

    if (SpeechGrammarList) {
        const speechRecognitionList = new SpeechGrammarList();
        speechRecognitionList.addFromString(grammar, 1);
        recognition.grammars = speechRecognitionList;
    }

    // Configuración del reconocimiento
    recognition.continuous = true;    // Escuchar continuamente hasta decir "fin"
    recognition.lang = 'es-ES';      // Idioma español
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    // Estado del filtro actual
    let filtroActual = { tipo: null, color: null, clima: null, historial: null };
    let escuchando = false;

    // Opciones válidas por categoría
    const opcionesTipo = ['sudadera', 'pantalón', 'pantalones', 'camiseta', 'zapato', 'zapatos'];
    const opcionesColor = ['rojo', 'azul', 'negro', 'blanco'];
    const opcionesClima = ['calor', 'medio', 'frío', 'todos'];
    const opcionesHistorial = ['reciente', 'antiguo'];

    // Procesamiento del resultado
    recognition.onresult = (event) => {
        let tieneFin = false;
        let esRoberto = false;

        // Recorremos todos los resultados nuevos
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i][0].transcript.toLowerCase().trim();
            console.log(`Resultado voz: ${result}`);

            let contadorRoberto = 0; // Contador del número de veces que se dice roberto

            const palabras = result.split(/\s+/);
            for (const palabra of palabras) {
                if (opcionesTipo.includes(palabra)) {
                    filtroActual.tipo = palabra === 'pantalones' ? 'pantalón' : palabra === 'zapatos' ? 'zapato' : palabra;
                } else if (opcionesColor.includes(palabra)) {
                    filtroActual.color = palabra;
                } else if (opcionesClima.includes(palabra)) {
                    if (palabra === 'todos') {
                        filtroActual.clima = 'Todos';
                    } else {
                        filtroActual.clima = (palabra === 'medio' || palabra === 'frío') ? 'Medio/Frío' : 'Calor';
                    }
                } else if (opcionesHistorial.includes(palabra)) {
                    filtroActual.historial = palabra;
                } else if (palabra === 'fin') {
                    tieneFin = true;
                } else if (palabra === 'roberto') {
                    contadorRoberto++;
                } else if (palabra === 'info' || palabra === 'información') {
                    console.log('Solicitud de ayuda detectada');
                    socket.emit('mostrarInfo');
                    tieneFin = true; // Paramos de escuchar tras pedir ayuda
                }
                if (contadorRoberto >= 3) {
                    esRoberto = true;
                    // Nos salimos del bucle
                    break;
                }
            }
        }

        if (esRoberto) {
            escuchando = false;
            recognition.stop();
            if (filterBtn) filterBtn.textContent = '🎤 Filtrar';
            if (voiceBtnOutfit) voiceBtnOutfit.textContent = '🎤 Activar Voz';
            socket.emit('eventRoberto');
            socket.emit('limpiarFiltro');
            return;
        }

        socket.emit('actualizarFiltroUI', filtroActual);

        if (tieneFin) {
            escuchando = false;
            recognition.stop();
            if (filterBtn) filterBtn.textContent = '🎤 Filtrar';
            if (voiceBtnOutfit) voiceBtnOutfit.textContent = '🎤 Activar Voz';
            // Enviar filtros consolidados al espejo
            socket.emit('aplicarFiltro', filtroActual);
        }
    };

    recognition.onerror = (event) => {
        console.error('Speech error:', event.error);
        if (event.error !== 'aborted') {
            socket.emit('actualizarFiltroUI', { ...filtroActual, status: 'Error: ' + event.error });
            escuchando = false;
        }
    };

    // Reiniciar si todavía estamos en modo escucha continuada
    recognition.onend = () => {
        if (escuchando) {
            try { recognition.start(); } catch (e) { }
        } else {
            if (filterBtn) filterBtn.textContent = '🎤 Filtrar';
            if (voiceBtnOutfit) voiceBtnOutfit.textContent = '🎤 Activar Voz';
        }
    };

    const toggleVoz = () => {
        if (escuchando) {
            // Si ya escucha y le vuelves a dar, actuamos como si diera a 'fin'
            escuchando = false;
            recognition.stop();
            if (filterBtn) filterBtn.textContent = '🎤 Filtrar';
            if (voiceBtnOutfit) voiceBtnOutfit.textContent = '🎤 Activar Voz';
            socket.emit('aplicarFiltro', filtroActual);
            return;
        }
        filtroActual = { tipo: null, color: null, clima: null, historial: null };
        escuchando = true;
        if (filterBtn) filterBtn.textContent = '🎙️ Escuchando...';
        if (voiceBtnOutfit) voiceBtnOutfit.textContent = '🎙️ Escuchando...';
        socket.emit('mostrarFiltro', filtroActual);
        try {
            recognition.start();
        } catch (e) { }
    };

    if (filterBtn) filterBtn.addEventListener('click', toggleVoz);
    if (voiceBtnOutfit) voiceBtnOutfit.addEventListener('click', toggleVoz);

} else if (filterBtn) {
    filterBtn.disabled = true;
    filterBtn.textContent = 'Voz no soportada';
}

// Botón Limpiar Filtros
if (clearFilterBtn) {
    clearFilterBtn.addEventListener('click', () => {
        socket.emit('limpiarFiltro');
    });
}

// Boton de la cámara (que esta flotando)
const floatingCamBtn = document.getElementById('floatingCameraBtn');
if (floatingCamBtn) {
    floatingCamBtn.addEventListener('click', () => {
        window.location.href = 'camara.html';
    });
}
