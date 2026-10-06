// Espejo con MediaPipe PoseLandmarker + HandLandmarker
// Superpone prendas del armario sobre el cuerpo en tiempo real
// Detecta signo OK para guardar el outfit actual

// Importamos las librerías de MediaPipe desde un CDN (Content Delivery Network)
// PoseLandmarker: Detecta puntos clave del cuerpo (hombros, caderas, etc.)
// HandLandmarker: Detecta puntos clave de las manos (puntas de dedos, nudillos)
import {
    FilesetResolver,
    PoseLandmarker,
    HandLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest";

// Referencias DOM
// Usamos el video de fondo del espejo para procesar pose/manos
const mainMirrorVideo = document.getElementById('mainMirrorVideo');
const mirrorCanvas = document.getElementById('mirrorCanvas');
const espejoStatus = document.getElementById('espejoStatus');
const ctx = mirrorCanvas ? mirrorCanvas.getContext('2d') : null;

// Estado interno
let poseLandmarker = null;
let handLandmarker = null;
let espejoActivo = false;

// Imágenes HTML precargadas para cada zona del cuerpo
const prendaImgs = { superior: null, inferior: null, calzado: null };

// Estado de las flechas animadas
let arrowFlashStart = 0;
const ARROW_FLASH_DURATION = 700;
let arrowCategoria = 'superior';
let arrowDireccion = null; // 'siguiente' o 'anterior', para animar la flecha correcta

// Estado detección OK 
let okFrameCount = 0;
const OK_FRAMES_NEEDED = 40;   // ~1.3s a 30fps
let okCooldownUntil = 0;
const OK_COOLDOWN_MS = 4000;

// Estado feedback guardado
let outfitSaveFlash = 0;
const SAVE_FLASH_DURATION = 2000;

// Estado feedback random outfit
let outfitRandomFlash = 0;
const RANDOM_FLASH_DURATION = 2000;

// Inicialización, se llama desde mirror.js al entrar en vista Outfit
async function initEspejo() {
    if (espejoActivo) return;

    // Ya no pedimos la cámara aquí porque ya la arrancó mirror.js en #mainMirrorVideo
    if (!mainMirrorVideo || !mainMirrorVideo.srcObject) {
        setStatus('⏳ Esperando a la cámara...');
        setTimeout(() => initEspejo(), 500); // reintentar en medio segundo
        return;
    }

    setStatus('⏳ Cargando modelos...');

    // El FilesetResolver localiza los recursos necesarios (archivos .wasm) para que MediaPipe funcione
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );

    // Configuramos el detector de POSE (Cuerpo)
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
            delegate: "GPU", // Usamos la tarjeta gráfica para que sea rápido
        },
        runningMode: "VIDEO", // Modo optimizado para flujo de vídeo continuo
        numPoses: 1, // Solo detectamos a una persona
    });

    // Configuramos el detector de MANOS
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 1, // Solo detectamos una mano
    });

    console.log('PoseLandmarker + HandLandmarker del espejo listos');
    espejoActivo = true;
    setStatus('');

    // Sincronizamos y empezamos las predicciones usando el vídeo de fondo
    syncCanvas();
    predictMirror();
}

// Offsets para el mapeo cover-crop (se recalculan en cada syncCanvas)
let coverOffsetX = 0, coverOffsetY = 0, coverScale = 1;
// Offset del contenedor del canvas respecto al viewport completo
let containerLeft = 0, containerTop = 0;

function syncCanvas() {
    // El canvas tiene la resolución del contenedor (lo que se ve en pantalla)
    const container = mirrorCanvas.parentElement;
    const cW = container.clientWidth;
    const cH = container.clientHeight;
    mirrorCanvas.width = cW;
    mirrorCanvas.height = cH;

    // Offset del contenedor respecto al viewport completo
    const rect = container.getBoundingClientRect();
    containerLeft = rect.left;
    containerTop = rect.top;

    // El vídeo de fondo (#mainMirrorVideo) cubre el la pantalla completa
    const vW = mainMirrorVideo.videoWidth || window.innerWidth;
    const vH = mainMirrorVideo.videoHeight || window.innerHeight;
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;
    computeCoverTransform(vW, vH, vpW, vpH);
}

