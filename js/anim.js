// ==========================================================================
// SECCIÓN: ANIMACIÓN DE TROFEO (SCROLL)
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
    // Determine path based on current location
    const isSubdir = window.location.pathname.includes('/eliminatoria/');
    // Se asume que este script se llama desde eliminatoria/index.html, por lo que usamos '../' 
    // o determinamos basado en la URL.
    const basePath = isSubdir ? '../img/worldcup_trophy/' : 'img/worldcup_trophy/';
    
    // Create container
    const container = document.createElement('div');
    container.id = 'trophy-scroll-animation';
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '10'; // Traerlo al frente (pero sin bloquear clicks)
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
    container.style.opacity = '1'; // Opacidad completa
    container.style.transition = 'opacity 0.3s ease';
    
    const img = document.createElement('img');
    img.style.maxHeight = '90vh';
    img.style.maxWidth = '90vw';
    img.style.objectFit = 'contain';
    img.style.filter = 'drop-shadow(0 0 20px rgba(110, 230, 106, 0.12))'; // Gold glow
    
    img.src = `${basePath}0001.webp`; // initial image
    container.appendChild(img);
    document.body.appendChild(container);
    
    // Preload images to ensure smooth animation
    const images = [];
    for (let i = 1; i <= 30; i++) {
        const num = i.toString().padStart(4, '0');
        const imgObj = new Image();
        imgObj.src = `${basePath}${num}.webp`;
        images.push(imgObj);
    }
    
    // Scroll listener robusto
    const handleScroll = (e) => {
        let scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;
        let scrollHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - window.innerHeight;
        
        // Si el scroll ocurre en un contenedor interno (ej. .screen o .app-main-content)
        if (e && e.target && e.target !== document && e.target.scrollTop !== undefined) {
            scrollTop = e.target.scrollTop;
            scrollHeight = e.target.scrollHeight - e.target.clientHeight;
        }
        
        // Definir cuánto scroll toma la animación entera (ej. 1.5 pantallas)
        const maxScroll = window.innerHeight * 1.5;
        let scrollFraction = Math.min(1, scrollTop / maxScroll);
        
        // Map fraction to frame index (0 to 29)
        const frameIndex = Math.min(
            29,
            Math.max(0, Math.floor(scrollFraction * 30))
        );
        
        const num = (frameIndex + 1).toString().padStart(4, '0');
        img.src = `${basePath}${num}.webp`;
        
        // Desaparecer la copa en el último frame
        if (scrollFraction >= 1) {
            container.style.opacity = '0';
        } else {
            container.style.opacity = '1';
        }

        // Mostrar los pronósticos cuando la copa se va
        const pronosticos = document.getElementById('pronosticos-container');
        if (pronosticos) {
            if (scrollFraction >= 0.9) {
                pronosticos.style.opacity = '1';
                pronosticos.style.transform = 'translateY(0)';
            } else {
                pronosticos.style.opacity = '0';
                pronosticos.style.transform = 'translateY(20px)';
            }
        }
        
        // Desaparecer el texto de fondo a partir del frame 7 (índice 6)
        const title = document.getElementById('fase-title');
        if (title) {
            if (frameIndex >= 6) {
                title.style.opacity = '0';
            } else {
                title.style.opacity = '0.08';
            }
        }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    // Capturar scroll en cualquier contenedor interno
    document.addEventListener('scroll', handleScroll, true);
});
