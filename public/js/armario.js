// Armario. Lógica de prendas y catálogo

// Lista de prendas del armario
window.listaPrendas = [];

// Recibir nuevas prendas desde la cámara del móvil
const catalogGrid = document.getElementById('catalogGrid');

function categoriaEmoji(cat) {
    const map = { superior: '👕', inferior: '👖', calzado: '👟' };
    return map[cat] || '👗';
}

// Devuelve el clima por defecto según la clase de prenda
function climaPorClase(clase) {
    const c = (clase || '').toLowerCase();
    if (c.includes('sudadera')) return 'Medio/Frío';
    if (c.includes('camiseta')) return 'Calor';
    if (c.includes('pantalón') || c.includes('pantalones') || c.includes('pantalon')) return 'Todos';
    if (c.includes('zapato') || c.includes('zapatillas') || c.includes('botas')) return 'Todos';
    return 'Todos';
}

// getDetalles, que usa listaPrendas para coger los datos de la prenda
function getDetalles(claseStr, prendaId) {
    // Intentar buscar datos reales en listaPrendas
    if (prendaId !== undefined) {
        const prenda = window.listaPrendas.find(p => p.id === parseInt(prendaId));
        if (prenda) {
            return {
                tipo: (prenda.clase || 'sin definir').toLowerCase(),
                color: prenda.color || 'sin definir',
                clima: prenda.Clima || climaPorClase(prenda.clase),
            };
        }
    }
    const c = (claseStr || '').toLowerCase().trim();
    if (c.includes('sudadera')) return { tipo: 'sudadera', color: 'negra', clima: 'Medio/Frío' };
    if (c.includes('camiseta')) return { tipo: 'camiseta', color: 'blanco', clima: 'Calor' };
    if (c.includes('pantalón') || c.includes('pantalones') || c.includes('pantalon')) return { tipo: 'pantalón', color: 'azul', clima: 'Todos' };
    if (c.includes('zapato')) return { tipo: 'zapato', color: 'negro', clima: 'Todos' };
    return { tipo: 'sin definir', color: 'sin definir', clima: 'Todos' };
}

// Crea una tarjeta visual para una prenda y la añade al grid
function crearTarjetaPrenda(prenda) {
    const card = document.createElement('div');
    card.classList.add('garment-card', 'animate-fade-in');
    card.setAttribute('data-clase', prenda.clase);
    card.setAttribute('data-id', prenda.id);
    card.setAttribute('data-categoria', prenda.categoria);
    card.setAttribute('data-clima', prenda.Clima || climaPorClase(prenda.clase));
    card.setAttribute('data-numusos', prenda.NumUsos || 0);
    card.setAttribute('data-color', prenda.color);

    // Distintivo o badge de la categoría (emojis)
    const badge = document.createElement('div');
    badge.classList.add('garment-category-badge');
    badge.textContent = categoriaEmoji(prenda.categoria);

    const img = document.createElement('img');
    img.classList.add('garment-image');
    img.src = prenda.image;

    const info = document.createElement('div');
    info.classList.add('garment-info');

    const name = document.createElement('div');
    name.classList.add('garment-name');
    name.textContent = prenda.clase;

    const detail = document.createElement('div');
    detail.classList.add('garment-detail');
    detail.textContent = prenda.categoria;

    info.appendChild(name);
    info.appendChild(detail);
    card.appendChild(badge);
    card.appendChild(img);
    card.appendChild(info);

    if (catalogGrid) catalogGrid.appendChild(card);
    return card;
}

// Cargar prendas del usuario desde el servidor
window.cargarPrendasUsuario = async function (nombre) {
    console.log(`Cargando prendas de ${nombre}...`);
    try {
        const res = await fetch(`/api/prendas/${encodeURIComponent(nombre)}`);
        const prendas = await res.json();

        // Limpiar la lista y el grid
        window.listaPrendas.length = 0;
        if (catalogGrid) catalogGrid.innerHTML = '';

        if (prendas.length === 0 && catalogGrid) {
            catalogGrid.innerHTML = `
                <div class="view-placeholder animate-fade-in">
                    <div class="icon">🗄️</div>
                    <p>Tu armario está vacío. Usa la cámara para añadir prendas.</p>
                </div>
            `;
        } else {
            prendas.forEach(p => {
                window.listaPrendas.push(p);
                crearTarjetaPrenda(p);
            });
        }
        console.log(`${prendas.length} prendas cargadas para ${nombre}`);
    } catch (err) {
        console.error('Error cargando prendas:', err);
    }
}