// Calcula scale y offset que replica CSS object-fit: cover.
// El vídeo (vW×vH) se escala para cubrir el viewport (vpW×vpH).
function computeCoverTransform(vW, vH, vpW, vpH) {
    const videoRatio = vW / vH;
    const vpRatio = vpW / vpH;

    if (videoRatio > vpRatio) {
        // Si el vídeo es más ancho, se recortan los laterales
        coverScale = vpH / vH;
        coverOffsetX = (vpW - vW * coverScale) / 2;
        coverOffsetY = 0;
    } else {
        // Si el vídeo es más alto, se recorta arriba/abajo
        coverScale = vpW / vW;
        coverOffsetX = 0;
        coverOffsetY = (vpH - vH * coverScale) / 2;
    }
}

function setStatus(msg) {
    if (espejoStatus) {
        espejoStatus.textContent = msg;
        espejoStatus.style.display = msg ? 'block' : 'none';
    }
}

// Bucle principal
function predictMirror() {
    const outfitView = document.getElementById('outfit-view');
    if (!outfitView || !outfitView.classList.contains('active')) {
        requestAnimationFrame(predictMirror);
        return;
    }

    const t1 = performance.now();
    // Detectamos sobre el vídeo de fondo
    const poseResult = poseLandmarker.detectForVideo(mainMirrorVideo, t1);
    const t2 = performance.now();
    const handResult = handLandmarker
        ? handLandmarker.detectForVideo(mainMirrorVideo, t2)
        : { landmarks: [] };

    renderFrame(poseResult, handResult);
    requestAnimationFrame(predictMirror);
}

// Renderizado, espejo y prendas superpuestas
function renderFrame(poseResult, handResult) {
    // Resincronizar por si el contenedor cambió de tamaño
    const container = mirrorCanvas.parentElement;
    if (mirrorCanvas.width !== container.clientWidth || mirrorCanvas.height !== container.clientHeight) {
        syncCanvas();
    }

    const W = mirrorCanvas.width;
    const H = mirrorCanvas.height;

    // Limpiamos el canvas
    ctx.clearRect(0, 0, W, H);

    // Si MediaPipe ha detectado a alguien (landmarks)
    const landmarks = poseResult.landmarks && poseResult.landmarks[0];
    if (landmarks) {
        // Superponemos las imágenes de la ropa encima del cuerpo
        superponerPrendas(landmarks, W, H);
        // Dibujamos las flechitas de navegación cerca del cuerpo
        dibujarFlechas(landmarks, W, H);
    }

    // Procesamos si la mano está haciendo el signo de "OK"
    procesarGestoMano(handResult, W, H);

    // Si acabamos de guardar un outfit, mostramos un mensaje verde de éxito
    if (outfitSaveFlash > 0) {
        dibujarFeedbackGuardado(W, H);
    }

    // Si acabamos de generar un outfit aleatorio, mostramos un mensaje amarillo
    if (outfitRandomFlash > 0) {
        dibujarFeedbackRandom(W, H);
    }
}

