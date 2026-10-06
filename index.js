import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { networkInterfaces } from 'node:os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Rutas de almacenamiento
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const STORAGE_DIR = join(__dirname, 'storage');

// Crear la carpeta storage/ si no existe
if (!existsSync(STORAGE_DIR)) {
    mkdirSync(STORAGE_DIR, { recursive: true });
    console.log('Carpeta storage/ creada');
}

// Funciones auxiliares de almacenamiento:

// Devuelve el clima por defecto según la clase de prenda
function climaPorClase(clase) {
    const c = (clase || '').toLowerCase();
    if (c.includes('sudadera')) return 'Medio/Frío';
    if (c.includes('camiseta')) return 'Calor';
    if (c.includes('pantalón') || c.includes('pantalones') || c.includes('pantalon')) return 'Todos';
    if (c.includes('zapato') || c.includes('zapatillas') || c.includes('botas')) return 'Todos';
    return 'Todos';
}

// Normaliza el nombre de usuario para usarlo como nombre de fichero 
function normalizarUsuario(nombre) {
    return nombre.toLowerCase().trim().replace(/\s+/g, '_');
}

// Devuelve la ruta completa al JSON de un usuario 
function rutaUsuario(nombre) {
    return join(STORAGE_DIR, `${normalizarUsuario(nombre)}.json`);
}

// Lee los datos de un usuario. Si no existe, devuelve un objeto vacío con prendas: [] 
function leerUsuario(nombre) {
    const ruta = rutaUsuario(nombre);
    if (!existsSync(ruta)) {
        return { usuario: nombre, prendas: [] };
    }
    try {
        const raw = readFileSync(ruta, 'utf-8');
        return JSON.parse(raw);
    } catch (err) {
        console.error(`Error leyendo ${ruta}:`, err);
        return { usuario: nombre, prendas: [] };
    }
}

// Guarda los datos de un usuario en su archivo JSON 
function guardarUsuario(nombre, data) {
    const ruta = rutaUsuario(nombre);
    writeFileSync(ruta, JSON.stringify(data, null, 2), 'utf-8');
}

// Express + Socket.IO
const app = express();
const server = createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 5e6 // 5MB para permitir envío de imágenes base64 (ia)
});

// Middleware para habilitar SharedArrayBuffer (necesario para @imgly/background-removal)
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
});

// parsear JSON (límite ampliado para imágenes)
app.use(express.json({ limit: '10mb' }));

// Servir archivos estáticos desde la carpeta 'public'
app.use(express.static('public'));

// API REST. Almacenamiento de prendas
import { readdirSync } from 'node:fs';

// GET /api/nuevo-usuario-anonimo devuelve el siguiente nombre usuario_X disponible
app.get('/api/nuevo-usuario-anonimo', (req, res) => {
    let maxNum = 0;
    try {
        const files = readdirSync(STORAGE_DIR);
        for (const file of files) {
            const match = file.match(/^usuario_(\d+)\.json$/);
            if (match) {
                const num = parseInt(match[1]);
                if (num > maxNum) maxNum = num;
            }
        }
    } catch (err) {
        console.error('Error leyendo directorio storage para nuevo usuario:', err);
    }
    res.json({ nombre: `usuario_${maxNum + 1}` });
});

// GET /api/prendas/:usuario para obtener todas las prendas de un usuario
app.get('/api/prendas/:usuario', (req, res) => {
    const nombre = req.params.usuario;
    const data = leerUsuario(nombre);
    res.json(data.prendas);
});

// POST /api/prendas/:usuario para añadir una prenda nueva
app.post('/api/prendas/:usuario', (req, res) => {
    const nombre = req.params.usuario;
    const { clase, categoria, image, color, guardado } = req.body;

    if (!image) {
        return res.status(400).json({ error: 'Falta la imagen de la prenda' });
    }

    const data = leerUsuario(nombre);

    // Auto-incrementar el ID basándose en el máximo existente
    const maxId = data.prendas.reduce((max, p) => Math.max(max, p.id), -1);
    const claseNorm = clase || 'Sin definir';
    const colorNorm = color || 'Sin definir';
    const guardadoNorm = guardado || 'Sin definir';
    const nuevaPrenda = {
        id: maxId + 1,
        clase: claseNorm,
        categoria: categoria || 'superior',
        color: colorNorm,
        image: image,
        Clima: climaPorClase(claseNorm),
        NumUsos: 0,
        guardado: guardadoNorm,
    };

    data.prendas.push(nuevaPrenda);
    guardarUsuario(nombre, data);

    console.log(`Prenda guardada para ${nombre}: id=${nuevaPrenda.id}, clase=${nuevaPrenda.clase}, guardado=${nuevaPrenda.guardado}`);
    res.json(nuevaPrenda);
});