// Eliminar prenda
window.eliminarPrenda = function (prendaId, cardElement) {
    const idx = window.listaPrendas.findIndex(p => p.id === prendaId);
    if (idx !== -1) window.listaPrendas.splice(idx, 1);

    const usuario = window.currentUser || 'Usuario';
    fetch(`/api/prendas/${encodeURIComponent(usuario)}/${prendaId}`, {
        method: 'DELETE'
    }).then(() => {
        console.log(`Prenda ${prendaId} eliminada`);
        if (cardElement) cardElement.remove();

        // Recargar outfits por si se eliminó alguno por eliminar la prenda
        if (window.cargarOutfitsUsuario) {
            window.cargarOutfitsUsuario(usuario);
        }

        if (catalogGrid && catalogGrid.querySelectorAll('.garment-card').length === 0) {
            catalogGrid.innerHTML = `
                <div class="view-placeholder animate-fade-in">
                    <div class="icon">🗄️</div>
                    <p>Tu armario está vacío. Usa la cámara para añadir prendas.</p>
                </div>
            `;
        }
    }).catch(err => console.error('Error eliminando prenda:', err));
}

// Mostrar detalles de la prenda
window.mostrarDetallesPrenda = function (card) {
    const clase = card.getAttribute('data-clase') || 'Sin definir';
    const prendaId = parseInt(card.getAttribute('data-id'));

    // Buscar la prenda en listaPrendas para obtener todos sus atributos
    const prendaData = window.listaPrendas.find(p => p.id === prendaId);

    const clima = prendaData?.Clima || climaPorClase(clase);
    const color = prendaData?.color;
    let combina = 'sin definir';
    if (color == 'negro' || color == 'blanco') {
        combina = '🎨 Todo';
    } else if (color == 'azul') {
        combina = '🔵 azul, 🔘 gris, ⚪ blanco, 🟤 marron, 🟠 naranja, 🟢 verde, ⚫ negro';
    } else if (color == 'rojo') {
        combina = '🔴 rojo, 🔘 gris, ⚪ blanco, 🔵 azul, ⚫ negro';
    }
    const guardado = prendaData?.guardado || 'Sin definir';

    return `
        <ul class="details-list">
            <li><strong>Tipo de prenda:</strong> ${clase}</li>
            <li><strong>Color:</strong> ${color}</li>
            <li><strong>Combina con:</strong> ${combina}</li>
            <li><strong>Clima:</strong> ${clima}</li>
            <li><strong>Guardado en:</strong> ${guardado}</li>
        </ul>
        <button id="deletePrendaBtn" class="btn-delete">🗑️ Eliminar Prenda</button>
    `;
}