// Superposición de prendas
// Calcula la posición y tamaño de las prendas basándose en los huesos del cuerpo detectados.
// MediaPipe nos da coordenadas de 0 a 1 (normalizadas).
function superponerPrendas(lm, W, H) {
    // Convertir coordenadas NORMALIZADAS de MediaPipe a viewport y a canvas-local.
    // El vídeo cubre el viewport entero, pero el canvas solo ocupa mirror-main.
    const vW = mainMirrorVideo.videoWidth || W;
    const vH = mainMirrorVideo.videoHeight || H;
    const lx = (i) => (1 - lm[i].x) * vW * coverScale + coverOffsetX - containerLeft;
    const ly = (i) => lm[i].y * vH * coverScale + coverOffsetY - containerTop;

    // Parte superior (Camiseta / Sudadera)
    if (prendaImgs.superior) {
        // Referencias: 11=Hombro Izq, 12=Hombro Der, 23=Cadera Izq, 24=Cadera Der
        const sLx = lx(11), sLy = ly(11);
        const sRx = lx(12), sRy = ly(12);
        const hLy = ly(23), hRy = ly(24);

        // Centro de los hombros y de las caderas
        const shoulderMidX = (sLx + sRx) / 2;
        const shoulderMidY = (sLy + sRy) / 2;
        const hipMidY = (hLy + hRy) / 2;

        // Calculamos ancho (distancia entre hombros) y alto (distancia hombros-cadera)
        const shoulderSpan = Math.abs(sRx - sLx);
        const torsoH = hipMidY - shoulderMidY;

        // Escalamos la prenda para que sea algo más ancha que los hombros y más larga que el torso
        const imgW = shoulderSpan * 2.6;
        const imgH = torsoH * 1.9;

        ctx.globalAlpha = 0.92; // Algo de transparencia para que quede natural
        ctx.drawImage(prendaImgs.superior, shoulderMidX - imgW / 2, shoulderMidY - imgH * 0.30, imgW, imgH);
        ctx.globalAlpha = 1;
    }

    // Parte inferior (Pantalones)
    if (prendaImgs.inferior) {
        // Referencias: 23/24=Caderas, 27/28=Tobillos
        const hLx = lx(23), hLy = ly(23);
        const hRx = lx(24), hRy = ly(24);
        const aLy = ly(27);
        const aRy = ly(28);

        const hipMidX = (hLx + hRx) / 2;
        const hipMidY = (hLy + hRy) / 2;
        const ankMidY = (aLy + aRy) / 2;

        const hipSpan = Math.abs(hRx - hLx);
        const legH = ankMidY - hipMidY;

        const imgW = hipSpan * 4.2;
        const imgH = legH * 2.1;

        ctx.globalAlpha = 0.92;
        ctx.drawImage(prendaImgs.inferior, hipMidX - imgW / 2, hipMidY - legH * 0.55, imgW, imgH);
        ctx.globalAlpha = 1;
    }

    // Calzado (zapatos), que es una sola imagen centrada entre ambos pies
    if (prendaImgs.calzado) {
        // Referencias: 29/30=Talones, 23/24=Caderas (para escala)
        const hLx = lx(23), hRx = lx(24);
        const hipSpan = Math.abs(hRx - hLx);

        const tLx = lx(29), tLy = ly(29);
        const tRx = lx(30), tRy = ly(30);

        // Centro entre ambos pies
        const feetMidX = (tLx + tRx) / 2;
        const feetMidY = (tLy + tRy) / 2;

        // Imagen única más grande
        const shoeW = hipSpan * 2.5;
        const shoeH = shoeW * 0.55;

        ctx.globalAlpha = 0.92;
        ctx.drawImage(prendaImgs.calzado, feetMidX - shoeW / 2, feetMidY - shoeH * 0.1, shoeW, shoeH);
        ctx.globalAlpha = 1;
    }
}