// DELETE /api/prendas/:usuario/:id para eliminar una prenda por ID
app.delete('/api/prendas/:usuario/:id', (req, res) => {
    const nombre = req.params.usuario;
    const id = parseInt(req.params.id);

    const data = leerUsuario(nombre);
    const idx = data.prendas.findIndex(p => p.id === id);

    if (idx === -1) {
        return res.status(404).json({ error: 'Prenda no encontrada' });
    }

    // Borrado en cascada de outfits, es decir, si se borra una prenda, se borran los outfits que la contienen
    if (data.outfits) {
        const outfitsAntes = data.outfits.length;
        data.outfits = data.outfits.filter(o => {
            // Un outfit se borra si alguna de sus prendas tiene el ID buscado
            const tienePrenda = Object.values(o.prendas).some(p => p && p.id === id);
            return !tienePrenda;
        });
        const borrados = outfitsAntes - data.outfits.length;
        if (borrados > 0) console.log(`Borrados ${borrados} outfits que contenían la prenda id=${id}`);
    }

    data.prendas.splice(idx, 1);
    guardarUsuario(nombre, data);

    console.log(`Prenda eliminada para ${nombre}: id=${id}`);
    res.json({ ok: true, id });
});

// GET /api/outfits/:usuario para obtener todos los outfits guardados
app.get('/api/outfits/:usuario', (req, res) => {
    const data = leerUsuario(req.params.usuario);
    res.json(data.outfits || []);
});

// POST /api/outfits/:usuario para guardar un outfit nuevo
app.post('/api/outfits/:usuario', (req, res) => {
    const nombre = req.params.usuario;
    const { prendas } = req.body;

    if (!prendas || Object.keys(prendas).length === 0) {
        return res.status(400).json({ error: 'El outfit está vacío' });
    }

    const data = leerUsuario(nombre);
    if (!data.outfits) data.outfits = [];

    const maxId = data.outfits.reduce((m, o) => Math.max(m, o.id), -1);
    const nuevoOutfit = {
        id: maxId + 1,
        fecha: new Date().toISOString(),
        prendas,
    };

    data.outfits.push(nuevoOutfit);

    // Incrementamos NumUsos de las prendas que forman parte del outfit
    Object.values(prendas).forEach(prendaOutfit => {
        if (prendaOutfit && prendaOutfit.id !== undefined) {
            const prendaEnStorage = data.prendas.find(p => p.id === prendaOutfit.id);
            if (prendaEnStorage) {
                prendaEnStorage.NumUsos = (prendaEnStorage.NumUsos || 0) + 1;
                console.log(`Prenda id=${prendaEnStorage.id} (${prendaEnStorage.clase}): NumUsos=${prendaEnStorage.NumUsos}`);
            }
        }
    });


    guardarUsuario(nombre, data);

    console.log(`Outfit guardado para ${nombre}: id=${nuevoOutfit.id}`);
    res.json(nuevoOutfit);
});

