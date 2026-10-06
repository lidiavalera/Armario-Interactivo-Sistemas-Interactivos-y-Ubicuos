// Outfits guardados, donde se cargan y muestran
window.outfitsGuardados = [];

const outfitsGrid = document.getElementById('outfitsGrid');

// Cargar outfits del usuario
window.cargarOutfitsUsuario = async function (nombre) {
    console.log(`Cargando outfits de ${nombre}...`);
    try {
        const res = await fetch(`/api/outfits/${encodeURIComponent(nombre)}`);
        const outfits = await res.json();

        // Guardar en la caché local para poder "probarlos" luego
        window.outfitsGuardados.length = 0;
        outfits.forEach(o => window.outfitsGuardados.push(o));

        if (!outfitsGrid) return;

        outfitsGrid.innerHTML = '';

        if (outfits.length === 0) {
            outfitsGrid.innerHTML = `
                <div class="view-placeholder animate-fade-in">
                    <div class="icon">💾</div>
                    <p>Aún no has guardado ningún outfit.<br>Haz el signo OK 👌 con la mano en el probador.</p>
                </div>
            `;
        } else {
            outfits.forEach(o => {
                crearTarjetaOutfit(o);
            });
        }
        console.log(`${outfits.length} outfits cargados`);
    } catch (err) {
        console.error('Error cargando outfits:', err);
    }
}

// Crear tarjeta de outfit
function crearTarjetaOutfit(outfit) {
    const card = document.createElement('div');
    card.classList.add('garment-card', 'animate-fade-in');

    // Atributos de datos necesarios para que el puntero virtual funcione
    card.setAttribute('data-id', outfit.id);
    card.setAttribute('data-is-outfit', 'true');
    const date = new Date(outfit.fecha).toLocaleDateString();
    card.setAttribute('data-fecha', date);

    // Crear un mini-preview del outfit usando la clase CSS
    const preview = document.createElement('div');
    preview.classList.add('outfit-preview');

    Object.keys(outfit.prendas).forEach(cat => {
        const p = outfit.prendas[cat];
        if (p && p.image) {
            const img = document.createElement('img');
            img.src = p.image;
            preview.appendChild(img);
        }
    });

    const info = document.createElement('div');
    info.classList.add('garment-info');

    const name = document.createElement('div');
    name.classList.add('garment-name');
    name.textContent = `Outfit ${date}`;

    const detail = document.createElement('div');
    detail.classList.add('garment-detail');
    detail.textContent = `${Object.keys(outfit.prendas).length} prendas`;

    info.appendChild(name);
    info.appendChild(detail);
    card.appendChild(preview);
    card.appendChild(info);

    outfitsGrid.appendChild(card);
}

// Cuando se guarda un outfit, se actualiza la lista
window.onOutfitGuardado = (nuevo) => {
    if (document.getElementById('outfits-view') && document.getElementById('outfits-view').classList.contains('active')) {
        window.cargarOutfitsUsuario(window.currentUser);
    }
    // Recargar prendas para obtener NumUsos actualizado del servidor
    if (window.currentUser && window.cargarPrendasUsuario) {
        window.cargarPrendasUsuario(window.currentUser);
    }
};

// Eliminar outfit
window.eliminarOutfit = function (outfitId, cardElement) {
    const usuario = window.currentUser || 'Usuario';
    fetch(`/api/outfits/${encodeURIComponent(usuario)}/${outfitId}`, {
        method: 'DELETE'
    }).then(() => {
        console.log(`Outfit ${outfitId} eliminado`);
        if (cardElement) cardElement.remove();
        if (outfitsGrid && outfitsGrid.querySelectorAll('.garment-card').length === 0) {
            outfitsGrid.innerHTML = `
                <div class="view-placeholder animate-fade-in">
                    <div class="icon">💾</div>
                    <p>Aún no has guardado ningún outfit.</p>
                </div>
            `;
        }
    }).catch(err => console.error('Error eliminando outfit:', err));
};

// Mostrar detalles del outfit (que se puede probar o eliminar el outfit)
window.mostrarDetallesOutfit = function (card) {
    const fecha = card.getAttribute('data-fecha');
    return `
        <p style="font-size:0.85rem; margin-bottom:10px;"><b>Conjunto guardado:</b> ${fecha}</p>
        <button id="tryOutfitBtn" class="btn btn-success" style="width:100%; margin-bottom:8px; justify-content:center;">Probar Conjunto</button>
        <button id="deletePrendaBtn" class="btn-delete">Eliminar Conjunto</button>
    `;
};