// Configurar con el socket cuando esté disponible
document.addEventListener('DOMContentLoaded', () => {
    const socket = window.mirrorSocket;
    if (!socket) return;

    // Recibimos nueva prenda desde la cámara del móvil
    socket.on('nuevaPrenda', async (data) => {
        console.log('Nueva prenda recibida en el espejo');
        if (catalogGrid) {
            // Quitamos el placeholder de "armario vacío" si existe
            const placeholder = catalogGrid.querySelector('.view-placeholder');
            if (placeholder) placeholder.remove();
        }

        // Determinamos si el usuario esta activo (ignoramos a 'Usuario' si nos llega de cámara sin saber quién es)
        let usuario = data.usuario;
        if (!usuario || usuario === 'Usuario') {
            usuario = window.currentUser || 'usuario_1';
        }

        // Persistimos la prenda en el servidor
        try {
            const res = await fetch(`/api/prendas/${encodeURIComponent(usuario)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clase: data.clase || 'Sin definir',
                    categoria: data.categoria || 'superior',
                    color: data.color,
                    image: data.image,
                    guardado: data.guardado
                })
            });
            const prendaGuardada = await res.json();

            // Añadimos a la lista la prenda con el ID asignado por el servidor
            window.listaPrendas.push(prendaGuardada);
            crearTarjetaPrenda(prendaGuardada);
            console.log(`Prenda persistida: id=${prendaGuardada.id}, clase=${prendaGuardada.clase}`);
        } catch (err) {
            console.error('Error guardando prenda:', err);
            const prenda = {
                id: Date.now(),
                clase: data.clase || 'Sin definir',
                categoria: data.categoria || 'superior',
                image: data.image
            };
            window.listaPrendas.push(prenda);
            crearTarjetaPrenda(prenda);
        }
    });

    // Filtro por voz — recibe órdenes del móvil
    // Ocultaremos las prendas que no coincidan
    socket.on('aplicarFiltro', (filtro) => {
        const prompt = document.getElementById('voice-prompt-overlay');
        const filterStatusEl = document.getElementById('filterStatus');
        const filterOverlay = document.getElementById('filterOverlay');
        if (prompt) prompt.classList.add('hidden');

        console.log('Aplicando filtro:', filtro);
        if (filterStatusEl) filterStatusEl.textContent = '✅ Filtro aplicado';
        // Cerramos el pop-up tras un momento
        if (filterOverlay) setTimeout(() => filterOverlay.classList.add('hidden'), 800);

        if (!catalogGrid) return;

        // Recorremos todas las tarjetas y ocultamos/mostramos según el filtro puesto
        const cards = catalogGrid.querySelectorAll('.garment-card');

        // Función para quitar tildes y mayúsculas
        const normalize = (str) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() : "";

        cards.forEach(card => {
            const clase = card.getAttribute('data-clase');
            const cardId = card.getAttribute('data-id');
            const detalles = getDetalles(clase, cardId);
            let visible = true;

            if (filtro.tipo && normalize(detalles.tipo) !== normalize(filtro.tipo)) visible = false;
            if (filtro.color && normalize(detalles.color) !== normalize(filtro.color)) visible = false;
            if (filtro.clima) {
                if (filtro.clima === 'Todos') {
                    if (detalles.clima !== 'Todos') visible = false;
                } else if (detalles.clima !== filtro.clima && detalles.clima !== 'Todos') {
                    visible = false;
                }
            }

            if (visible) card.classList.remove('filtered-out');
            else card.classList.add('filtered-out');
        });

        // Para aplicar el filtro de historial reordenamos las tarjetas por ID
        if (filtro.historial) {
            const cardsArray = Array.from(cards);
            cardsArray.sort((a, b) => {
                const idA = parseInt(a.getAttribute('data-id'));
                const idB = parseInt(b.getAttribute('data-id'));
                // ID más alto primero (más nuevo) si es reciente
                return filtro.historial === 'reciente' ? idB - idA : idA - idB;
            });
            // Reinsertamos en el DOM las prendas en el nuevo orden
            cardsArray.forEach(card => catalogGrid.appendChild(card));
        }
    });

    // Limpiar filtros
    socket.on('limpiarFiltro', () => {
        const prompt = document.getElementById('voice-prompt-overlay');
        const filterOverlay = document.getElementById('filterOverlay');
        if (prompt) prompt.classList.add('hidden');
        if (filterOverlay) filterOverlay.classList.add('hidden');

        console.log('Limpiando filtros');
        if (!catalogGrid) return;
        const cards = Array.from(catalogGrid.querySelectorAll('.garment-card'));
        cards.forEach(card => card.classList.remove('filtered-out'));

        // Restauramos el orden original (por ID ascendente)
        cards.sort((a, b) => parseInt(a.getAttribute('data-id')) - parseInt(b.getAttribute('data-id')));
        cards.forEach(card => catalogGrid.appendChild(card));

        // Desactivamos indicadores de filtros especiales
        window.climaFilterActive = false;
        window.recommendActive = false;
        const climaBtn = document.getElementById('climaFilterBtn');
        const recBtn = document.getElementById('recommendBtn');
        if (climaBtn) climaBtn.classList.remove('active-filter');
        if (recBtn) recBtn.classList.remove('active-filter');
    });

    // Mostrar el pop-up de filtro o el aviso de voz según el modo
    socket.on('mostrarFiltro', () => {
        if (window.currentView === 'outfit') {
            // En el probador, mostramos el aviso de escuchando
            const prompt = document.getElementById('voice-prompt-overlay');
            if (prompt) prompt.classList.remove('hidden');
        } else {
            // En el armario, mostramos el pop-up completo de filtros
            const filterOverlay = document.getElementById('filterOverlay');
            if (filterOverlay) {
                document.getElementById('filterTipo').textContent = '—';
                document.getElementById('filterColor').textContent = '—';
                document.getElementById('filterClima').textContent = '—';
                const fHist = document.getElementById('filterHistorial');
                if (fHist) fHist.textContent = '—';
                document.getElementById('filterStatus').textContent = '🎤 Escuchando...';
                filterOverlay.classList.remove('hidden');
            }
        }
    });

    // Actualizar los campos del filtro en tiempo real
    socket.on('actualizarFiltroUI', (data) => {
        const fTipo = document.getElementById('filterTipo');
        if (fTipo) fTipo.textContent = data.tipo || '—';
        const fColor = document.getElementById('filterColor');
        if (fColor) fColor.textContent = data.color || '—';
        const fClima = document.getElementById('filterClima');
        if (fClima) fClima.textContent = data.clima || '—';
        const fHist = document.getElementById('filterHistorial');
        if (fHist) fHist.textContent = data.historial || '—';
        const fStatus = document.getElementById('filterStatus');
        if (fStatus && data.status) fStatus.textContent = data.status;
    });
});

// Lógica de clima y recomendación
// Temperatura actual y estado de filtros especiales
window.currentTemp = null;
window.climaFilterActive = false;
window.recommendActive = false;

// guarda currentTemp, muestra categoría y habilita el botón
window.updateWeather = function () {
    const weatherContent = document.getElementById('weatherContent');
    const climaFilterBtn = document.getElementById('climaFilterBtn');
    if (!weatherContent) return;

    if (!navigator.geolocation) {
        weatherContent.innerHTML = "<p>Geolocalización no soportada</p>";
        return;
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        try {
            // Fetch a Open-Meteo (API pública)
            const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
            const data = await response.json();

            const temp = data.current_weather.temperature;
            const windspeed = data.current_weather.windspeed;

            // Guardamos la temperatura para el filtro de clima
            window.currentTemp = temp;

            // Determinamos la categoría de clima
            const climaCategoria = temp < 20 ? 'Medio/Frío' : 'Calor';
            const climaEmoji = temp < 20 ? '🧥' : '☀️';

            // Inyectar en el HTML (mirror_2: muestra categoría y no solo sugerencia textual)
            weatherContent.innerHTML = `
                <div class="weather-info">
                    <strong>Actual:</strong> ${temp}°C | Viento: ${windspeed} km/h
                </div>
                <div class="recommendation-box">
                    ${climaEmoji} Categoría: <strong>${climaCategoria}</strong>
                </div>
            `;
            // Habilitamos el botón de filtro de clima
            if (climaFilterBtn) climaFilterBtn.disabled = false;
        } catch (error) {
            console.error("Error obteniendo el clima:", error);
            weatherContent.innerHTML = "<p>Error al cargar clima</p>";
        }
    }, () => {
        weatherContent.innerHTML = "<p>Permiso de ubicación denegado</p>";
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const climaFilterBtn = document.getElementById('climaFilterBtn');
    const recommendBtn = document.getElementById('recommendBtn');

    // Botón «Filtrar por clima»
    if (climaFilterBtn) {
        climaFilterBtn.addEventListener('click', () => {
            if (window.currentTemp === null || !catalogGrid) return;

            // Toggle: si ya está activo, desactivar
            if (window.climaFilterActive) {
                const cards = Array.from(catalogGrid.querySelectorAll('.garment-card'));
                cards.forEach(card => card.classList.remove('filtered-out'));
                cards.sort((a, b) => parseInt(a.getAttribute('data-id')) - parseInt(b.getAttribute('data-id')));
                cards.forEach(card => catalogGrid.appendChild(card));
                window.climaFilterActive = false;
                climaFilterBtn.classList.remove('active-filter');
                console.log('Filtro de clima desactivado');
                return;
            }
            const climaObjetivo = window.currentTemp < 20 ? 'Medio/Frío' : 'Calor';
            console.log(`Filtrando por clima: ${climaObjetivo} (temp=${window.currentTemp}°C)`);

            const cards = catalogGrid.querySelectorAll('.garment-card');
            cards.forEach(card => {
                const climaPrenda = card.getAttribute('data-clima') || 'Todos';
                if (climaPrenda === climaObjetivo || climaPrenda === 'Todos') card.classList.remove('filtered-out');
                else card.classList.add('filtered-out');
            });
            window.climaFilterActive = true;
            window.recommendActive = false;
            climaFilterBtn.classList.add('active-filter');
            if (recommendBtn) recommendBtn.classList.remove('active-filter');
        });
    }

    // Botón «Recomendar por gustos»
    if (recommendBtn) {
        recommendBtn.addEventListener('click', () => {
            if (!catalogGrid) return;
            // Toggle: si ya está activo, desactivar
            if (window.recommendActive) {
                const cards = Array.from(catalogGrid.querySelectorAll('.garment-card'));
                cards.sort((a, b) => parseInt(a.getAttribute('data-id')) - parseInt(b.getAttribute('data-id')));
                cards.forEach(card => catalogGrid.appendChild(card));
                window.recommendActive = false;
                recommendBtn.classList.remove('active-filter');
                console.log('Recomendación por gustos desactivada');
                return;
            }
            console.log('Ordenando por NumUsos descendente');
            const cards = Array.from(catalogGrid.querySelectorAll('.garment-card'));
            cards.sort((a, b) => {
                const usosA = parseInt(a.getAttribute('data-numusos')) || 0;
                const usosB = parseInt(b.getAttribute('data-numusos')) || 0;
                return usosB - usosA; // Descendente: más usadas primero
            });
            cards.forEach(card => catalogGrid.appendChild(card));
            window.recommendActive = true;
            window.climaFilterActive = false;
            recommendBtn.classList.add('active-filter');
            if (climaFilterBtn) climaFilterBtn.classList.remove('active-filter');
        });
    }

    // Llamar a la función cuando se cargue el espejo o cambie a modo armario
    window.updateWeather();
});
