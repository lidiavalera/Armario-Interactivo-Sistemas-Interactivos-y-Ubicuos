// Cámara para capturar prendas + eliminación de fondo con @imgly/background-removal
// Basado en ubicomp-main/17.webapi_camera/camera.js
// Clasificación basada en ubicomp-main/16.teachablemachine/script.js

const socket = io();

// Usuario activo (se recibe del espejo cuando detecta la cara)
let usuarioActivo = 'Usuario';
socket.on('usuarioDetectado', (nombre) => {
    usuarioActivo = nombre;
    console.log(`Usuario activo para cámara: ${nombre}`);
});

const videoElement = document.querySelector('#webcam');
const canvas = document.querySelector('#outputCanvas');
const ctx = canvas.getContext('2d');

const captureBtn = document.getElementById('captureBtn');
const retryBtn = document.getElementById('retryBtn');
const saveBtn = document.getElementById('saveBtn');
const statusMsg = document.getElementById('statusMsg');
const connectionDot = document.getElementById('connectionDot');

// Indicador de conexión 
socket.on('connect', () => {
    connectionDot.classList.add('online');
    connectionDot.classList.remove('offline');
});

socket.on('disconnect', () => {
    connectionDot.classList.remove('online');
    connectionDot.classList.add('offline');
});

// Teachable Machine — basado en ubicomp-main/16.teachablemachine/script.js
// URL del modelo exportado desde Teachable Machine
const URL = "https://teachablemachine.withgoogle.com/models/GewJ4EHiO/";

let model, maxPredictions;

// Carga del modelo
async function initModel() {
    const modelURL = URL + "model.json";
    const metadataURL = URL + "metadata.json";

    // Carga el modelo y los metadatos
    model = await tmImage.load(modelURL, metadataURL);
    maxPredictions = model.getTotalClasses();
    console.log(`Modelo cargado: ${maxPredictions} clases`);
}

// Realiza la predicción
async function predict(canvasElement) {
    // El modelo puede predecir desde una imagen, video o canvas
    const prediction = await model.predict(canvasElement);

    // Buscar la clase con mayor probabilidad
    let bestClass = prediction[0];
    for (let i = 1; i < maxPredictions; i++) {
        if (prediction[i].probability > bestClass.probability) {
            bestClass = prediction[i];
        }
    }

    console.log(`Predicción: ${bestClass.className} (${bestClass.probability.toFixed(2)})`);
    return bestClass.className;
}


// ELIMINACIÓN DE FONDO con @imgly/background-removal
// Esta librería acepta: File, Blob, URL, ImageData, HTMLImageElement...
// Nosotros le pasamos el canvas convertido a Blob.
// Devuelve un Blob PNG con fondo transparente.

// Opciones de configuración
const BG_REMOVAL_CONFIG = {
    progress: (key, current, total) => {
        if (total > 0) {
            const pct = Math.round((current / total) * 100);
            statusMsg.textContent = `✂️ Eliminando fondo... ${pct}%`;
        }
    },
    model: 'medium',
};

/**
 * Recibe un canvas con la foto capturada.
 * Devuelve un data URL (PNG) con el fondo eliminado (transparente).
 * Si el segmentador no está disponible, devuelve la imagen original.
 */
async function quitarFondo(srcCanvas) {
    try {
        // Cargamos dinámicamente la librería para evitar que un error de import rompa todo el archivo js
        const moduleURL = "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.3/+esm";
        const { removeBackground } = await import(moduleURL);

        // Convertimos el canvas a Blob (el formato que acepta la librería)
        const blob = await new Promise(resolve =>
            srcCanvas.toBlob(resolve, 'image/png')
        );

        // Llamamos a la librería, que devuelve un Blob PNG transparente
        const resultBlob = await removeBackground(blob, BG_REMOVAL_CONFIG);

        // Convertimos el Blob a data URL para enviar por socket y mostrar en img
        const dataURL = await blobToDataURL(resultBlob);
        return dataURL;

    } catch (err) {
        console.error('Error al quitar el fondo:', err);
        statusMsg.textContent = `⚠️ Error al recortar: ${err.message || 'Desconocido'}`;
        // Damos tiempo extra para que el usuario lea el mensaje de error
        await new Promise(r => setTimeout(r, 2000));
        // Devolvemos la imagen original sin modificar
        return srcCanvas.toDataURL('image/png');
    }
}
function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}


// Cámara — basado en ubicomp-main/17.webapi_camera/camera.js

