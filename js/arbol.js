// Pre-carga de imágenes de animación del trofeo
const images = [];
let loadedImagesCount = 0;
const imagesLoadedPromise = new Promise((resolve) => {
    const basePath = '../img/worldcup_trophy/';
    for (let i = 1; i <= 30; i++) {
        const num = i.toString().padStart(4, '0');
        const imgObj = new Image();
        imgObj.onload = imgObj.onerror = () => {
            loadedImagesCount++;
            if (loadedImagesCount === 30) {
                resolve();
            }
        };
        imgObj.src = `${basePath}${num}.webp`;
        images.push(imgObj);
    }
    // Timeout de seguridad en caso de red lenta
    setTimeout(resolve, 2500);
});

document.addEventListener("DOMContentLoaded", () => {
    initArbol();
});

async function initArbol() {
    if (!window.supabaseClient) {
        console.error("Supabase client no configurado.");
        return;
    }

    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        const profileWidget = document.getElementById("header-profile-widget");

        if (session && profileWidget) {
            const { data: profile } = await window.supabaseClient.from('usuarios').select('*').eq('id', session.user.id).single();
            if (profile) {
                // Obtener predicciones para calcular puntos
                const { data: predData } = await window.supabaseClient
                    .from('predicciones')
                    .select('puntos_ganados')
                    .eq('usuario_id', session.user.id);

                let points = 0;
                if (predData) {
                    predData.forEach(pred => {
                        points += (pred.puntos_ganados || 0);
                    });
                }

                profileWidget.innerHTML = `
                    <div class="profile-info">
                        <span class="user-name" id="user-display-name">${profile.nombre_completo}</span>
                        <div class="points-indicator">
                            <i data-lucide="award" class="gold-icon"></i>
                            <span id="user-points" class="points-val" style="filter: blur(5px); user-select: none; cursor: help;" title="Puntos ocultos por emoción">${points} pts</span>
                        </div>
                    </div>
                    <div class="profile-actions">
                        <button id="logout-btn" class="btn-icon danger" title="Cerrar Sesión" onclick="window.supabaseClient.auth.signOut().then(() => window.location.reload())">
                            <i data-lucide="log-out"></i>
                        </button>
                    </div>
                `;
            }
        } else if (profileWidget) {
            profileWidget.innerHTML = `
                <a href="../login/index.html" class="btn btn-primary btn-sm" style="text-decoration:none; gap:6px;">
                    <i data-lucide="log-in" style="width:14px; height:14px;"></i>
                    <span>Iniciar Sesión</span>
                </a>
            `;
        }
        if (window.lucide) lucide.createIcons();

        // Cargar equipos
        const { data: teamsData, error: teamsError } = await window.supabaseClient.from('equipos').select('*');
        if (teamsError) throw teamsError;

        // Cargar TODOS los partidos de la eliminatoria
        const { data: matchesData, error: matchesError } = await window.supabaseClient
            .from('partidos')
            .select(`
                *,
                equipo_local:equipos!equipo_local_id(*),
                equipo_visitante:equipos!equipo_visitante_id(*)
            `)
            .order('fecha_hora', { ascending: true });

        if (matchesError) throw matchesError;

        renderArbol(matchesData);

        // Esperar a que se pre-carguen las imágenes antes de iniciar la transición
        await imagesLoadedPromise;

        const startTransition = () => {
            playTreeTrophyAnimation();
        };

        const trophySpinner = document.getElementById("main-loading-trophy");
        if (trophySpinner) {
            // Esperar a que termine el giro actual de la animación para quedar derecho
            trophySpinner.addEventListener('animationiteration', startTransition, { once: true });
        } else {
            startTransition();
        }

    } catch (err) {
        console.error("Error al cargar datos del árbol:", err);
        showScreen('dashboard-screen');
    }
}

