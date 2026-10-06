// Pantalla de bienvenida con reconocimiento facial
// Basado en el código de Teachable Machine que hemos exportado

// URL del modelo de reconocimiento facial entrenado en Teachable Machine
const MODEL_URL = "https://teachablemachine.withgoogle.com/models/VoVPz88yN/";

// Umbral de confianza para considerar que ha detectado a alguien
const CONFIDENCE_THRESHOLD = 0.85;

// Cuántos frames seguidos debe detectar al usuario para confirmar
const FRAMES_NEEDED = 15;

let faceModel, webcam, maxPredictions;
let detectedFrames = 0;
let recognized = false;

// Referencias DOM
const welcomeScreen = document.getElementById('welcomeScreen');
const welcomeStatus = document.getElementById('welcomeStatus');
const welcomeGreeting = document.getElementById('welcomeGreeting');
const greetingText = document.getElementById('greetingText');
const mirrorInterface = document.getElementById('mirrorInterface');
const welcomeCameraContainer = document.getElementById('welcomeCameraContainer');

// Inicialización
async function initWelcome() {
    const modelURL = MODEL_URL + "model.json";
    const metadataURL = MODEL_URL + "metadata.json";

    try {
        // Cargar el modelo y los metadatos
        faceModel = await tmImage.load(modelURL, metadataURL);
        maxPredictions = faceModel.getTotalClasses();
        console.log(`Modelo de caras cargado: ${maxPredictions} clases`);

        // Configurar la webcam
        const flip = true; // Efecto espejo para que sea natural
        webcam = new tmImage.Webcam(320, 320, flip);
        await webcam.setup();
        await webcam.play();

        // Añadir el canvas de la webcam al contenedor
        welcomeCameraContainer.appendChild(webcam.canvas);

        welcomeStatus.textContent = 'Mírate al espejo...';

        // Iniciar el bucle de detección
        window.requestAnimationFrame(welcomeLoop);

    } catch (err) {
        console.error('Error al cargar el modelo de bienvenida:', err);
        welcomeStatus.textContent = '⚠️ Error al cargar el modelo. Usando usuario anónimo...';
        // Si falla, pedir nombre anónimo al servidor y entrar al espejo tras 2 segundos
        try {
            const res = await fetch('/api/nuevo-usuario-anonimo');
            const data = await res.json();
            setTimeout(() => enterMirror(data.nombre), 2000);
        } catch {
            setTimeout(() => enterMirror('usuario_1'), 2000);
        }
    }
}

// Bucle de detección
async function welcomeLoop() {
    if (recognized) return; // Ya se detectó, parar

    webcam.update(); // Actualizar el frame de la webcam
    await welcomePredict();
    window.requestAnimationFrame(welcomeLoop);
}

// Predicción
async function welcomePredict() {
    // Predecir usando el canvas de la webcam
    const prediction = await faceModel.predict(webcam.canvas);

    // Buscar la clase con mayor probabilidad
    let bestClass = prediction[0];
    for (let i = 1; i < maxPredictions; i++) {
        if (prediction[i].probability > bestClass.probability) {
            bestClass = prediction[i];
        }
    }

    // Mostrar qué está viendo
    welcomeStatus.textContent = `Detectando... ${bestClass.className} (${(bestClass.probability * 100).toFixed(0)}%)`;

    // Si la confianza supera el umbral y no es una clase genérica tipo "Nada"/"Background"
    const isBackground = bestClass.className.toLowerCase().includes('nada') ||
        bestClass.className.toLowerCase().includes('background') ||
        bestClass.className.toLowerCase().includes('fondo') ||
        bestClass.className.toLowerCase().includes('nadie');

    if (bestClass.probability > CONFIDENCE_THRESHOLD && !isBackground) {
        detectedFrames++;

        if (detectedFrames >= FRAMES_NEEDED) {
            // Hemos reconocido a alguien asi que mostramos la bienvenida
            recognized = true;

            let nombre = bestClass.className;
            if (!nombre || nombre.trim() === '') {
                try {
                    const res = await fetch('/api/nuevo-usuario-anonimo');
                    const data = await res.json();
                    enterMirror(data.nombre);
                    return;
                } catch {
                    enterMirror('usuario_1');
                    return;
                }
            }
            enterMirror(nombre);
        }
    } else {
        // Resetear contador si pierde la detección
        detectedFrames = Math.max(0, detectedFrames - 1);
    }
}

// Transición a la interfaz principal
function enterMirror(userName) {
    console.log(`¡Bienvenid@ ${userName}!`);

    // Guardar el nombre del usuario para que mirror.js lo use
    window.currentUser = userName;

    // Informar al servidor de quién es el usuario
    if (window.mirrorSocket) {
        window.mirrorSocket.emit('usuarioDetectado', userName);
    }

    // Parar la webcam
    if (webcam) {
        webcam.stop();
    }

    // Mostrar el saludo
    greetingText.textContent = `¡Bienvenid@ ${userName}! 👋`;
    welcomeGreeting.classList.remove('hidden');
    welcomeGreeting.classList.add('animate-greeting');

    // Ocultar la cámara y el texto de estado
    document.querySelector('.welcome-content').classList.add('fade-out');

    // Tras la animación del saludo, hacer la transición al espejo
    setTimeout(() => {
        // Desvanecer la pantalla de bienvenida
        welcomeScreen.classList.add('fade-out');

        setTimeout(() => {
            // Ocultar completamente la bienvenida y mostrar el espejo
            welcomeScreen.classList.add('hidden');
            mirrorInterface.classList.remove('hidden');
            mirrorInterface.classList.add('fade-in');

            // Arrancar la cámara de fondo (espejo real)
            if (window.initMainMirror) {
                window.initMainMirror();
            }

            // Cargar las prendas del usuario desde el servidor
            if (window.cargarPrendasUsuario) {
                window.cargarPrendasUsuario(userName);
            }
        }, 800);
    }, 3000); // Mostrar el saludo durante 3 segundos
}

// Arrancar
initWelcome();