// Flechas animadas a los lados de tu persona
function dibujarFlechas(lm, W, H) {
    const vW = mainMirrorVideo.videoWidth || W;
    const vH = mainMirrorVideo.videoHeight || H;
    const lx = (i) => (1 - lm[i].x) * vW * coverScale + coverOffsetX - containerLeft;
    const ly = (i) => lm[i].y * vH * coverScale + coverOffsetY - containerTop;

    let arrowY, bodyMidX, halfSpan;

    if (arrowCategoria === 'superior') {
        const sLx = lx(11), sRx = lx(12);
        const hLy = ly(23), hRy = ly(24);
        // Pecho (entre hombros y caderas)
        arrowY = (ly(11) + ly(12)) / 2 + ((hLy + hRy) / 2 - (ly(11) + ly(12)) / 2) * 0.3;
        bodyMidX = (sLx + sRx) / 2;
        halfSpan = Math.abs(sRx - sLx) * 0.9;
    } else if (arrowCategoria === 'inferior') {
        const kLx = lx(25), kRx = lx(26);
        arrowY = (ly(25) + ly(26)) / 2; // Rodillas
        bodyMidX = (kLx + kRx) / 2;
        halfSpan = Math.abs(lx(24) - lx(23)); // Distancia caderas aprox
    } else {
        const tLx = lx(29), tRx = lx(30);
        arrowY = (ly(29) + ly(30)) / 2; // Pies / Talones
        bodyMidX = (tLx + tRx) / 2;
        halfSpan = Math.abs(lx(24) - lx(23)) * 0.8;
    }

    const now = performance.now();
    const elapsed = now - arrowFlashStart;
    const isFlashing = arrowFlashStart > 0 && elapsed < ARROW_FLASH_DURATION;
    const popT = isFlashing ? Math.sin((elapsed / ARROW_FLASH_DURATION) * Math.PI) : 0;

    const baseAlpha = 0.55;
    const scaleLeft = arrowDireccion === 'anterior' ? 1 + popT * 0.7 : 1;
    const scaleRight = arrowDireccion === 'siguiente' ? 1 + popT * 0.7 : 1;
    const glowBlurLeft = arrowDireccion === 'anterior' ? 4 + popT * 22 : 0;
    const glowBlurRight = arrowDireccion === 'siguiente' ? 4 + popT * 22 : 0;

    const baseArrowSize = Math.max(22, W * 0.028);
    const pad = baseArrowSize * 0.9;

    const leftX = bodyMidX - halfSpan - pad;
    const rightX = bodyMidX + halfSpan + pad;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Flecha Izquierda (Anterior)
    ctx.globalAlpha = arrowDireccion === 'anterior' && isFlashing ? baseAlpha + popT * 0.45 : baseAlpha;
    ctx.font = `bold ${baseArrowSize * scaleLeft}px sans-serif`;
    ctx.shadowColor = '#4fc3f7';
    ctx.shadowBlur = glowBlurLeft;
    ctx.fillStyle = arrowDireccion === 'anterior' && isFlashing
        ? `rgb(${79 + Math.round(popT * 80)}, ${195 + Math.round(popT * 80)}, 247)` : '#4fc3f7';
    ctx.fillText('◀', leftX, arrowY);

    // Flecha Derecha (Siguiente)
    ctx.globalAlpha = arrowDireccion === 'siguiente' && isFlashing ? baseAlpha + popT * 0.45 : baseAlpha;
    ctx.font = `bold ${baseArrowSize * scaleRight}px sans-serif`;
    ctx.shadowColor = '#4fc3f7';
    ctx.shadowBlur = glowBlurRight;
    ctx.fillStyle = arrowDireccion === 'siguiente' && isFlashing
        ? `rgb(${79 + Math.round(popT * 80)}, ${195 + Math.round(popT * 80)}, 247)` : '#4fc3f7';
    ctx.fillText('▶', rightX, arrowY);

    ctx.restore();
}

// Detección del signo OK
// Criterio:
//   1. Pulgar (4) e índice (8) se tocan → distancia < 40% del tamaño de mano
//   2. Medio (12), anular (16) y meñique (20) están extendidos
//      (punta más alta que su articulación PIP)

