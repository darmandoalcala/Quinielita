// Estado Global de la Aplicación
const AppState = {
    session: null,
    userProfile: null,
    matches: [],
    predictions: [],
    teams: [],
    leaderboard: [],
    activeTab: 'tab-eliminatoria',
    currentDate: new Date(),
    matchesPerPage: 24,
    matchesDisplayed: 24
};

// Carga Inicial del DOM
document.addEventListener("DOMContentLoaded", () => {
    initApp();
    setupEventListeners();
});

// Inicializar Aplicación (Sesión Compartida)
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
                            <button id="logout-btn" class="btn-icon danger" title="Cerrar Sesión" onclick="handleLogout()">
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

        showScreen('dashboard-screen');
        window.dispatchEvent(new Event('scroll'));

    } catch (err) {
        console.error("Error en inicialización de app:", err);
        setupAnonymousHeader();
        await loadQuinielaData();
        showScreen('dashboard-screen');
    }
}

// Configura el encabezado en modo espectador
function setupAnonymousHeader() {
    const profileWidget = document.getElementById("header-profile-widget");
    const myPredsFilter = document.getElementById("filter-my-predictions");

    if (profileWidget) {
        profileWidget.innerHTML = `
            <a href="../login/index.html" class="btn btn-primary btn-sm" style="text-decoration:none; gap:6px;">
                <i data-lucide="log-in" style="width:14px; height:14px;"></i>
                <span>Iniciar Sesión</span>
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
// PESTAÑAS (SPA)
// ==========================================================================

function setupEventListeners() {
    // Navegación de Pestañas
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
            // Forzar reflow para animación
            void targetSection.offsetWidth;
            targetSection.style.opacity = "1";
            targetSection.style.transform = "translateY(0)";
        }
    }

    AppState.activeTab = tabId;

    if (tabId === 'tab-grupos' || tabId === 'tab-eliminatoria') {
        // La carga se hizo al inicio, pero por si acaso re-renderizamos.
        renderMatches();
        renderBracket();
    } else if (tabId === 'tab-leaderboard') {
        loadLeaderboardData();
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ==========================================================================
// AUTENTICACIÓN
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
        console.error("Error al cerrar sesión:", err);
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
        renderBracket();

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
    if (ptsIndicator) ptsIndicator.textContent = `${points} pts`;
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
        grid.innerHTML = `
            <div class="loading-placeholder">
                <i data-lucide="info" style="width: 38px; height: 38px; color: var(--text-muted);"></i>
                <p style="margin-top: 10px;">No se encontraron partidos para los filtros aplicados.</p>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    const visibleMatches = filteredMatches.slice(0, AppState.matchesDisplayed);
    const remaining = filteredMatches.length - AppState.matchesDisplayed;

    visibleMatches.forEach((match, index) => {
        const localTeam = match.equipo_local || { nombre: "Local", siglas: "LOC", codigo_iso: "unknown", grupo: "A" };
        const visitTeam = match.equipo_visitante || { nombre: "Visitante", siglas: "VIS", codigo_iso: "unknown", grupo: "A" };

        const prediction = AppState.predictions.find(p => p.partido_id === match.id);
        const predL = prediction ? prediction.goles_local : "";
        const predV = prediction ? prediction.goles_visitante : "";

        const matchDate = new Date(match.fecha_hora);
        const isLocked = matchDate <= AppState.currentDate;
        const isFinished = match.goles_local !== null && match.goles_visitante !== null;
        let pointsTag = "";
        let realScoreBadge = "";

        if (isFinished) {
            const earned = prediction ? (prediction.puntos_ganados || 0) : 0;
            if (prediction) {
                if (earned === 3) pointsTag = `<div class="points-earned-tag gold">+3 Puntos (Exacto)</div>`;
                else if (earned === 1) pointsTag = `<div class="points-earned-tag" style="background: #475569; color: white;">+1 Punto (Resultado)</div>`;
                else pointsTag = `<div class="points-earned-tag" style="background: var(--danger); color: white;">0 Puntos</div>`;
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
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        const inputsDisabled = isLocked || !AppState.session;
        let footerContent = "";
        
        if (isLocked) {
            footerContent = `
                <div class="prediction-status-locked">
                    <i data-lucide="lock" style="width: 14px; height: 14px;"></i>
                    <span>Apuestas Cerradas</span>
                </div>
            `;
        } else if (!AppState.session) {
            footerContent = `
                <a href="../login/index.html" class="save-prediction-btn" style="text-decoration:none;">
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

        const card = document.createElement("div");
        card.className = `glass-card match-card ${isLocked && !isFinished ? '' : 'pulsing-border'}`;
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
                        <i data-lucide="check-circle" style="width: 12px; height: 12px;"></i> Pronóstico Guardado
                    </span>
                ` : ''}
            </div>
        `;
        grid.appendChild(card);
    });

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

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function loadMoreMatches() {
    AppState.matchesDisplayed += AppState.matchesPerPage;
    renderMatches();
}

// ==========================================================================
// RENDERIZADO: BRACKET (16AVOS)
// ==========================================================================

function renderBracket() {
    const leftWing = document.getElementById("bracket-left-wing");
    const rightWing = document.getElementById("bracket-right-wing");
    
    if (!leftWing || !rightWing) return;

    leftWing.querySelectorAll('.bracket-matchup').forEach(e => e.remove());
    rightWing.querySelectorAll('.bracket-matchup').forEach(e => e.remove());

    const elimMatches = AppState.matches.filter(m => m.fase === '16avos');
    
    // Los primeros 8 partidos van al ala izquierda
    buildWingMatches(leftWing, elimMatches.slice(0, 8), 1);
    
    // Los siguientes 8 van al ala derecha
    buildWingMatches(rightWing, elimMatches.slice(8, 16), 9);
}

function buildWingMatches(container, wingMatches, startIndex) {
    for (let i = 0; i < wingMatches.length; i += 2) {
        const matchupDiv = document.createElement("div");
        matchupDiv.className = "bracket-matchup";
        
        const m1 = wingMatches[i];
        const m2 = wingMatches[i+1];
        
        if (m1) matchupDiv.appendChild(createMatchElement(m1, startIndex + i));
        if (m2) matchupDiv.appendChild(createMatchElement(m2, startIndex + i + 1));
        
        container.appendChild(matchupDiv);
    }
}

function createMatchElement(match, matchNumber) {
    const matchDiv = document.createElement("div");
    matchDiv.className = "bracket-match";

    const localTeam = match.equipo_local || { nombre: "Por Definir", codigo_iso: "unknown" };
    const visitTeam = match.equipo_visitante || { nombre: "Por Definir", codigo_iso: "unknown" };

    const flagLocal = localTeam.codigo_iso !== "unknown" ? `https://flagcdn.com/${localTeam.codigo_iso}.svg` : "https://flagcdn.com/un.svg";
    const flagVisit = visitTeam.codigo_iso !== "unknown" ? `https://flagcdn.com/${visitTeam.codigo_iso}.svg` : "https://flagcdn.com/un.svg";

    const matchDate = new Date(match.fecha_hora);
    const formattedDate = isNaN(matchDate) ? "Por Definir" : matchDate.toLocaleString('es-MX', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const isLocked = !isNaN(matchDate) && matchDate <= AppState.currentDate;
    const inputsDisabled = isLocked || !AppState.session;

    const prediction = AppState.predictions.find(p => p.partido_id === match.id);
    const predL = prediction && prediction.goles_local !== null ? prediction.goles_local : "";
    const predV = prediction && prediction.goles_visitante !== null ? prediction.goles_visitante : "";

    matchDiv.innerHTML = `
        <div class="compact-match-card ${isLocked ? '' : 'pulsing-border'}">
            <div class="compact-header">
                <span class="match-group">16avos - L${matchNumber}</span>
                <span class="match-time">${formattedDate}</span>
            </div>
            
            <div class="compact-team-row">
                <div class="compact-team-info">
                    <div class="flag-wrapper"><img src="${flagLocal}" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='https://flagcdn.com/un.svg'"></div>
                    <span class="team-name" title="${localTeam.nombre}">${localTeam.nombre}</span>
                </div>
                <input type="number" min="0" max="99" class="compact-score-input" id="score-l-${match.id}" value="${predL}" ${inputsDisabled ? 'disabled' : ''} placeholder="-" onblur="savePrediction(${match.id})">
            </div>
            
            <div class="compact-team-row">
                <div class="compact-team-info">
                    <div class="flag-wrapper"><img src="${flagVisit}" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='https://flagcdn.com/un.svg'"></div>
                    <span class="team-name" title="${visitTeam.nombre}">${visitTeam.nombre}</span>
                </div>
                <input type="number" min="0" max="99" class="compact-score-input" id="score-v-${match.id}" value="${predV}" ${inputsDisabled ? 'disabled' : ''} placeholder="-" onblur="savePrediction(${match.id})">
            </div>
        </div>
    `;
    return matchDiv;
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
        if (saveBtn) showToast("Marcador Incompleto", "Ingresa ambos marcadores para guardar tu pronóstico.", "error");
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
            if(saveBtn) showToast("Pronóstico Actualizado", "Tu marcador ha sido actualizado con éxito.", "success");
        } else {
            if (data && data.length > 0) AppState.predictions.push(data[0]);
            if(saveBtn) showToast("Apuesta Registrada", "Tu marcador se ha guardado con éxito.", "success");
        }
        
        // Refresco visual suave
        if(saveBtn) {
            renderMatches();
        } else {
            // Animación para bracket (onblur)
            glInput.style.backgroundColor = 'rgba(132, 197, 76, 0.2)';
            gvInput.style.backgroundColor = 'rgba(132, 197, 76, 0.2)';
            setTimeout(() => { glInput.style.backgroundColor = ''; gvInput.style.backgroundColor = ''; }, 1000);
        }

    } catch (err) {
        console.error("Error al guardar predicción:", err);
        const isClosedError = err.message?.includes("row-level security policy") || err.message?.includes("candado") || err.message?.includes("comenzado");
        if (isClosedError) {
            showToast("¡Tiempo Límite Expirado!", "Este partido ya ha comenzado en el servidor y las apuestas están cerradas.", "error");
        } else {
            showToast("Error al Guardar", "No se pudo guardar el pronóstico.", "error");
        }
        loadQuinielaData();
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

// ==========================================================================
// RENDERIZADO: CLASIFICACIÓN (LEADERBOARD)
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
        if (AppState.matches.length === 0) await loadQuinielaData();

        const finishedMatches = AppState.matches.filter(m => m.goles_local !== null && m.goles_visitante !== null);
        finishedMatches.sort((a, b) => {
            const timeDiff = new Date(b.fecha_hora) - new Date(a.fecha_hora);
            if (timeDiff !== 0) return timeDiff;
            return b.id - a.id;
        });
        const lastMatch = finishedMatches.length > 0 ? finishedMatches[0] : null;

        const { data: leaderboardData, error: viewError } = await window.supabaseClient.from('leaderboard_view').select('*');
        if (viewError) throw viewError;

        let lastMatchPreds = [];
        if (lastMatch) {
            const { data: predsData } = await window.supabaseClient.from('predicciones').select('usuario_id, puntos_ganados').eq('partido_id', lastMatch.id);
            if (predsData) lastMatchPreds = predsData;
        }

        const leaderboard = leaderboardData.map(user => {
            let lastMatchPoints = 0;
            if (lastMatch) {
                const lastPred = lastMatchPreds.find(p => p.usuario_id === user.id);
                if (lastPred) lastMatchPoints = lastPred.puntos_ganados || 0;
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
            let rankClass = rank === 1 ? "rank-gold" : rank === 2 ? "rank-silver" : rank === 3 ? "rank-bronze" : "";
            const isMe = AppState.session ? player.id === AppState.session.user.id : false;

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><span class="rank-badge ${rankClass}">${rank}</span></td>
                <td>
                    <span class="participant-name">${player.nombre_completo}</span>
                    ${isMe ? '<span class="participant-you-tag">Tú</span>' : ''}
                    ${player.lastMatchPoints === 3 ? `<span style="color: var(--primary); font-size: 0.8rem; margin-left: 4px;">+3</span>` : ''}
                    ${player.lastMatchPoints === 1 ? `<span style="color: var(--tertiary); font-size: 0.8rem; margin-left: 4px;">+1</span>` : ''}
                    ${player.lastMatchPoints === 0 ? `<span style="color: var(--danger); font-size: 0.8rem; margin-left: 4px;">+0</span>` : ''}
                </td>
                <td class="participant-subtext">${player.correo}</td>
                <td style="text-align: center; vertical-align: middle;"><span class="pts-col-val">${player.points}</span></td>
                <td style="text-align: center;">
                    <button class="btn-view-predictions" onclick="viewPlayerPredictions('${player.id}')">
                        <i data-lucide="eye" style="width: 14px; height: 14px;"></i> Ver Pronósticos
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        if (typeof lucide !== 'undefined') lucide.createIcons();

    } catch (err) {
        console.error("Error al construir leaderboard:", err);
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4" style="color: var(--danger);">No se pudieron cargar los datos de clasificación.</td></tr>`;
    }
}

async function viewPlayerPredictions(playerUserId) {
    const modal = document.getElementById("user-details-modal");
    const title = document.getElementById("details-user-name");
    const info = document.getElementById("details-user-info");
    const container = document.getElementById("details-predictions-grid");
    if (!modal || !container) return;

    container.innerHTML = `<div class="loading-placeholder"><img src="../img/worldcup_trophy/0001.webp" class="trophy-spinner" alt="Cargando..." style="width: 40px;"> Cargando pronósticos del competidor...</div>`;
    modal.classList.remove("hidden");

    try {
        const player = AppState.leaderboard.find(u => u.id === playerUserId);
        if (!player) throw new Error("Usuario no encontrado.");

        title.textContent = `Apuestas de ${player.nombre_completo}`;
        info.textContent = `ID Oculto: ${player.rfc.substring(0, 4)}****** | ${player.points} Puntos Totales`;

        const isMe = AppState.session ? playerUserId === AppState.session.user.id : false;

        const { data: rawPreds, error } = await window.supabaseClient.from('predicciones').select('*').eq('usuario_id', playerUserId);
        if (error) throw error;

        container.innerHTML = "";
        
        // Filtrar y ordenar cronológicamente
        const sortedMatches = [...AppState.matches].sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora));

        sortedMatches.forEach(match => {
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
                        <div class="mini-team-info"><img class="mini-flag" src="https://flagcdn.com/${localTeam.codigo_iso}.svg" alt=""><span>${localTeam.siglas}</span></div>
                        <div class="mini-secret-lock"><i data-lucide="lock" style="width: 10px; height: 10px;"></i><span>Oculto</span></div>
                        <div class="mini-team-info"><span>${visitTeam.siglas}</span><img class="mini-flag" src="https://flagcdn.com/${visitTeam.codigo_iso}.svg" alt=""></div>
                    </div>
                `;
            } else {
                const gl = pred ? pred.goles_local : "-";
                const gv = pred ? pred.goles_visitante : "-";
                const hasApuesta = pred !== undefined;

                if (isFinished && hasApuesta) {
                    const pts = pred.puntos_ganados || 0;
                    pointsEarnedLabel = pts === 3 ? `<span class="badge badge-gold" style="font-size:0.6rem;">+3 pts</span>` :
                        pts === 1 ? `<span class="badge badge-info" style="font-size:0.6rem;">+1 pt</span>` : `<span class="badge badge-danger" style="font-size:0.6rem;">0 pts</span>`;
                } else if (isFinished && !hasApuesta) {
                    pointsEarnedLabel = `<span class="badge badge-danger" style="font-size:0.6rem;">0 pts</span>`;
                }

                cardBody = `
                    <div class="mini-card-teams">
                        <div class="mini-team-info"><img class="mini-flag" src="https://flagcdn.com/${localTeam.codigo_iso}.svg" alt=""><span>${localTeam.siglas}</span></div>
                        <div style="display:flex; align-items:center; gap:6px;">
                            <span class="mini-score-val">${gl}</span>
                            <span style="font-weight:700; color:var(--text-muted);">:</span>
                            <span class="mini-score-val">${gv}</span>
                        </div>
                        <div class="mini-team-info"><span>${visitTeam.siglas}</span><img class="mini-flag" src="https://flagcdn.com/${visitTeam.codigo_iso}.svg" alt=""></div>
                    </div>
                `;
            }

            const faseText = match.fase || 'Fase de Grupos';

            const card = document.createElement("div");
            card.className = "mini-prediction-card";
            card.innerHTML = `
                <div class="mini-card-header">
                    <span>${faseText}</span>
                    ${pointsEarnedLabel}
                </div>
                ${cardBody}
            `;
            container.appendChild(card);
        });

        if (typeof lucide !== 'undefined') lucide.createIcons();

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
// UTILIDADES (TOAST)
// ==========================================================================

function showToast(title, message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    let iconName = type === "success" ? "check-circle" : type === "error" ? "alert-circle" : "info";

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
    if (typeof lucide !== 'undefined') lucide.createIcons();

    setTimeout(() => toast.classList.add("show"), 10);
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 400);
    }, 5000);
}