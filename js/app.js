

// Estado Global de la Aplicación
const AppState = {
    session: null,
    userProfile: null,
    matches: [],
    predictions: [],
    teams: [],
    leaderboard: [],
    activeTab: 'tab-quiniela',
    currentDate: new Date(), // Sincronizado en tiempo real con el servidor/cliente
    matchesPerPage: 24, // Partidos a mostrar por lote
    matchesDisplayed: 24 // Cantidad actual de partidos visibles
};

// Carga Inicial del DOM
document.addEventListener("DOMContentLoaded", () => {
    initApp();
    setupEventListeners();
});

// Inicializar Aplicación (Doble Perfil: Jugador o Espectador Público)
async function initApp() {
    showScreen('loading-screen');

    // 1. Validar Conexión (Inicializada de forma transparente)
    if (!window.supabaseClient) {
        console.error("Credenciales no configuradas. Por favor, abre el archivo js/config.js y coloca tu URL y Anon Key.");

        const loadingText = document.querySelector("#loading-screen p");
        if (loadingText) {
            loadingText.innerHTML = `
                <span style="color:var(--danger); font-weight:700; display:block; margin-bottom: 8px;">Servicio temporalmente no disponible</span>
                No se pudo establecer la conexión con el servidor. Por favor, inténtalo más tarde o contacta al administrador.
            `;
        }
        document.querySelector("#loading-screen .spinner").style.borderTopColor = "var(--danger)";
        return;
    }

    try {
        // 2. Comprobar sesión de autenticación activa
        const { data: { session }, error } = await window.supabaseClient.auth.getSession();

        if (error) throw error;

        const profileWidget = document.getElementById("header-profile-widget");
        const myPredsFilter = document.getElementById("filter-my-predictions");
        const supportAnon = document.getElementById("support-tab-anonymous");
        const supportAuth = document.getElementById("support-tab-authenticated");
        const quinielaSubtitle = document.getElementById("quiniela-subtitle");

        if (session) {
            AppState.session = session;

            // Cargar Perfil de Usuario
            const profileSuccess = await fetchUserProfile(session.user.id);
            if (profileSuccess) {
                // Inyectar Perfil en Cabecera
                if (profileWidget) {
                    profileWidget.innerHTML = `
                        <div class="profile-info">
                            <span class="user-name" id="user-display-name">${AppState.userProfile.nombre_completo}</span>
                            <div class="points-indicator">
                                <i data-lucide="award" class="gold-icon"></i>
                                <span id="user-points" class="points-val">0 pts</span>
                            </div>
                        </div>
                        <div class="profile-actions">
                            <button id="logout-btn" class="btn-icon danger" title="Cerrar Sesión" onclick="handleLogout()">
                                <i data-lucide="log-out"></i>
                            </button>
                        </div>
                    `;
                }

                // Mostrar controles privados
                if (myPredsFilter) myPredsFilter.style.display = "block";
                if (supportAnon) supportAnon.classList.add("hidden");
                if (supportAuth) supportAuth.classList.remove("hidden");
                if (quinielaSubtitle) quinielaSubtitle.textContent = "Guarda tus marcadores antes de que empiece cada partido. El candado se cierra automáticamente al iniciar el juego.";
            } else {
                // Perfil dañado, desconectar
                await window.supabaseClient.auth.signOut();
                AppState.session = null;
                setupAnonymousHeader();
            }
        } else {
            AppState.session = null;
            setupAnonymousHeader();
        }

        // Cargar y pintar Quiniela (Accesible para todos)
        await loadQuinielaData();

        // Si existe la promesa de la animación del trofeo, esperamos a que carguen sus imágenes
        if (window.trophyAnimationLoaded) {
            const loadingText = document.querySelector("#loading-screen p");
            if (loadingText) loadingText.innerHTML = `Preparando gráficos 3D...`;
            await window.trophyAnimationLoaded;
        }

        showScreen('dashboard-screen');

        // Forzar un evento de scroll para que anim.js dibuje el primer frame del trofeo instantáneamente
        window.dispatchEvent(new Event('scroll'));

    } catch (err) {
        console.error("Error en inicialización de app:", err);
        showToast("Error de Comunicación", "No se pudo sincronizar con el servidor de apuestas.", "error");
        setupAnonymousHeader();
        await loadQuinielaData();
        showScreen('dashboard-screen');
    }
}