function detectOkSign(handLm) {
    // Función para calcular distancia entre dos puntos (Pitágoras)
    const d = (a, b) => Math.hypot(handLm[a].x - handLm[b].x, handLm[a].y - handLm[b].y);

    // El tamaño de la mano nos sirve como referencia para que funcione si estás lejos o cerca
    const handSize = d(0, 9);
    if (handSize < 0.05) return false;

    // Detección de "Pinza". ¿Se están tocando el pulgar (4) y el índice (8)?
    const isPinching = d(4, 8) < handSize * 0.4;

    // Detección de Dedos Extendidos: Los otros 3 dedos deben estar "hacia arriba"
    // (en coordenadas de pantalla, menor 'y' significa más arriba)
    const middleExtended = handLm[12].y < handLm[10].y;
    const ringExtended = handLm[16].y < handLm[14].y;
    const pinkyExtended = handLm[20].y < handLm[18].y;

    return isPinching && middleExtended && ringExtended && pinkyExtended;
}

function procesarGestoMano(handResult, W, H) {
    const now = performance.now();
    const hand = handResult.landmarks && handResult.landmarks[0];

    if (hand && detectOkSign(hand) && now > okCooldownUntil) {
        okFrameCount++;
        dibujarProgresoOk(hand, W, H, okFrameCount / OK_FRAMES_NEEDED);

        if (okFrameCount >= OK_FRAMES_NEEDED) {
            okFrameCount = 0;
            okCooldownUntil = now + OK_COOLDOWN_MS;
            guardarOutfitActual();
        }
    } else {
        if (okFrameCount > 0) okFrameCount = Math.max(0, okFrameCount - 2);
    }
}

// Círculo de progreso alrededor de la mano que hace el ok
function dibujarProgresoOk(handLm, W, H, progress) {
    const vW = mainMirrorVideo.videoWidth || W;
    const vH = mainMirrorVideo.videoHeight || H;
    const cx = (1 - handLm[8].x) * vW * coverScale + coverOffsetX - containerLeft;
    const cy = handLm[8].y * vH * coverScale + coverOffsetY - containerTop;

    ctx.save();
    ctx.strokeStyle = `rgba(79, 195, 247, ${0.3 + progress * 0.7})`;
    ctx.lineWidth = 4;
    ctx.shadowColor = '#4fc3f7';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, 36, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.stroke();

    // Texto de ayuda
    ctx.fillStyle = `rgba(255,255,255,${progress})`;
    ctx.font = `bold ${Math.max(14, W * 0.018)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowBlur = 6;
    ctx.fillText('💾 Mantén…', cx, cy + 44);
    ctx.restore();
}

// Mensaje verde al guardar
function dibujarFeedbackGuardado(W, H) {
    const elapsed = performance.now() - outfitSaveFlash;
    if (elapsed > SAVE_FLASH_DURATION) { outfitSaveFlash = 0; return; }

    const t = elapsed / SAVE_FLASH_DURATION;
    const alpha = t < 0.2 ? t / 0.2 : t > 0.7 ? (1 - t) / 0.3 : 1;

    const texto = '✅ Outfit guardado!';
    const fontSize = Math.max(20, W * 0.032);

    // Centro de la pantalla completa
    const centerX = window.innerWidth / 2 - containerLeft;
    const centerY = window.innerHeight / 2 - containerTop;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const textWidth = ctx.measureText(texto).width;
    const bw = textWidth + 60;  // padding horizontal
    const bh = fontSize + 50;   // padding vertical
    const bx = centerX - bw / 2;
    const by = centerY - bh / 2;

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.moveTo(bx + 16, by);
    ctx.lineTo(bx + bw - 16, by);
    ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + 16);
    ctx.lineTo(bx + bw, by + bh - 16);
    ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - 16, by + bh);
    ctx.lineTo(bx + 16, by + bh);
    ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - 16);
    ctx.lineTo(bx, by + 16);
    ctx.quadraticCurveTo(bx, by, bx + 16, by);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#2ecc71';
    ctx.shadowColor = '#2ecc71';
    ctx.shadowBlur = 16;
    ctx.fillText(texto, centerX, centerY);
    ctx.restore();
}

// Llamada al servidor para guardar el outfit
async function guardarOutfitActual() {
    if (!window.getCurrentOutfit || !window.currentUser) return;

    const outfitData = window.getCurrentOutfit();
    if (Object.keys(outfitData).length === 0) return;

    try {
        const res = await fetch(`/api/outfits/${encodeURIComponent(window.currentUser)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prendas: outfitData }),
        });
        const saved = await res.json();
        console.log('Outfit guardado, id:', saved.id);
        outfitSaveFlash = performance.now();
        if (window.onOutfitGuardado) window.onOutfitGuardado(saved);
    } catch (err) {
        console.error('Error guardando outfit:', err);
    }
}