function showScreen(screenId) {
    document.querySelectorAll(".screen").forEach(screen => screen.classList.add("hidden"));
    const target = document.getElementById(screenId);
    if (target) target.classList.remove("hidden");
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function playTreeTrophyAnimation() {
    const dashboard = document.getElementById('dashboard-screen');
    const loadingScreen = document.getElementById('loading-screen');
    const spinnerImg = document.getElementById('main-loading-trophy');

    if (!dashboard || !loadingScreen || !spinnerImg) {
        showScreen('dashboard-screen');
        return;
    }

    // Bloquear scroll de la página durante el vuelo del trofeo
    document.body.style.overflow = 'hidden';

    // 1. Mostrar temporalmente el dashboard invisible para medir el trofeo final
    dashboard.style.visibility = 'hidden';
    dashboard.classList.remove('hidden');

    const finalTrophy = document.getElementById('final-tree-trophy');
    if (!finalTrophy) {
        // Fallback si no existe el trofeo
        dashboard.style.visibility = '';
        document.body.style.overflow = '';
        loadingScreen.classList.add('hidden');
        return;
    }

    // Ocultar temporalmente el trofeo estático del árbol
    finalTrophy.style.opacity = '0';

    // Obtener dimensiones y posición del trofeo final respecto al viewport
    const rect = finalTrophy.getBoundingClientRect();
    
    // Obtener dimensiones iniciales del spinner
    const spinnerRect = spinnerImg.getBoundingClientRect();

    // 2. Detener rotación y preparar el spinner para la animación de vuelo
    spinnerImg.classList.remove('main-trophy-spinner', 'trophy-spinner');
    spinnerImg.style.animation = 'none';
    spinnerImg.style.position = 'fixed';
    spinnerImg.style.margin = '0';
    spinnerImg.style.zIndex = '10000';
    spinnerImg.style.transform = 'none';
    spinnerImg.style.transition = 'none';
    
    // Fijar posición inicial exacta del spinner
    spinnerImg.style.left = `${spinnerRect.left}px`;
    spinnerImg.style.top = `${spinnerRect.top}px`;
    spinnerImg.style.width = `${spinnerRect.width}px`;
    spinnerImg.style.height = `${spinnerRect.height}px`;

    // 3. Animaciones síncronas de desvanecimiento
    loadingScreen.style.transition = 'background-color 0.8s ease';
    loadingScreen.style.backgroundColor = 'transparent';

    const loadingText = loadingScreen.querySelector('.spinner-container p');
    if (loadingText) {
        loadingText.style.transition = 'opacity 0.5s ease';
        loadingText.style.opacity = '0';
    }

    // Mostrar gradualmente el dashboard
    dashboard.style.opacity = '0';
    dashboard.style.transition = 'opacity 0.8s ease';
    dashboard.style.visibility = 'visible';
    void dashboard.offsetWidth; // Reflow
    dashboard.style.opacity = '1';

    // 4. Bucle cinematográfico (vuelo y cambio de frames)
    const duration = 1200; // 1.2 segundos para el trayecto y la rotación
    const startTime = performance.now();

    const animateTrophy = (currentTime) => {
        const elapsed = currentTime - startTime;
        const fraction = Math.min(1, elapsed / duration);

        // Easing out cubic para frenar suavemente al llegar
        const ease = 1 - Math.pow(1 - fraction, 3);

        // Interpolar posición y dimensiones
        const currentLeft = spinnerRect.left + (rect.left - spinnerRect.left) * ease;
        const currentTop = spinnerRect.top + (rect.top - spinnerRect.top) * ease;
        const currentWidth = spinnerRect.width + (rect.width - spinnerRect.width) * ease;
        const currentHeight = spinnerRect.height + (rect.height - spinnerRect.height) * ease;

        spinnerImg.style.left = `${currentLeft}px`;
        spinnerImg.style.top = `${currentTop}px`;
        spinnerImg.style.width = `${currentWidth}px`;
        spinnerImg.style.height = `${currentHeight}px`;

        // Interpolar frames de 0 a 29
        const frameIndex = Math.min(29, Math.max(0, Math.floor(ease * 30)));
        if (images[frameIndex]) {
            spinnerImg.src = images[frameIndex].src;
        }

        if (fraction < 1) {
            requestAnimationFrame(animateTrophy);
        } else {
            // Animación concluida
            finalTrophy.style.opacity = '1'; // Mostrar trofeo real en el árbol
            loadingScreen.classList.add('hidden'); // Ocultar definitivamente pantalla de carga
            document.body.style.overflow = ''; // Restaurar scroll
            
            // Limpiar estilos temporales del loadingScreen y dashboard
            loadingScreen.style.backgroundColor = '';
            if (loadingText) loadingText.style.opacity = '';
            dashboard.style.opacity = '';
            dashboard.style.transition = '';
            
            spinnerImg.remove(); // Eliminar spinner temporal
        }
    };

    requestAnimationFrame(animateTrophy);
}

function renderArbol(matches) {
    const getMatchesByPhase = (phase) => {
        return matches
            .filter(m => m.fase === phase)
            .sort((a, b) => (a.numero_partido || 0) - (b.numero_partido || 0));
    };

    const d16 = getMatchesByPhase('16avos');
    const d8 = getMatchesByPhase('Octavos');
    const d4 = getMatchesByPhase('Cuartos');
    const d2 = getMatchesByPhase('Semifinales');

    const finalMatches = getMatchesByPhase('Final');
    const thirdMatches = matches
        .filter(m => m.fase === 'Tercer Puesto' || m.fase === 'Tercer lugar' || m.fase === 'Tercer Lugar')
        .sort((a, b) => (a.numero_partido || 0) - (b.numero_partido || 0));

    // Función auxiliar para inyectar texto básico del partido
    const renderMatchToDiv = (match, divSelector, customTitle = null) => {
        const div = document.querySelector(divSelector);
        if (!div) return;

        let titleHtml = customTitle ? `<div class="match-cell-title">${customTitle}</div>` : '';

        if (!match) {
            div.innerHTML = `
                ${titleHtml}
                <div class="bracket-card">
                    <div class="bracket-card-header">
                        <span>Por definir</span>
                    </div>
                    <div class="bracket-card-body">
                        <div class="team-row"><span class="team-name" style="text-align: center; width: 100%;">Por definir</span></div>
                    </div>
                </div>
            `;
            return;
        }

        const localTeam = match.equipo_local || { nombre: "Por definir", siglas: "---", codigo_iso: null };
        const visitTeam = match.equipo_visitante || { nombre: "Por definir", siglas: "---", codigo_iso: null };
        const scoreL = match.goles_local !== null ? match.goles_local : "-";
        const scoreV = match.goles_visitante !== null ? match.goles_visitante : "-";

        let matchStatusStr = "Por definir";
        if (match.fecha_hora) {
            const d = new Date(match.fecha_hora);
            matchStatusStr = match.estatus === 'Finalizado' ? 'FT' :
                match.estatus === 'En Curso' ? '<span style="color:#eab308">En Curso</span>' :
                    `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        }

        const getFlagImg = (team) => {
            if (!team.codigo_iso) {
                // Gris genérico para cuando no hay equipo (fallback en línea)
                return `<div class="team-flag" style="background-color: #334155;"></div>`;
            }
            return `<img src="https://flagcdn.com/w20/${team.codigo_iso.toLowerCase()}.png" class="team-flag" onerror="this.style.display='none'">`;
        };

        div.innerHTML = `
            ${titleHtml}
            <div class="bracket-card">
                <div class="bracket-card-header">
                    <span>${matchStatusStr}</span>
                    <span>P${match.id}</span>
                </div>
                <div class="bracket-card-body">
                    <div class="team-row">
                        ${getFlagImg(localTeam)}
                        <span class="team-name">${localTeam.siglas}</span>
                        <span class="team-score">${scoreL}</span>
                    </div>
                    <div class="team-row">
                        ${getFlagImg(visitTeam)}
                        <span class="team-name">${visitTeam.siglas}</span>
                        <span class="team-score">${scoreV}</span>
                    </div>
                </div>
            </div>
        `;
    };

    // 16avos - Izquierda (div1 a div8)
    const d16Left = d16.slice(0, 8);
    d16Left.forEach((m, i) => renderMatchToDiv(m, `.div${1 + i}`));

    // 16avos - Derecha (div9 a div16)
    const d16Right = d16.slice(8, 16);
    d16Right.forEach((m, i) => renderMatchToDiv(m, `.div${9 + i}`));

    // Octavos - Izquierda (div17 a div20)
    const d8Left = d8.slice(0, 4);
    d8Left.forEach((m, i) => renderMatchToDiv(m, `.div${17 + i}`));

    // Octavos - Derecha (div21 a div24)
    const d8Right = d8.slice(4, 8);
    d8Right.forEach((m, i) => renderMatchToDiv(m, `.div${21 + i}`));

    // Cuartos - Izquierda (div25 a div26)
    const d4Left = d4.slice(0, 2);
    d4Left.forEach((m, i) => renderMatchToDiv(m, `.div${25 + i}`));

    // Cuartos - Derecha (div27 a div28)
    const d4Right = d4.slice(2, 4);
    d4Right.forEach((m, i) => renderMatchToDiv(m, `.div${27 + i}`));

    // Semifinales - Izquierda (div29)
    renderMatchToDiv(d2[0], '.div29');

    // Semifinales - Derecha (div30)
    renderMatchToDiv(d2[1], '.div30');

    // Final (div31)
    renderMatchToDiv(finalMatches[0], '.div31', '<img src="../img/worldcup_trophy/0030.webp" id="final-tree-trophy" alt="Trofeo" style="height: 100px; object-fit: contain; filter: drop-shadow(0 10px 10px rgba(0,0,0,0.6)); margin-bottom: 5px; position: relative; z-index: 10;">');

    // Tercer Puesto (div32)
    renderMatchToDiv(thirdMatches[0], '.div32', 'Tercer Puesto');
}