// Configura el encabezado en modo espectador (sin login)
function setupAnonymousHeader() {
    const profileWidget = document.getElementById("header-profile-widget");
    const myPredsFilter = document.getElementById("filter-my-predictions");
    const supportAnon = document.getElementById("support-tab-anonymous");
    const supportAuth = document.getElementById("support-tab-authenticated");
    const quinielaSubtitle = document.getElementById("quiniela-subtitle");

    // Inyectar botón de login
    if (profileWidget) {
        profileWidget.innerHTML = `
            <a href="login/index.html" class="btn btn-primary btn-sm" style="text-decoration:none; gap:6px;">
                <i data-lucide="log-in" style="width:14px; height:14px;"></i>
                <span>Iniciar Sesión</span>
            </a>
        `;
    }

    // Ocultar controles privados
    if (myPredsFilter) myPredsFilter.style.display = "none";
    if (supportAnon) supportAnon.classList.remove("hidden");
    if (supportAuth) supportAuth.classList.add("hidden");
    if (quinielaSubtitle) quinielaSubtitle.textContent = "Explora el calendario de partidos y marcadores. Inicia sesión para guardar tus pronósticos y jugar.";

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Configurar Manejadores de Eventos del DOM (Defensivo frente a elementos ausentes)
function setupEventListeners() {
    // Navegación de Pestañas (Tab Navigation)
    const tabs = document.querySelectorAll(".nav-tab");
    tabs.forEach(tab => {
        tab.addEventListener("click", (e) => {
            const targetTab = e.currentTarget.getAttribute("data-tab");
            switchTab(targetTab);
        });
    });

    // Filtros de Quiniela (resetean la paginación al cambiar)
    const groupFilter = document.getElementById("group-filter");
    if (groupFilter) {
        groupFilter.addEventListener("change", () => {
            AppState.matchesDisplayed = AppState.matchesPerPage;
            renderMatches();
        });
    }

    const statusFilter = document.getElementById("status-filter");
    if (statusFilter) {
        statusFilter.addEventListener("change", () => {
            AppState.matchesDisplayed = AppState.matchesPerPage;
            renderMatches();
        });
    }


}

// ==========================================================================
// SECCIÓN: RUTEO Y PANTALLAS (SPA ROUTING)
// ==========================================================================

function showScreen(screenId) {
    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.add("hidden");
    });
    const target = document.getElementById(screenId);
    if (target) {
        target.classList.remove("hidden");
    }

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function switchTab(tabId) {
    document.querySelectorAll(".nav-tab").forEach(tab => tab.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(content => content.classList.remove("active"));

    const clickedTab = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
    if (clickedTab) clickedTab.classList.add("active");

    const targetSection = document.getElementById(tabId);
    if (targetSection) targetSection.classList.add("active");

    AppState.activeTab = tabId;

    if (tabId === 'tab-quiniela') {
        loadQuinielaData();
    } else if (tabId === 'tab-leaderboard') {
        loadLeaderboardData();
    }

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function switchAuthTab(tab) {
    window.location.href = "login/index.html";
}

// ==========================================================================
// SECCIÓN: AUTENTICACIÓN (LOGIN / REGISTRO)
// ==========================================================================

async function fetchUserProfile(userId) {
    try {
        const { data, error } = await window.supabaseClient
            .from('usuarios')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) throw error;

        AppState.userProfile = data;
        return true;
    } catch (err) {
        console.error("Error al obtener perfil personalizado:", err);
        return false;
    }
}

async function handleLogout() {
    showScreen('loading-screen');
    try {
        await window.supabaseClient.auth.signOut();
        AppState.session = null;
        AppState.userProfile = null;
        AppState.matches = [];
        AppState.predictions = [];
        AppState.teams = [];
        showToast("Sesión Finalizada", "Has salido del portal de forma segura.", "info");

        // Recargar el portal como espectador
        setupAnonymousHeader();
        await loadQuinielaData();
        showScreen('dashboard-screen');
        switchTab('tab-quiniela');
    } catch (err) {
        console.error("Error al cerrar sesión:", err);
        showScreen('dashboard-screen');
    }
}

// ==========================================================================
// SECCIÓN: INICIALIZAR EL PORTAL (DASHBOARD)
// ==========================================================================

async function initDashboard() {
    switchTab('tab-quiniela');
}

// ==========================================================================
// PESTAÑA 1: QUINIELA (TABLERO DE PARTIDOS Y PRONÓSTICOS)
// ==========================================================================

async function loadQuinielaData() {
    const grid = document.getElementById("matches-grid");
    if (!grid) return;

    // Resetear paginación al recargar datos completos
    AppState.matchesDisplayed = AppState.matchesPerPage;

    try {
        // Cargar equipos
        if (AppState.teams.length === 0) {
            const { data: teamsData, error: teamsError } = await window.supabaseClient
                .from('equipos')
                .select('*');
            if (teamsError) throw teamsError;
            AppState.teams = teamsData || [];
        }

        // Cargar partidos
        let matchesData = [];
        const { data: dataTry1, error: errTry1 } = await window.supabaseClient
            .from('partidos')
            .select(`
                *,
                equipo_local:equipos!equipo_local_id(*),
                equipo_visitante:equipos!equipo_visitante_id(*)
            `)
            .order('fecha_hora', { ascending: true });

        if (errTry1) {
            console.warn("Mapeo relacional automático no disponible, cruzando datos localmente...");
            const { data: matchesFlat, error: flatError } = await window.supabaseClient
                .from('partidos')
                .select('*')
                .order('fecha_hora', { ascending: true });

            if (flatError) throw flatError;

            matchesData = (matchesFlat || []).map(match => {
                return {
                    ...match,
                    equipo_local: AppState.teams.find(t => t.codigo_iso === match.equipo_local_id || t.id === match.equipo_local_id),
                    equipo_visitante: AppState.teams.find(t => t.codigo_iso === match.equipo_visitante_id || t.id === match.equipo_visitante_id)
                };
            });
        } else {
            matchesData = dataTry1 || [];
        }

        AppState.matches = matchesData;

        // Cargar predicciones del usuario actual (solo si está logueado)
        if (AppState.session) {
            const { data: predData, error: predError } = await window.supabaseClient
                .from('predicciones')
                .select('*')
                .eq('usuario_id', AppState.session.user.id);

            if (predError) throw predError;
            AppState.predictions = predData || [];

            calculateUserPoints();
        } else {
            AppState.predictions = [];
        }

        // Renderizar partidos en el grid
        renderMatches();

    } catch (err) {
        console.error("Error al cargar quiniela:", err);
        grid.innerHTML = `
            <div class="loading-placeholder">
                <i data-lucide="alert-circle" style="color: var(--danger); width: 42px; height: 42px;"></i>
                <p style="margin-top: 10px;">No se pudieron cargar los partidos de la base de datos.</p>
                <small>Por favor, comprueba tu conexión e inténtalo de nuevo.</small>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

// Calcular puntos acumulados de nuestro usuario para pintarlo en el widget de perfil
function calculateUserPoints() {
    let points = 0;

    AppState.predictions.forEach(pred => {
        const match = AppState.matches.find(m => m.id === pred.partido_id);
        if (match && match.goles_local !== null && match.goles_visitante !== null) {
            points += (pred.puntos_ganados || 0);
        }
    });

    const ptsIndicator = document.getElementById("user-points");
    if (ptsIndicator) ptsIndicator.textContent = `${points} pts`;
}



function renderMatches() {
    const grid = document.getElementById("matches-grid");
    if (!grid) return;

    const groupFilter = document.getElementById("group-filter").value;
    const statusFilter = document.getElementById("status-filter").value;

    grid.innerHTML = "";

    const filteredMatches = AppState.matches.filter(match => {
        const localGrp = match.equipo_local?.grupo || "";
        const visitGrp = match.equipo_visitante?.grupo || "";
        const matchGroup = localGrp || visitGrp;

        if (groupFilter !== "ALL" && matchGroup !== groupFilter) {
            return false;
        }

        const isFinished = match.goles_local !== null && match.goles_visitante !== null || match.estado === "Finalizado";
        const hasPrediction = AppState.predictions.some(p => p.partido_id === match.id);

        if (statusFilter === "Finalizado" && !isFinished) return false;
        if (statusFilter === "Pendiente" && isFinished) return false;
        if (statusFilter === "Apuestas" && !hasPrediction) return false;

        return true;
    });

    // Ordenar los partidos explícitamente por fecha y hora de menor a mayor
    filteredMatches.sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora));

    if (filteredMatches.length === 0) {
        grid.innerHTML = `
            <div class="loading-placeholder">
                <i data-lucide="info" style="width: 38px; height: 38px; color: var(--text-muted);"></i>
                <p style="margin-top: 10px;">No se encontraron partidos para los filtros aplicados.</p>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    // Carga dinámica: solo mostrar los primeros N partidos
    const visibleMatches = filteredMatches.slice(0, AppState.matchesDisplayed);
    const remaining = filteredMatches.length - AppState.matchesDisplayed;

    visibleMatches.forEach((match, index) => {
        const localTeam = match.equipo_local || { nombre: "Local", siglas: "LOC", codigo_iso: "unknown", grupo: "A" };
        const visitTeam = match.equipo_visitante || { nombre: "Visitante", siglas: "VIS", codigo_iso: "unknown", grupo: "A" };

        const prediction = AppState.predictions.find(p => p.partido_id === match.id);
        const predL = prediction ? prediction.goles_local : "";
        const predV = prediction ? prediction.goles_visitante : "";

        // Bloquear apuestas si el partido ya inició (fecha_hora <= NOW())
        const matchDate = new Date(match.fecha_hora);
        const isLocked = matchDate <= AppState.currentDate;

        // Calcular puntos del partido si está finalizado
        const isFinished = match.goles_local !== null && match.goles_visitante !== null;
        let pointsTag = "";
        let realScoreBadge = "";

        if (isFinished) {
            const earned = prediction ? (prediction.puntos_ganados || 0) : 0;

            if (prediction) {
                if (earned === 3) {
                    pointsTag = `<div class="points-earned-tag gold">+3 Puntos (Exacto)</div>`;
                } else if (earned === 1) {
                    pointsTag = `<div class="points-earned-tag" style="background: #475569; color: white;">+1 Punto (Resultado)</div>`;
                } else {
                    pointsTag = `<div class="points-earned-tag" style="background: var(--danger); color: white;">0 Puntos</div>`;
                }
            } else {
                pointsTag = `<div class="points-earned-tag" style="background: rgba(255, 255, 255, 0.05); color: var(--text-muted); border: 1px solid var(--border-card);">Sin Apuesta</div>`;
            }

            realScoreBadge = `
                <div class="real-score-badge">
                    <span class="subtitle" style="display:block; font-size:0.6rem;">Resultado Real</span>
                    <span class="real-score-val">${match.goles_local} - ${match.goles_visitante}</span>
                </div>
            `;
        }

        const flagLocal = localTeam.codigo_iso !== "unknown" ? `https://flagcdn.com/${localTeam.codigo_iso}.svg` : "https://flagcdn.com/un.svg";
        const flagVisit = visitTeam.codigo_iso !== "unknown" ? `https://flagcdn.com/${visitTeam.codigo_iso}.svg` : "https://flagcdn.com/un.svg";

        const formattedDate = matchDate.toLocaleString('es-MX', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        // Habilitación de inputs según Auth y Lock
        const inputsDisabled = isLocked || !AppState.session;

        // Armar el pie de la tarjeta
        let footerContent = "";
        if (isLocked) {
            footerContent = `
                <div class="prediction-status-locked">
                    <i data-lucide="lock" style="width: 14px; height: 14px;"></i>
                    <span>Apuestas Cerradas</span>
                </div>
            `;
        } else if (!AppState.session) {
            // Espectador anónimo: botón para ir a loguearse
            footerContent = `
                <a href="login/index.html" class="save-prediction-btn" style="text-decoration:none;">
                    <i data-lucide="log-in" style="width: 14px; height: 14px;"></i>
                    <span>Ingresar para jugar</span>
                </a>
            `;
        } else {
            // Jugador logueado
            footerContent = `
                <button class="save-prediction-btn" onclick="savePrediction(${match.id})" id="save-btn-${match.id}">
                    <i data-lucide="save" style="width: 14px; height: 14px;"></i>
                    <span>${prediction ? 'Actualizar' : 'Guardar Apuesta'}</span>
                </button>
            `;
        }

        const card = document.createElement("div");
        card.className = `glass-card match-card ${isLocked && !isFinished ? '' : 'pulsing-border'}`;
        // Animación escalonada para las tarjetas nuevas
        card.style.animationDelay = `${index * 0.04}s`;
        card.innerHTML = `
            ${pointsTag}
            <div class="match-header-info">
                <span class="match-group">Grupo ${localTeam.grupo || 'A'}</span>
                <span class="match-time">
                    <i data-lucide="clock" style="width: 12px; height: 12px;"></i>
                    ${formattedDate}
                </span>
            </div>
            
            <div class="match-versus-area">
                <!-- Local -->
                <div class="team-column">
                    <div class="flag-wrapper">
                        <img class="flag-img" src="${flagLocal}" alt="${localTeam.nombre}" onerror="this.src='https://flagcdn.com/un.svg'">
                    </div>
                    <span class="team-name" title="${localTeam.nombre}">${localTeam.nombre}</span>
                    <span class="team-siglas">${localTeam.siglas}</span>
                </div>
                
                <!-- Inputs de Marcadores -->
                <div class="score-inputs-container">
                    <input type="number" min="0" max="99" 
                        class="score-input" 
                        id="score-l-${match.id}" 
                        value="${predL}"
                        ${inputsDisabled ? 'disabled' : ''} 
                        placeholder="-">
                    <span class="score-divider">:</span>
                    <input type="number" min="0" max="99" 
                        class="score-input" 
                        id="score-v-${match.id}" 
                        value="${predV}"
                        ${inputsDisabled ? 'disabled' : ''} 
                        placeholder="-">
                </div>
                
                <!-- Visitante -->
                <div class="team-column">
                    <div class="flag-wrapper">
                        <img class="flag-img" src="${flagVisit}" alt="${visitTeam.nombre}" onerror="this.src='https://flagcdn.com/un.svg'">
                    </div>
                    <span class="team-name" title="${visitTeam.nombre}">${visitTeam.nombre}</span>
                    <span class="team-siglas">${visitTeam.siglas}</span>
                </div>
            </div>
            
            <div class="match-footer">
                ${realScoreBadge}
                ${footerContent}
                
                ${prediction && !isLocked && AppState.session ? `
                    <span class="prediction-status-saved">
                        <i data-lucide="check-circle" style="width: 12px; height: 12px;"></i>
                        Pronóstico Guardado
                    </span>
                ` : ''}
            </div>
        `;

        grid.appendChild(card);
    });

    // Botón "Cargar más" si hay partidos restantes
    if (remaining > 0) {
        const loadMoreContainer = document.createElement("div");
        loadMoreContainer.className = "load-more-container";
        loadMoreContainer.innerHTML = `
            <div class="load-more-divider"></div>
            <button class="load-more-btn" id="load-more-matches-btn" onclick="loadMoreMatches()">
                <i data-lucide="chevrons-down" style="width: 18px; height: 18px;"></i>
                <span>Cargar más partidos</span>
                <span class="load-more-count">${remaining} restante${remaining !== 1 ? 's' : ''}</span>
            </button>
            <p class="load-more-hint">Mostrando ${visibleMatches.length} de ${filteredMatches.length} partidos</p>
        `;
        grid.appendChild(loadMoreContainer);
    }

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Acción: Cargar más partidos (carga dinámica)
function loadMoreMatches() {
    AppState.matchesDisplayed += AppState.matchesPerPage;
    renderMatches();

    // Scroll suave hacia los nuevos partidos cargados
    const grid = document.getElementById("matches-grid");
    if (grid) {
        const cards = grid.querySelectorAll('.match-card');
        if (cards.length > 0) {
            // Scroll al primer nuevo card visible
            const scrollTarget = cards[cards.length - Math.min(AppState.matchesPerPage, cards.length)];
            if (scrollTarget) {
                setTimeout(() => {
                    scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            }
        }
    }
}

// Acción: Guardar/Actualizar Predicción
async function savePrediction(matchId) {
    if (!AppState.session) return;

    const glInput = document.getElementById(`score-l-${matchId}`);
    const gvInput = document.getElementById(`score-v-${matchId}`);
    const saveBtn = document.getElementById(`save-btn-${matchId}`);
    if (!glInput || !gvInput || !saveBtn) return;

    const golesLocal = parseInt(glInput.value);
    const golesVisitante = parseInt(gvInput.value);

    if (isNaN(golesLocal) || isNaN(golesVisitante)) {
        showToast("Marcador Incompleto", "Ingresa ambos marcadores para guardar tu pronóstico.", "error");
        return;
    }

    saveBtn.disabled = true;
    saveBtn.innerHTML = `<span class="spinner inline-spinner" style="margin:0;"></span>`;

    try {
        const match = AppState.matches.find(m => m.id === matchId);

        if (new Date(match.fecha_hora) <= AppState.currentDate) {
            throw new Error("El candado se ha cerrado. El partido ya ha comenzado.");
        }

        const existingPred = AppState.predictions.find(p => p.partido_id === matchId);

        if (existingPred) {
            const { data, error } = await window.supabaseClient
                .from('predicciones')
                .update({
                    goles_local: golesLocal,
                    goles_visitante: golesVisitante
                })
                .eq('id', existingPred.id)
                .select();

            if (error) throw error;

            existingPred.goles_local = golesLocal;
            existingPred.goles_visitante = golesVisitante;
            showToast("Pronóstico Actualizado", "Tu marcador ha sido actualizado con éxito.", "success");
        } else {
            const { data, error } = await window.supabaseClient
                .from('predicciones')
                .insert([{
                    usuario_id: AppState.session.user.id,
                    partido_id: matchId,
                    goles_local: golesLocal,
                    goles_visitante: golesVisitante
                }])
                .select();

            if (error) throw error;

            if (data && data.length > 0) {
                AppState.predictions.push(data[0]);
            }
            showToast("Apuesta Registrada", "Tu marcador se ha guardado con éxito.", "success");
        }
        renderMatches();
    } catch (err) {
        console.error("Error al guardar predicción:", err);

        const isClosedError = err.message?.includes("row-level security policy") ||
            err.message?.includes("new row violates row-level security") ||
            err.message?.includes("candado") ||
            err.message?.includes("comenzado");

        if (isClosedError) {
            showToast("¡Tiempo Límite Expirado!", "Este partido ya ha comenzado en el servidor y las apuestas están cerradas.", "error");
        } else {
            showToast("Error al Guardar", "No se pudo guardar el pronóstico. Inténtalo de nuevo.", "error");
        }

        loadQuinielaData();
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

// ==========================================================================
// PESTAÑA 2: LEADERBOARD SEGURO (CLASIFICACIÓN GENERAL Y DETALLES)
// ==========================================================================

async function loadLeaderboardData() {
    const tbody = document.getElementById("leaderboard-body");
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="5" class="text-center py-4">
                <div class="spinner inline-spinner"></div> Cargando tabla de posiciones...
            </td>
        </tr>
    `;

    try {
        // 1. Asegurar que haya partidos cargados (para calcular lastMatch)
        if (AppState.matches.length === 0) {
            await loadQuinielaData();
        }

        const finishedMatches = AppState.matches.filter(m => m.goles_local !== null && m.goles_visitante !== null);
        // Ordenar del más reciente al más viejo, usando fecha_hora y luego el ID de la base de datos
        finishedMatches.sort((a, b) => {
            const timeDiff = new Date(b.fecha_hora) - new Date(a.fecha_hora);
            if (timeDiff !== 0) return timeDiff;
            return b.id - a.id;
        });
        const lastMatch = finishedMatches.length > 0 ? finishedMatches[0] : null;
        if (lastMatch) {
            console.log("El sistema detectó como ÚLTIMO PARTIDO a:", lastMatch.equipo_local_id, "vs", lastMatch.equipo_visitante_id, "ID:", lastMatch.id);
        }

        // 2. Descargar el leaderboard consolidado desde nuestra vista optimizada
        const { data: leaderboardData, error: viewError } = await window.supabaseClient
            .from('leaderboard_view')
            .select('*');
            
        if (viewError) throw viewError;

        // 3. Descargar SÓLO las predicciones del último partido (muy ligero)
        let lastMatchPreds = [];
        if (lastMatch) {
            const { data: predsData, error: predError } = await window.supabaseClient
                .from('predicciones')
                .select('usuario_id, puntos_ganados')
                .eq('partido_id', lastMatch.id);
                
            if (!predError && predsData) {
                lastMatchPreds = predsData;
            }
        }

        const leaderboard = leaderboardData.map(user => {
            let lastMatchPoints = 0;
            if (lastMatch) {
                const lastPred = lastMatchPreds.find(p => p.usuario_id === user.id);
                if (lastPred) {
                    lastMatchPoints = lastPred.puntos_ganados || 0;
                }
            }

            return {
                id: user.id,
                nombre_completo: user.nombre_completo,
                correo: user.correo,
                rfc: user.rfc,
                points: parseInt(user.points) || 0,
                lastMatchPoints: lastMatchPoints,
                predictionsCount: parseInt(user.predictions_count) || 0
            };
        });

        leaderboard.sort((a, b) => b.points - a.points || a.nombre_completo.localeCompare(b.nombre_completo));

        AppState.leaderboard = leaderboard;

        tbody.innerHTML = "";

        leaderboard.forEach((player, index) => {
            const rank = index + 1;
            let rankClass = "";

            if (rank === 1) rankClass = "rank-gold";
            else if (rank === 2) rankClass = "rank-silver";
            else if (rank === 3) rankClass = "rank-bronze";

            const isMe = AppState.session ? player.id === AppState.session.user.id : false;

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>
                    <span class="rank-badge ${rankClass}">${rank}</span>
                </td>
                <td>
                    <span class="participant-name">${player.nombre_completo}</span>
                    ${isMe ? '<span class="participant-you-tag">Tú</span>' : ''}
                    ${player.lastMatchPoints === 3 ? `<span style="color: var(--primary); font-size: 0.8rem; margin-left: 4px; font-weight: normal;">+3</span>` : ''}
                    ${player.lastMatchPoints === 1 ? `<span style="color: var(--tertiary); font-size: 0.8rem; margin-left: 4px; font-weight: normal;">+1</span>` : ''}
                    ${player.lastMatchPoints === 0 ? `<span style="color: var(--danger); font-size: 0.8rem; margin-left: 4px; font-weight: normal;">+0</span>` : ''}
                </td>
                <td class="participant-subtext">
                    ${player.correo}
                </td>
                <td style="text-align: center; vertical-align: middle;">
                    <span class="pts-col-val" style="display: inline-block;">${player.points}</span>
                </td>
                <td style="text-align: center;">
                    <button class="btn-view-predictions" onclick="viewPlayerPredictions('${player.id}')">
                        <i data-lucide="eye" style="width: 14px; height: 14px;"></i>
                        <span>Ver Pronósticos</span>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

    } catch (err) {
        console.error("Error al construir leaderboard:", err);
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-4" style="color: var(--danger);">
                    <i data-lucide="alert-triangle" style="vertical-align: middle;"></i> 
                    No se pudieron cargar los datos de clasificación. Inténtalo más tarde.
                </td>
            </tr>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

// Acción: Ver apuestas de otro usuario
async function viewPlayerPredictions(playerUserId) {
    const modal = document.getElementById("user-details-modal");
    const title = document.getElementById("details-user-name");
    const info = document.getElementById("details-user-info");
    const container = document.getElementById("details-predictions-grid");
    if (!modal || !container) return;

    container.innerHTML = `<div class="loading-placeholder"><div class="spinner"></div> Cargando pronósticos del competidor...</div>`;
    modal.classList.remove("hidden");

    try {
        const player = AppState.leaderboard.find(u => u.id === playerUserId);
        if (!player) throw new Error("Usuario no encontrado en cache.");

        title.textContent = `Apuestas de ${player.nombre_completo}`;
        info.textContent = `ID Oculto: ${player.rfc.substring(0, 4)}****** | ${player.points} Puntos Totales`;

        const isMe = AppState.session ? playerUserId === AppState.session.user.id : false;

        const { data: rawPreds, error } = await window.supabaseClient
            .from('predicciones')
            .select('*')
            .eq('usuario_id', playerUserId);

        if (error) throw error;

        container.innerHTML = "";

        AppState.matches.forEach(match => {
            const localTeam = match.equipo_local || { nombre: "Local", siglas: "LOC", codigo_iso: "unknown" };
            const visitTeam = match.equipo_visitante || { nombre: "Visitante", siglas: "VIS", codigo_iso: "unknown" };

            const matchDate = new Date(match.fecha_hora);
            const isStarted = matchDate <= AppState.currentDate;
            const isFinished = match.goles_local !== null && match.goles_visitante !== null;

            const pred = rawPreds.find(p => p.partido_id === match.id);

            let cardBody = "";
            let pointsEarnedLabel = "";

            if (!isStarted && !isMe) {
                cardBody = `
                    <div class="mini-card-teams">
                        <div class="mini-team-info">
                            <img class="mini-flag" src="https://flagcdn.com/${localTeam.codigo_iso}.svg" alt="">
                            <span>${localTeam.siglas}</span>
                        </div>
                        <div class="mini-secret-lock">
                            <i data-lucide="lock" style="width: 10px; height: 10px;"></i>
                            <span>Oculto</span>
                        </div>
                        <div class="mini-team-info">
                            <span>${visitTeam.siglas}</span>
                            <img class="mini-flag" src="https://flagcdn.com/${visitTeam.codigo_iso}.svg" alt="">
                        </div>
                    </div>
                `;
            } else {
                const gl = pred ? pred.goles_local : "-";
                const gv = pred ? pred.goles_visitante : "-";
                const hasApuesta = pred !== undefined;

                if (isFinished && hasApuesta) {
                    const pts = pred.puntos_ganados || 0;
                    pointsEarnedLabel = pts === 3 ? `<span class="badge badge-gold" style="font-size:0.6rem;">+3 pts (Exacto)</span>` :
                        pts === 1 ? `<span class="badge badge-info" style="font-size:0.6rem;">+1 pt (Resultado)</span>` :
                            `<span class="badge badge-danger" style="font-size:0.6rem;">0 pts</span>`;
                } else if (isFinished && !hasApuesta) {
                    pointsEarnedLabel = `<span class="badge badge-danger" style="font-size:0.6rem;">0 pts</span>`;
                }

                cardBody = `
                    <div class="mini-card-teams">
                        <div class="mini-team-info">
                            <img class="mini-flag" src="https://flagcdn.com/${localTeam.codigo_iso}.svg" alt="">
                            <span>${localTeam.siglas}</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:6px;">
                            <span class="mini-score-val">${gl}</span>
                            <span style="font-weight:700; color:var(--text-muted);">:</span>
                            <span class="mini-score-val">${gv}</span>
                        </div>
                        <div class="mini-team-info">
                            <span>${visitTeam.siglas}</span>
                            <img class="mini-flag" src="https://flagcdn.com/${visitTeam.codigo_iso}.svg" alt="">
                        </div>
                    </div>
                `;
            }

            const card = document.createElement("div");
            card.className = "mini-prediction-card";
            card.innerHTML = `
                <div class="mini-card-header">
                    <span>Grupo ${localTeam.grupo || 'A'}</span>
                    ${pointsEarnedLabel}
                </div>
                ${cardBody}
            `;
            container.appendChild(card);
        });

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

    } catch (err) {
        console.error("Error al visualizar apuestas ajenas:", err);
        container.innerHTML = `<p class="empty-state" style="color:var(--danger)">No se pudieron cargar los datos solicitados en este momento.</p>`;
    }
}

function closeUserDetailsModal() {
    const modal = document.getElementById("user-details-modal");
    if (modal) modal.classList.add("hidden");
}

// ==========================================================================
// SECCIÓN: NOTIFICACIONES DEL SISTEMA (TOASTS)
// ==========================================================================

function showToast(title, message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    let iconName = "info";
    if (type === "success") iconName = "check-circle";
    else if (type === "error") iconName = "alert-circle";

    toast.innerHTML = `
        <i data-lucide="${iconName}"></i>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <i data-lucide="x" style="width:12px; height:12px;"></i>
        </button>
    `;

    container.appendChild(toast);

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    setTimeout(() => {
        toast.classList.add("show");
    }, 10);

    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => {
            toast.remove();
        }, 400);
    }, 5000);
}