// Mensaje amarillo al poner un outfit aleatorio
function dibujarFeedbackRandom(W, H) {
    const elapsed = performance.now() - outfitRandomFlash;
    if (elapsed > RANDOM_FLASH_DURATION) { outfitRandomFlash = 0; return; }

    const t = elapsed / RANDOM_FLASH_DURATION;
    // Fade in rápido y fade out un poco más lento
    const alpha = t < 0.2 ? t / 0.2 : t > 0.7 ? (1 - t) / 0.3 : 1;

    const texto = '🎲 Outfit aleatorio!';
    const fontSize = Math.max(20, W * 0.032);

    // Centro de la pantalla completa
    const centerX = window.innerWidth / 2 - containerLeft;
    const centerY = window.innerHeight / 2 - containerTop;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const textWidth = ctx.measureText(texto).width;
    const bw = textWidth + 60;  // padding horizontal
    const bh = fontSize + 50;   // padding vertical
    const bx = centerX - bw / 2;
    const by = centerY - bh / 2;

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.moveTo(bx + 16, by);
    ctx.lineTo(bx + bw - 16, by);
    ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + 16);
    ctx.lineTo(bx + bw, by + bh - 16);
    ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - 16, by + bh);
    ctx.lineTo(bx + 16, by + bh);
    ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - 16);
    ctx.lineTo(bx, by + 16);
    ctx.quadraticCurveTo(bx, by, bx + 16, by);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffeb3b';
    ctx.shadowColor = '#fbc02d';
    ctx.shadowBlur = 16;
    ctx.fillText(texto, centerX, centerY);
    ctx.restore();
}

// Actualizar prenda en el espejo
function actualizarPrendaEspejo(categoria, prendaData, direccion) {
    if (!prendaData) {
        prendaImgs[categoria] = null;
        return;
    }
    const img = new Image();
    img.onload = () => { prendaImgs[categoria] = img; };
    img.src = prendaData.image;

    arrowCategoria = categoria;
    arrowDireccion = direccion || null;
    arrowFlashStart = performance.now();
}

// Actualizar categoría en el espejo
function actualizarCategoriaEspejo(categoria) {
    arrowCategoria = categoria;
    arrowDireccion = null; // solo actualizamos posición, sin animar flash izquierdo/derecho
}

// Mostrar feedback de outfit aleatorio
function mostrarFeedbackRandom() {
    outfitRandomFlash = performance.now();
}

window.initEspejo = initEspejo;
window.actualizarPrendaEspejo = actualizarPrendaEspejo;
window.actualizarCategoriaEspejo = actualizarCategoriaEspejo;
window.mostrarFeedbackRandom = mostrarFeedbackRandom;

// Lógica del probador
const categorias = ['superior', 'inferior', 'calzado'];
const categoriasLabels = { superior: '👕 Superior', inferior: '👖 Inferior', calzado: '👟 Calzado' };
let categoriaActiva = 'superior';
const indicesOutfit = { superior: 0, inferior: 0, calzado: 0 };

window.getCurrentOutfit = function () {
    const data = {};
    categorias.forEach(cat => {
        const prendas = (window.listaPrendas || []).filter(p => p.categoria === cat);
        if (prendas.length > 0) {
            data[cat] = prendas[indicesOutfit[cat]];
        }
    });
    return data;
};