// DELETE /api/outfits/:usuario/:id para eliminar un outfit
app.delete('/api/outfits/:usuario/:id', (req, res) => {
    const nombre = req.params.usuario;
    const id = parseInt(req.params.id);

    const data = leerUsuario(nombre);
    if (!data.outfits) return res.status(404).json({ error: 'No hay outfits' });

    const idx = data.outfits.findIndex(o => o.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Outfit no encontrado' });

    data.outfits.splice(idx, 1);
    guardarUsuario(nombre, data);

    console.log(`Outfit ${id} eliminado para ${nombre}`);
    res.json({ ok: true, id });
});

// Socket.IO .Eventos en tiempo real
io.on('connection', (socket) => {

    console.log(`Un usuario se ha conectado: ${socket.id}`);

    socket.on('disconnect', () => {
        console.log(`Usuario desconectado: ${socket.id}`);
    });

    // El espejo informa de quién es el usuario detectado por la cámara de bienvenida
    socket.on('usuarioDetectado', (nombre) => {
        console.log(`Usuario detectado: ${nombre}`);
        socket.broadcast.emit('usuarioDetectado', nombre);
    });

    // El servidor recibe la orden del mando
    socket.on('cambiarModo', (modo) => {
        console.log(`El mando solicita cambiar al modo: ${modo}`);
        socket.broadcast.emit('nuevoModo', modo);
    });

    // El servidor retransmite la posición del puntero al espejo
    socket.on('moverPuntero', (data) => {
        socket.broadcast.emit('actualizarPuntero', data);
    });

    // El servidor retransmite el click del puntero al espejo
    socket.on('pointerClick', () => {
        socket.broadcast.emit('pointerClick');
    });

    // El servidor retransmite la nueva prenda al espejo
    socket.on('nuevaPrenda', (data) => {
        console.log('Nueva prenda recibida, retransmitiendo al espejo');
        socket.broadcast.emit('nuevaPrenda', data);
    });

    // El servidor retransmite eventos de filtro al espejo
    socket.on('mostrarFiltro', (data) => {
        socket.broadcast.emit('mostrarFiltro', data);
    });

    // El servidor retransmite la actualización de la UI del filtro al espejo
    socket.on('actualizarFiltroUI', (data) => {
        socket.broadcast.emit('actualizarFiltroUI', data);
    });

    // El servidor retransmite la aplicación del filtro al espejo
    socket.on('aplicarFiltro', (data) => {
        console.log('Aplicando filtro:', data);
        socket.broadcast.emit('aplicarFiltro', data);
    });

    // El servidor retransmite la limpieza de filtros al espejo
    socket.on('limpiarFiltro', () => {
        console.log('Limpiando filtros');
        socket.broadcast.emit('limpiarFiltro');
    });

    // El servidor retransmite el evento de Roberto al espejo
    socket.on('eventRoberto', () => {
        console.log('Easter egg de Roberto activado');
        socket.broadcast.emit('eventRoberto');
    });

    // El servidor retransmite la solicitud de ayuda al espejo
    socket.on('mostrarInfo', () => {
        console.log('Solicitud de ayuda (info) recibida');
        socket.broadcast.emit('mostrarInfo');
    })

    // El servidor retransmite la activación del probador al espejo
    socket.on('activarEspejo', () => {
        console.log('[espejo] activar');
        socket.broadcast.emit('activarEspejo');
    });

    // El servidor retransmite el cambio de prenda al espejo
    socket.on('cambiarPrenda', (data) => {
        console.log(`[outfit] cambiarPrenda cat=${data.categoria} dir=${data.direccion}`);
        socket.broadcast.emit('cambiarPrenda', data);
    });

    // El servidor retransmite el cambio de categoría al espejo
    socket.on('cambiarCategoria', (data) => {
        console.log(`[outfit] cambiarCategoria dir=${data.direccion}`);
        socket.broadcast.emit('cambiarCategoria', data);
    });

    // El servidor retransmite la generación de un outfit aleatorio al espejo
    socket.on('randomizarOutfit', () => {
        console.log('[outfit] randomizarOutfit');
        socket.broadcast.emit('randomizarOutfit');
    });

    // El servidor retransmite la confirmación de la categoría activa al espejo
    socket.on('categoriaActualizada', (data) => {
        socket.broadcast.emit('categoriaActualizada', data);
    });
});

// Obtenemos la IP local 
function getLocalIP() {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
}

// Arrancamos el servidor
const PORT = 3000;
server.listen(PORT, () => {
    const ip = getLocalIP();
    console.log('');
    console.log('╔════════════════════════════════════════════════════╗');
    console.log(`   Local:   http://localhost:${PORT}`);
    console.log(`   Red:     http://${ip}:${PORT}`);
    console.log('╠════════════════════════════════════════════════════╣');
    console.log(`   Espejo:  http://localhost:${PORT}/mirror.html`);
    console.log(`   Móvil:   http://${ip}:${PORT}/mobile.html`);
    console.log('╚════════════════════════════════════════════════════╝');
    console.log('');
});