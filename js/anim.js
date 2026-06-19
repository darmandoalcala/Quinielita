window.trophyAnimationLoaded = new Promise((resolve) => {
    window.resolveTrophyAnimation = resolve;
    setTimeout(() => {
        if (window.resolveTrophyAnimation) {
            window.resolveTrophyAnimation();
        }
    }, 2500);
});

document.addEventListener("DOMContentLoaded", () => {
    const isSubdir = window.location.pathname.includes('/eliminatoria/');
    const basePath = isSubdir ? '../img/worldcup_trophy/' : 'img/worldcup_trophy/';
    
    const container = document.createElement('div');
    container.id = 'trophy-scroll-animation';
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '10';
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
    container.style.opacity = '1';
    container.style.transition = 'opacity 0.3s ease';
    
    const img = document.createElement('img');
    img.style.maxHeight = '90vh';
    img.style.maxWidth = '90vw';
    img.style.objectFit = 'contain';
    img.style.filter = 'drop-shadow(0 0 20px rgba(110, 230, 106, 0.12))';
    
    img.style.willChange = 'src';
    
    img.src = `${basePath}0001.webp`;
    container.appendChild(img);
    
    // scroll arrow
    const scrollIndicator = document.createElement('div');
    scrollIndicator.className = 'scroll-indicator';
    scrollIndicator.innerHTML = `
        <svg class="scroll-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5v14M19 12l-7 7-7-7"/>
        </svg>
        <span class="scroll-arrow-text" style="font-size: 1.3rem;">Desliza</span>
    `;
    container.appendChild(scrollIndicator);
    
    document.body.appendChild(container);
    
    const images = [];
    let loadedImagesCount = 0;
    
    for (let i = 1; i <= 30; i++) {
        const num = i.toString().padStart(4, '0');
        const imgObj = new Image();
        
        imgObj.onload = imgObj.onerror = () => {
            loadedImagesCount++;
            if (loadedImagesCount === 30 && window.resolveTrophyAnimation) {
                window.resolveTrophyAnimation();
            }
        };
        
        imgObj.src = `${basePath}${num}.webp`;
        images.push(imgObj);
    }
    
    const pronosticos = document.getElementById('pronosticos-container');
    const title = document.getElementById('fase-title');
    
    let animationTriggered = false;
    
    // Función para dibujar un frame específico basado en el progreso (0 a 1)
    const renderFrame = (scrollFraction) => {
        const dashboard = document.getElementById('dashboard-screen');
        if (dashboard && dashboard.classList.contains('hidden')) {
            container.style.opacity = '0';
            if (title) title.style.opacity = '0';
            return;
        }

        const frameIndex = Math.min(29, Math.max(0, Math.floor(scrollFraction * 30)));
        
        if (images[frameIndex]) {
            img.src = images[frameIndex].src;
        }
        
        if (scrollFraction >= 0.8) {
            // Entre 0.8 y 1.0, solo se encoge un poco
            const progress = (scrollFraction - 0.8) * 5; // 0 a 1
            const scale = 1 - (0.2 * progress); // De 1.0 baja a 0.8
            img.style.transform = `scale(${scale})`;
            container.style.opacity = '1';
        } else {
            img.style.transform = `scale(1)`;
            container.style.opacity = '1';
        }

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
        if (title) {
            if (frameIndex >= 6) {
                title.style.opacity = '0';
            } else {
                title.style.opacity = '0.3';
            }
        }
    };
    
    // Secuencia Cinemática de Auto-Play
    const playCinematicAnimation = () => {
        animationTriggered = true;
        
        // Ocultar el indicador de scroll
        if (scrollIndicator) {
            scrollIndicator.style.opacity = '0';
        }
        
        // Bloquear scroll de la página mientras dura la animación
        document.body.style.overflow = 'hidden'; 
        
        const duration = 1200; // 1.2 segundos para toda la animación
        const startTime = performance.now();
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            let fraction = Math.min(1, elapsed / duration);
            
            // Easing function: easeOutCubic para que se desacelere al final
            const easeOutCubic = 1 - Math.pow(1 - fraction, 3);
            
            renderFrame(easeOutCubic);
            
            if (fraction < 1) {
                requestAnimationFrame(animate);
            } else {
                document.body.style.overflow = 'auto'; // Restaurar scroll
                
                img.style.transform = 'scale(0.8)'; 
                img.style.maxHeight = '80vh';
                
                //Se convierte en absolute para que el objeto se quede fijo en una posición de la pantalla
                container.style.position = 'absolute';
                container.style.top = `${window.scrollY}px`;
                container.style.height = '100vh';
            }
        };
        
        requestAnimationFrame(animate);
    };

    const handleUserInteraction = (e) => {
        const dashboard = document.getElementById('dashboard-screen');
        if (dashboard && dashboard.classList.contains('hidden')) return;
        
        if (e.type === 'wheel' && e.deltaY <= 0) return; // Solo si hace scroll hacia abajo
        if (e.type === 'keydown' && !['ArrowDown', 'PageDown', 'Space'].includes(e.code)) return;
        
        if (!animationTriggered) {
            playCinematicAnimation();
            window.removeEventListener('wheel', handleUserInteraction);
            window.removeEventListener('touchmove', handleUserInteraction);
            window.removeEventListener('keydown', handleUserInteraction);
        }
    };

    window.addEventListener('wheel', handleUserInteraction);
    window.addEventListener('touchmove', handleUserInteraction);
    window.addEventListener('keydown', handleUserInteraction);

    // Pintar el frame 0 automáticamente cuando app.js esconda la pantalla de carga
    window.addEventListener('scroll', () => {
        if (!animationTriggered) renderFrame(0);
    });
});