// Genera un outfit a partir de un outfitId guardado (es decir, cargamos un outfit guardado en el probador)
window.cargarOutfitEnProbador = function (outfit) {
    Object.keys(outfit.prendas).forEach(cat => {
        const prendaGuardada = outfit.prendas[cat];
        const lista = (window.listaPrendas || []).filter(p => p.categoria === cat);
        const idx = lista.findIndex(p => p.id === prendaGuardada.id);
        if (idx !== -1) {
            indicesOutfit[cat] = idx;
            if (window.actualizarPrendaEspejo) {
                window.actualizarPrendaEspejo(cat, lista[idx]);
            }
        }
    });
    window.actualizarOutfitUI();
};

// Actualiza la lista de prendas en el panel de outfits 
window.actualizarOutfitUI = function () {
    const outfitPanel = document.getElementById('outfitPanel');
    if (!outfitPanel) return;

    let html = '<ul class="details-list">';
    categorias.forEach(cat => {
        const prendas = (window.listaPrendas || []).filter(p => p.categoria === cat);
        const idx = indicesOutfit[cat];
        const prenda = prendas[idx] || null;
        const active = cat === categoriaActiva ? ' <span style="color:#4fc3f7">◀</span>' : '';
        html += `<li><strong>${categoriasLabels[cat]}:</strong> ${prenda ? prenda.clase : '—'}${active}</li>`;
    });
    html += '</ul>';
    outfitPanel.innerHTML = html;
};

document.addEventListener('DOMContentLoaded', () => {
    const socket = window.mirrorSocket;
    if (!socket) return;

    socket.on('cambiarPrenda', (data) => {
        if (window.resetIdleTimer) window.resetIdleTimer();
        const { categoria, direccion } = data;
        const prendas = (window.listaPrendas || []).filter(p => p.categoria === categoria);
        if (!prendas.length) return;

        if (direccion === 'siguiente') {
            indicesOutfit[categoria] = (indicesOutfit[categoria] + 1) % prendas.length;
        } else {
            indicesOutfit[categoria] = (indicesOutfit[categoria] - 1 + prendas.length) % prendas.length;
        }

        const prenda = prendas[indicesOutfit[categoria]];
        if (window.actualizarPrendaEspejo) window.actualizarPrendaEspejo(categoria, prenda, direccion);
        window.actualizarOutfitUI();
        console.log(`Outfit ${categoria}: ${prenda.clase}`);
    });

    socket.on('randomizarOutfit', () => {
        if (window.resetIdleTimer) window.resetIdleTimer();
        console.log('Generando outfit aleatorio...');

        categorias.forEach(categoria => {
            const prendas = (window.listaPrendas || []).filter(p => p.categoria === categoria);
            if (prendas.length > 0) {
                indicesOutfit[categoria] = Math.floor(Math.random() * prendas.length);
                const prenda = prendas[indicesOutfit[categoria]];
                if (window.actualizarPrendaEspejo) {
                    window.actualizarPrendaEspejo(categoria, prenda, 'siguiente');
                }
            }
        });

        if (window.mostrarFeedbackRandom) {
            window.mostrarFeedbackRandom();
        }

        window.actualizarOutfitUI();
    });

    socket.on('cambiarCategoria', (data) => {
        if (window.resetIdleTimer) window.resetIdleTimer();
        const idx = categorias.indexOf(categoriaActiva);
        if (data.direccion === 'siguiente') {
            categoriaActiva = categorias[(idx + 1) % categorias.length];
        } else {
            categoriaActiva = categorias[(idx - 1 + categorias.length) % categorias.length];
        }
        socket.emit('categoriaActualizada', { categoria: categoriaActiva });
        if (window.actualizarCategoriaEspejo) window.actualizarCategoriaEspejo(categoriaActiva);
        window.actualizarOutfitUI();
        console.log(`Categoría activa: ${categoriaActiva}`);
    });

    socket.on('activarEspejo', () => {
        console.log("Activando espejo desde socket");
        if (window.activarVista) window.activarVista('outfit');
    });
});
