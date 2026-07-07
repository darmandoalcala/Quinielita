// Estado Global de la AplicaciÃ³n
const AppState = {
    session: null,
    userProfile: null,
    matches: [],
    predictions: [],
    teams: [],
    leaderboard: [],
    activeTab: 'tab-cuartos',
    currentDate: new Date(),
    matchesPerPage: 24,
    matchesDisplayed: 24
};

// Carga Inicial del DOM
document.addEventListener("DOMContentLoaded", () => {
    initApp();
    setupEventListeners();
});

// Inicializar AplicaciÃ³n (SesiÃ³n Compartida)
async function initApp() {
    showScreen('loading-screen');

    if (!window.supabaseClient) {
        console.error("Credenciales no configuradas.");
        return;
    }

    try {
        const { data: { session }, error } = await window.supabaseClient.auth.getSession();

        if (error) throw error;

        const profileWidget = document.getElementById("header-profile-widget");
        const myPredsFilter = document.getElementById("filter-my-predictions");

        if (session) {
            AppState.session = session;
            const profileSuccess = await fetchUserProfile(session.user.id);
            if (profileSuccess) {
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
                            <button id="logout-btn" class="btn-icon danger" title="Cerrar SesiÃ³n" onclick="handleLogout()">
                                <i data-lucide="log-out"></i>
                            </button>
                        </div>
                    `;
                }
                if (myPredsFilter) myPredsFilter.style.display = "block";
            } else {
                await window.supabaseClient.auth.signOut();
                AppState.session = null;
                setupAnonymousHeader();
            }
        } else {
            AppState.session = null;
            setupAnonymousHeader();
        }

        await loadQuinielaData();

        if (window.trophyAnimationLoaded) {
            await window.trophyAnimationLoaded;
        }

        const finalizeLoading = () => {
            showScreen('dashboard-screen');
            window.dispatchEvent(new Event('scroll'));
        };
        const trophySpinner = document.getElementById("main-loading-trophy");
        if (trophySpinner) {
            trophySpinner.addEventListener('animationiteration', finalizeLoading, { once: true });
        } else {
            finalizeLoading();
        }

    } catch (err) {
        console.error("Error en inicialización de app:", err);
        setupAnonymousHeader();
        await loadQuinielaData();
        const finalizeLoadingErr = () => {
            showScreen('dashboard-screen');
        };
        const trophySpinner = document.getElementById("main-loading-trophy");
        if (trophySpinner) {
            trophySpinner.addEventListener('animationiteration', finalizeLoadingErr, { once: true });
        } else {
            finalizeLoadingErr();
        }
    }
}

// Configura el encabezado en modo espectador
function setupAnonymousHeader() {
    const profileWidget = document.getElementById("header-profile-widget");
    const myPredsFilter = document.getElementById("filter-my-predictions");

    if (profileWidget) {
        profileWidget.innerHTML = `
            <a href="login/index.html" class="btn btn-primary btn-sm" style="text-decoration:none; gap:6px;">
                <i data-lucide="log-in" style="width:14px; height:14px;"></i>
                <span>Iniciar SesiÃ³n</span>
            </a>
        `;
    }
    if (myPredsFilter) myPredsFilter.style.display = "none";
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function showScreen(screenId) {
    document.querySelectorAll(".screen").forEach(screen => screen.classList.add("hidden"));
    const target = document.getElementById(screenId);
    if (target) target.classList.remove("hidden");
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ==========================================================================
// PESTAÃ‘AS (SPA)
// ==========================================================================

function setupEventListeners() {
    // NavegaciÃ³n de PestaÃ±as
    const tabs = document.querySelectorAll(".nav-tab");
    tabs.forEach(tab => {
        tab.addEventListener("click", (e) => {
            const targetTab = e.currentTarget.getAttribute("data-tab");
            switchTab(targetTab);
        });
    });

    // Filtros de Fase de Grupos
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

function switchTab(tabId) {
    document.querySelectorAll(".nav-tab").forEach(tab => tab.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(content => {
        content.classList.remove("active");
        if (content.id === "tab-eliminatoria") {
            content.style.opacity = "0";
            content.style.transform = "translateY(20px)";
            // Esconder para que no interfiera en clics de otras pantallas
            setTimeout(() => { if (!content.classList.contains("active")) content.style.display = "none"; }, 500);
        }
    });

    const clickedTab = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
    if (clickedTab) clickedTab.classList.add("active");

    const targetSection = document.getElementById(tabId);
    if (targetSection) {
        targetSection.classList.add("active");
        if (tabId === "tab-eliminatoria") {
            targetSection.style.display = "block";
            // Forzar reflow para animaciÃ³n
            void targetSection.offsetWidth;
            targetSection.style.opacity = "1";
            targetSection.style.transform = "translateY(0)";
        }
    }

    AppState.activeTab = tabId;

    if (tabId === 'tab-grupos') {
        // La carga se hizo al inicio, pero por si acaso re-renderizamos.
        renderMatches();
    } else if (tabId === 'tab-16avos') {
        render16avos();
    } else if (tabId === 'tab-octavos') {
        renderOctavos();
    } else if (tabId === 'tab-cuartos') {
        renderCuartos();
    } else if (tabId === 'tab-semifinales') {
        renderSemifinales();
        renderFinal();
    } else if (tabId === 'tab-leaderboard') {
        loadLeaderboardData();
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ==========================================================================
// AUTENTICACIÃ“N
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
        window.location.reload();
    } catch (err) {
        console.error("Error al cerrar sesiÃ³n:", err);
        window.location.reload();
    }
}

// ==========================================================================
// CARGA GLOBAL DE DATOS
// ==========================================================================

async function loadQuinielaData() {
    try {
        // Cargar equipos
        if (AppState.teams.length === 0) {
            const { data: teamsData, error: teamsError } = await window.supabaseClient.from('equipos').select('*');
            if (teamsError) throw teamsError;
            AppState.teams = teamsData || [];
        }

        // Cargar TODOS los partidos
        const { data: matchesData, error: errTry1 } = await window.supabaseClient
            .from('partidos')
            .select(`
                *,
                equipo_local:equipos!equipo_local_id(*),
                equipo_visitante:equipos!equipo_visitante_id(*)
            `)
            .order('fecha_hora', { ascending: true });

        if (errTry1) throw errTry1;
        AppState.matches = matchesData || [];

        // Cargar predicciones del usuario actual
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

        // Inyectar en ambas vistas
        renderMatches();
        renderCuartos();

    } catch (err) {
        console.error("Error al cargar quiniela:", err);
    }
}

function calculateUserPoints() {
    let points = 0;
    AppState.predictions.forEach(pred => {
        points += (pred.puntos_ganados || 0);
    });

    const ptsIndicator = document.getElementById("user-points");
    if (ptsIndicator) {
        ptsIndicator.textContent = `pts`;
        ptsIndicator.style.filter = "blur(5px)";
        ptsIndicator.style.userSelect = "none";
        ptsIndicator.title = "Puntos ocultos por emoción";
        ptsIndicator.style.cursor = "help";
    }
}

// ==========================================================================
// RENDERIZADO: FASE DE GRUPOS
// ==========================================================================

function renderMatches() {
    const grid = document.getElementById("matches-grid");
    if (!grid) return;

    const groupFilter = document.getElementById("group-filter")?.value || "ALL";
    const statusFilter = document.getElementById("status-filter")?.value || "ALL";

    grid.innerHTML = "";

    // Filtrar solo los de fase de grupos o sin fase
    const groupMatches = AppState.matches.filter(m => m.fase === 'Fase de Grupos' || !m.fase);

    const filteredMatches = groupMatches.filter(match => {
        const localGrp = match.equipo_local?.grupo || "";
        const visitGrp = match.equipo_visitante?.grupo || "";
        const matchGroup = localGrp || visitGrp;

        if (groupFilter !== "ALL" && matchGroup !== groupFilter) return false;

        const isFinished = match.goles_local !== null && match.goles_visitante !== null || match.estado === "Finalizado";
        const hasPrediction = AppState.predictions.some(p => p.partido_id === match.id);

        if (statusFilter === "Finalizado" && !isFinished) return false;
        if (statusFilter === "Pendiente" && isFinished) return false;
        if (statusFilter === "Apuestas" && !hasPrediction) return false;

        return true;
    });

    if (filteredMatches.length === 0) {
        let title = "Sin resultados";
        let msg = "No se encontraron partidos para los filtros aplicados.";
        let icon = "info";

        if (statusFilter === "Pendiente") {
            title = "Â¡Fase de Grupos Concluida!";
            msg = "Ya no hay partidos pendientes. Cambia el filtro superior a <strong>'Finalizados'</strong> para ver los resultados de esta fase.";
            icon = "check-circle-2";
        }

        grid.innerHTML = `
            <div class="loading-placeholder" style="background: rgba(255,255,255,0.02); border-radius: 12px; padding: 3rem 1rem; border: 1px dashed rgba(255,255,255,0.1); margin-top: 1rem;">
                <i data-lucide="${icon}" style="width: 42px; height: 42px; color: var(--primary);"></i>
                <h3 style="margin: 12px 0 8px 0; color: var(--text-main); font-size: 1.2rem;">${title}</h3>
                <p style="margin: 0; font-size: 0.95rem; color: var(--text-muted); max-width: 400px; line-height: 1.4;">${msg}</p>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    const visibleMatches = filteredMatches.slice(0, AppState.matchesDisplayed);
    const remaining = filteredMatches.length - AppState.matchesDisplayed;

    visibleMatches.forEach((match, index) => {
        grid.appendChild(createStandardMatchCard(match, index));
    });

    if (remaining > 0) {
        const loadMoreContainer = document.createElement("div");
        loadMoreContainer.className = "load-more-container";
        loadMoreContainer.innerHTML = `
            <div class="load-more-divider"></div>
            <button class="load-more-btn" id="load-more-matches-btn" onclick="loadMoreMatches()">
                <i data-lucide="chevrons-down" style="width: 18px; height: 18px;"></i>
                <span>Cargar mÃ¡s partidos</span>
                <span class="load-more-count">${remaining} restante${remaining !== 1 ? 's' : ''}</span>
            </button>
            <p class="load-more-hint">Mostrando ${visibleMatches.length} de ${filteredMatches.length} partidos</p>
        `;
        grid.appendChild(loadMoreContainer);
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function createStandardMatchCard(match, index) {
    const localTeam = match.equipo_local || { nombre: "Local", siglas: "LOC", codigo_iso: "unknown", grupo: "A" };
    const visitTeam = match.equipo_visitante || { nombre: "Visitante", siglas: "VIS", codigo_iso: "unknown", grupo: "A" };

    const prediction = AppState.predictions.find(p => p.partido_id === match.id);
    const predL = prediction && prediction.goles_local !== null ? prediction.goles_local : "";
    const predV = prediction && prediction.goles_visitante !== null ? prediction.goles_visitante : "";

    const matchDate = new Date(match.fecha_hora);
    const isLocked = !isNaN(matchDate) && matchDate <= AppState.currentDate;
    const isFinished = match.goles_local !== null && match.goles_visitante !== null;
    let pointsTag = "";
    let realScoreBadge = "";

    if (isFinished) {
        const earned = prediction ? (prediction.puntos_ganados || 0) : 0;
        if (prediction) {
            if (earned === 3) pointsTag = `<div class="points-earned-tag gold" style="white-space: normal; line-height: 1.1; font-size: 0.65rem; padding: 4px; text-align: center;">+3 Puntos (Exacto)</div>`;
            else if (earned === 1) pointsTag = `<div class="points-earned-tag" style="white-space: normal; line-height: 1.1; font-size: 0.65rem; padding: 4px; text-align: center; background: #475569; color: white;">+1 Punto (Resultado)</div>`;
            else pointsTag = `<div class="points-earned-tag" style="white-space: normal; line-height: 1.1; font-size: 0.65rem; padding: 4px; text-align: center; background: var(--danger); color: white;">0 Puntos</div>`;
        } else {
            pointsTag = `<div class="points-earned-tag" style="white-space: normal; line-height: 1.1; font-size: 0.65rem; padding: 4px; text-align: center; background: rgba(255, 255, 255, 0.05); color: var(--text-muted); border: 1px solid var(--border-card);">Sin Apuesta</div>`;
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

    const formattedDate = isNaN(matchDate) ? "Por Definir" : matchDate.toLocaleString('es-MX', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const inputsDisabled = isLocked || !AppState.session;
    let footerContent = "";

    if (isLocked) {
        footerContent = `
            <div class="prediction-status-locked">
                <i data-lucide="lock" style="width: 14px; height: 14px;"></i>
                <span>Cerrado</span>
            </div>
        `;
    } else if (!AppState.session) {
        footerContent = `
            <a href="login/index.html" class="save-prediction-btn" style="text-decoration:none;">
                <i data-lucide="log-in" style="width: 14px; height: 14px;"></i>
                <span>Ingresar para jugar</span>
            </a>
        `;
    } else {
        footerContent = `
            <button class="save-prediction-btn" onclick="savePrediction(${match.id})" id="save-btn-${match.id}">
                <i data-lucide="save" style="width: 14px; height: 14px;"></i>
                <span>${prediction ? 'Actualizar' : 'Guardar Apuesta'}</span>
            </button>
        `;
    }

    let faseText = match.fase || 'Fase de Grupos';
    if (faseText === 'Fase de Grupos') faseText = `Grupo ${localTeam.grupo || 'A'}`;

    const card = document.createElement("div");
    card.className = `glass-card match-card ${isLocked && !isFinished ? '' : 'pulsing-border'}`;
    card.style.animationDelay = `${index * 0.04}s`;
    card.innerHTML = `
        ${pointsTag}
        <div class="match-header-info">
            <span class="match-group">${faseText}</span>
            <span class="match-time">
                <i data-lucide="clock" style="width: 12px; height: 12px;"></i>
                ${formattedDate}
            </span>
        </div>
        
        <div class="match-versus-area">
            <div class="team-column">
                <div class="flag-wrapper"><img class="flag-img" src="${flagLocal}" onerror="this.src='https://flagcdn.com/un.svg'"></div>
                <span class="team-name" title="${localTeam.nombre}">${localTeam.nombre}</span>
                <span class="team-siglas">${localTeam.siglas}</span>
            </div>
            
            <div class="score-inputs-container">
                <input type="number" min="0" max="99" class="score-input" id="score-l-${match.id}" value="${predL}" ${inputsDisabled ? 'disabled' : ''} placeholder="-">
                <span class="score-divider">:</span>
                <input type="number" min="0" max="99" class="score-input" id="score-v-${match.id}" value="${predV}" ${inputsDisabled ? 'disabled' : ''} placeholder="-">
            </div>
            
            <div class="team-column">
                <div class="flag-wrapper"><img class="flag-img" src="${flagVisit}" onerror="this.src='https://flagcdn.com/un.svg'"></div>
                <span class="team-name" title="${visitTeam.nombre}">${visitTeam.nombre}</span>
                <span class="team-siglas">${visitTeam.siglas}</span>
            </div>
        </div>
        
        <div class="match-footer">
            ${realScoreBadge}
            ${footerContent}
            ${prediction && !isLocked && AppState.session ? `
                <span class="prediction-status-saved">
                    <i data-lucide="check-circle" style="width: 12px; height: 12px;"></i> PronÃ³stico Guardado
                </span>
            ` : ''}
        </div>
    `;
    return card;
}

function loadMoreMatches() {
    AppState.matchesDisplayed += AppState.matchesPerPage;
    renderMatches();
}

// ==========================================================================
// RENDERIZADO DE BRACKETS ELIMINATORIA
// ==========================================================================
function buildWingMatches(container, wingMatches, startIndex) {
    for (let i = 0; i < wingMatches.length; i += 2) {
        const matchupDiv = document.createElement("div");
        matchupDiv.className = "bracket-matchup";

        const m1 = wingMatches[i];
        const m2 = wingMatches[i + 1];

        if (m1) matchupDiv.appendChild(createStandardMatchCard(m1, startIndex + i));
        if (m2) matchupDiv.appendChild(createStandardMatchCard(m2, startIndex + i + 1));

        container.appendChild(matchupDiv);
    }
}
// ========================  16AVOS  ========================
function render16avos() {
    const leftWing = document.getElementById("bracket-left-16avos");
    const rightWing = document.getElementById("bracket-right-16avos");

    if (!leftWing || !rightWing) return;

    leftWing.querySelectorAll('.bracket-matchup').forEach(e => e.remove());
    rightWing.querySelectorAll('.bracket-matchup').forEach(e => e.remove());

    const elimMatches = AppState.matches
        .filter(m => m.fase === '16avos')
        .sort((a, b) => {
            const numA = a.numero_partido || 0;
            const numB = b.numero_partido || 0;
            return numA - numB;
        });

    // Los primeros 8 partidos van al ala izquierda
    buildWingMatches(leftWing, elimMatches.slice(0, 8), 1);

    // Los siguientes 8 van al ala derecha
    buildWingMatches(rightWing, elimMatches.slice(8, 16), 9);

}
// ========================  OCTAVOS  ========================
function renderOctavos() {
    const leftWing = document.getElementById("bracket-left-octavos");
    const rightWing = document.getElementById("bracket-right-octavos");

    if (!leftWing || !rightWing) return;

    leftWing.querySelectorAll('.bracket-matchup').forEach(e => e.remove());
    rightWing.querySelectorAll('.bracket-matchup').forEach(e => e.remove());

    const elimMatches = AppState.matches
        .filter(m => m.fase === 'Octavos')
        .sort((a, b) => {
            const numA = a.numero_partido || 0;
            const numB = b.numero_partido || 0;
            return numA - numB;
        });

    // Los primeros 8 partidos van al ala izquierda
    buildWingMatches(leftWing, elimMatches.slice(0, 4), 1);

    // Los siguientes 8 van al ala derecha
    buildWingMatches(rightWing, elimMatches.slice(4, 8), 5);

}
// ========================  CUARTOS  ========================
function renderCuartos() {
    const leftWing = document.getElementById("bracket-left-cuartos");
    const rightWing = document.getElementById("bracket-right-cuartos");

    if (!leftWing || !rightWing) return;

    leftWing.querySelectorAll('.bracket-matchup').forEach(e => e.remove());
    rightWing.querySelectorAll('.bracket-matchup').forEach(e => e.remove());

    const elimMatches = AppState.matches
        .filter(m => m.fase === 'Cuartos')
        .sort((a, b) => {
            const numA = a.numero_partido || 0;
            const numB = b.numero_partido || 0;
            return numA - numB;
        });

    // Los primeros 2 partidos van al ala izquierda
    buildWingMatches(leftWing, elimMatches.slice(0, 2), 1);

    // Los siguientes 2 van al ala derecha
    buildWingMatches(rightWing, elimMatches.slice(2, 4), 5);

}
// ========================  SEMIFINALES  ========================
function renderSemifinales() {
    const leftWing = document.getElementById("bracket-left-semifinales");
    const rightWing = document.getElementById("bracket-right-semifinales");

    if (!leftWing || !rightWing) return;

    leftWing.querySelectorAll('.bracket-matchup').forEach(e => e.remove());
    rightWing.querySelectorAll('.bracket-matchup').forEach(e => e.remove());

    const elimMatches = AppState.matches
        .filter(m => m.fase === 'Semifinales')
        .sort((a, b) => {
            const numA = a.numero_partido || 0;
            const numB = b.numero_partido || 0;
            return numA - numB;
        });

    // El primer partido a la izquierda
    buildWingMatches(leftWing, elimMatches.slice(0, 1), 1);

    // El segundo partido a la derecha
    buildWingMatches(rightWing, elimMatches.slice(1, 2), 2);

}
// ========================  FINAL y TERCER LUGAR  ========================
function renderFinal() {
    const leftWing = document.getElementById("bracket-left-final");
    const rightWing = document.getElementById("bracket-right-final");

    if (!leftWing || !rightWing) return;

    leftWing.querySelectorAll('.bracket-matchup').forEach(e => e.remove());
    rightWing.querySelectorAll('.bracket-matchup').forEach(e => e.remove());

    const elimMatches = AppState.matches
        .filter(m => m.fase === 'Final' || m.fase === 'Tercer Puesto')
        .sort((a, b) => {
            const numA = a.numero_partido || 0;
            const numB = b.numero_partido || 0;
            return numA - numB;
        });

    // Los primeros 8 partidos van al ala izquierda
    buildWingMatches(leftWing, elimMatches.slice(0, 1), 1);

    // Los siguientes 8 van al ala derecha
    buildWingMatches(rightWing, elimMatches.slice(1, 2), 2);

}


// ==========================================================================
// GUARDAR PREDICCIONES
// ==========================================================================

async function savePrediction(matchId) {
    if (!AppState.session) return;

    const glInput = document.getElementById(`score-l-${matchId}`);
    const gvInput = document.getElementById(`score-v-${matchId}`);
    const saveBtn = document.getElementById(`save-btn-${matchId}`); // Para grid groups

    if (!glInput || !gvInput) return;

    const golesLocal = parseInt(glInput.value);
    const golesVisitante = parseInt(gvInput.value);

    if (isNaN(golesLocal) || isNaN(golesVisitante)) {
        if (saveBtn) showToast("Marcador Incompleto", "Ingresa ambos marcadores para guardar tu pronÃ³stico.", "error");
        return;
    }

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<span class="spinner inline-spinner" style="margin:0;"></span>`;
    }

    try {
        const match = AppState.matches.find(m => m.id === matchId);
        if (new Date(match.fecha_hora) <= AppState.currentDate) {
            throw new Error("El candado se ha cerrado. El partido ya ha comenzado.");
        }

        const payload = {
            partido_id: matchId,
            usuario_id: AppState.session.user.id,
            goles_local: golesLocal,
            goles_visitante: golesVisitante
        };

        const { data, error } = await window.supabaseClient
            .from('predicciones')
            .upsert(payload, { onConflict: 'partido_id,usuario_id' })
            .select();

        if (error) throw error;

        const existingPred = AppState.predictions.find(p => p.partido_id === matchId);
        if (existingPred) {
            existingPred.goles_local = golesLocal;
            existingPred.goles_visitante = golesVisitante;
            if (saveBtn) showToast("PronÃ³stico Actualizado", "Tu marcador ha sido actualizado con Ã©xito.", "success");
        } else {
            if (data && data.length > 0) AppState.predictions.push(data[0]);
            if (saveBtn) showToast("Apuesta Registrada", "Tu marcador se ha guardado con Ã©xito.", "success");
        }

        // Refresco visual suave
        if (saveBtn) {
            renderMatches();
        } else {
            // AnimaciÃ³n para bracket (onblur)
            glInput.style.backgroundColor = 'rgba(132, 197, 76, 0.2)';
            gvInput.style.backgroundColor = 'rgba(132, 197, 76, 0.2)';
            setTimeout(() => { glInput.style.backgroundColor = ''; gvInput.style.backgroundColor = ''; }, 1000);
        }

    } catch (err) {
        console.error("Error al guardar predicciÃ³n:", err);
        const isClosedError = err.message?.includes("row-level security policy") || err.message?.includes("candado") || err.message?.includes("comenzado");
        if (isClosedError) {
            showToast("Â¡Tiempo LÃ­mite Expirado!", "Este partido ya ha comenzado en el servidor y las apuestas estÃ¡n cerradas.", "error");
        } else {
            showToast("Error al Guardar", "No se pudo guardar el pronÃ³stico.", "error");
        }
        loadQuinielaData();
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            const pred = AppState.predictions.find(p => p.partido_id === matchId);
            saveBtn.innerHTML = `
                <i data-lucide="save" style="width: 14px; height: 14px;"></i>
                <span>${pred ? 'Actualizar' : 'Guardar Apuesta'}</span>
            `;

            if (pred) {
                const footer = saveBtn.closest('.match-footer');
                if (footer && !footer.querySelector('.prediction-status-saved')) {
                    const span = document.createElement('span');
                    span.className = 'prediction-status-saved';
                    span.innerHTML = '<i data-lucide="check-circle" style="width: 12px; height: 12px;"></i> PronÃ³stico Guardado';
                    footer.insertBefore(span, saveBtn);
                }
            }
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }
}