// Configuración de acceso a la cámara
async function initCamera() {
    const constraints = {
        video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
        },
        audio: false
    };

    try {
        const currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement.srcObject = currentStream;

        // Ajustamos el tamaño del canvas al del video real
        videoElement.onloadedmetadata = () => {
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
        };

        statusMsg.textContent = 'Cámara lista. Apunta a la prenda y pulsa «Capturar Foto»';
    } catch (err) {
        console.error('Error accediendo a la cámara:', err);
        statusMsg.textContent = '❌ Error: no se pudo acceder a la cámara';
    }
}

// Lógica de botones

// Captura la foto, que congela el frame y muestra la captura
captureBtn.addEventListener('click', () => {
    // Dibujar el frame actual del video en el canvas
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

    // Muestra el canvas (foto congelada) sobre el video
    canvas.style.display = 'block';

    // Cambia los botones visibles
    captureBtn.classList.add('hidden');
    retryBtn.classList.remove('hidden');
    saveBtn.classList.remove('hidden');

    statusMsg.textContent = '📷 Foto capturada. ¿Quieres guardarla?';
});

// Boton de reintentar la foto, que vuelve al modo de vídeo en vivo
retryBtn.addEventListener('click', () => {
    // Oculta el canvas, vuelve a mostrar el video
    canvas.style.display = 'none';

    // Cambia los botones visibles
    captureBtn.classList.remove('hidden');
    retryBtn.classList.add('hidden');
    saveBtn.classList.add('hidden');

    statusMsg.textContent = 'Apunta la cámara a una prenda y pulsa «Capturar Foto»';
});

const btnVolver = document.getElementById('btnVolver');
if (btnVolver) {
    btnVolver.addEventListener('click', () => {
        // Enviar evento de reset de modo al PC
        socket.emit('cambiarModo', 'armario');
        window.location.href = 'mobile.html';
    });
}

// Mapa de valores del select a etiquetas legibles
const GUARDADO_LABELS = {
    cajonTodos: 'Cajón',
    perchaTodos: 'Percha',
    cajonVerano: 'Cajón (armario verano)',
    perchaVerano: 'Percha (armario verano)',
    cajonInvierno: 'Cajón (armario invierno)',
    perchaInvierno: 'Percha (armario invierno)',
};

const selectAlmacenamiento = document.getElementById('almacenamiento');

// Botón de confirmar y guardar la foto, que clasifica la imagen y la envía al espejo
saveBtn.addEventListener('click', async () => {
    captureBtn.classList.add('hidden');
    retryBtn.classList.add('hidden');
    saveBtn.classList.add('hidden');

    // Leer la opción seleccionada del formulario de almacenamiento
    const almacenamientoValue = selectAlmacenamiento ? selectAlmacenamiento.value : '';
    let guardado = 'Sin definir';
    if (almacenamientoValue) {
        guardado = GUARDADO_LABELS[almacenamientoValue];
    }

    // Quitamos el fondo
    statusMsg.textContent = '✂️ Eliminando fondo...';
    const imageDataURL = await quitarFondo(canvas);

    // Clasificamos con Teachable Machine (sobre el canvas original, sin transparencia)
    statusMsg.textContent = '🔄 Clasificando prenda...';
    let clase = 'Sin definir';
    if (model) clase = await predict(canvas);

    const categoria = claseACategoria(clase);
    let color = 'Sin definir';
    if (clase == 'Pantalon') {
        color = 'azul';
    } else if (clase == 'Sudadera') {
        color = 'negro';
    } else if (clase == 'Camiseta') {
        color = 'blanco';
    } else if (clase == 'Zapato') {
        color = 'negro';
    }

    // Emitir al servidor (incluimos el usuario activo y la ubicación de guardado)
    socket.emit('nuevaPrenda', { image: imageDataURL, clase, categoria, usuario: usuarioActivo, color, guardado });

    statusMsg.textContent = `✅ ¡Prenda guardada! (${clase})`;
    statusMsg.classList.add('success');

    setTimeout(() => {
        canvas.style.display = 'none';
        captureBtn.classList.remove('hidden');
        statusMsg.textContent = 'Apunta la cámara a una prenda y pulsa «Capturar Foto»';
        statusMsg.classList.remove('success');
    }, 1800);
});

// Convierte la clase de Teachable Machine en una categoría para el espejo
function claseACategoria(clase) {
    const c = clase.toLowerCase();
    if (['pantalon'].some(k => c.includes(k))) return 'inferior';
    if (['zapato'].some(k => c.includes(k))) return 'calzado';
    // Sudadera y Camiseta es prenda superior
    return 'superior';
}

// Arrancamos la aplicación, es decir, la cámara y el modelo
async function start() {
    await initCamera();
    statusMsg.textContent = '🔄 Cargando modelos...';
    await initModel();
    statusMsg.textContent = 'Cámara lista. Apunta a la prenda y pulsa «Capturar Foto»';
}

start();
