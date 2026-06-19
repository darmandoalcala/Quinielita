// Estado Global de la Aplicación
const AppState = {
    session: null,
    userProfile: null,
    matches: [],
    predictions: [],
    teams: [],
    currentDate: new Date(),
    matchesPerPage: 16,
    matchesDisplayed: 16
};

// Carga Inicial del DOM
document.addEventListener("DOMContentLoaded", () => {
    initApp();
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
    if (profileWidget) {
        profileWidget.innerHTML = `
            <a href="../login/index.html" class="btn btn-primary btn-sm" style="text-decoration:none; gap:6px;">
                <i data-lucide="log-in" style="width:14px; height:14px;"></i>
                <span>Iniciar Sesión</span>
            </a>
        `;
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function showScreen(screenId) {
    document.querySelectorAll(".screen").forEach(screen => screen.classList.add("hidden"));
    const target = document.getElementById(screenId);
    if (target) target.classList.remove("hidden");
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

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

// Cargar quiniela específica para eliminatorias
async function loadQuinielaData() {
    try {
        // Cargar equipos
        if (AppState.teams.length === 0) {
            const { data: teamsData, error: teamsError } = await window.supabaseClient.from('equipos').select('*');
            if (teamsError) throw teamsError;
            AppState.teams = teamsData || [];
        }

        // Cargar partidos (Filtramos solo fase de 16avos)
        const { data: matchesData, error: errTry1 } = await window.supabaseClient
            .from('partidos')
            .select(`
                *,
                equipo_local:equipos!equipo_local_id(*),
                equipo_visitante:equipos!equipo_visitante_id(*)
            `)
            .eq('fase', '16avos')
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

        // Inyectar datos en el layout de bracket
        renderBracket();

    } catch (err) {
        console.error("Error al cargar quiniela:", err);
    }
}

// Pintar el Bracket Dinámico
function renderBracket() {
    const leftWing = document.getElementById("bracket-left-wing");
    const rightWing = document.getElementById("bracket-right-wing");
    
    if (!leftWing || !rightWing) return;

    // Limpiar previas para que no se dupliquen al recargar
    leftWing.querySelectorAll('.bracket-matchup').forEach(e => e.remove());
    rightWing.querySelectorAll('.bracket-matchup').forEach(e => e.remove());

    const matches = AppState.matches || [];
    
    // Los primeros 8 partidos van al ala izquierda
    buildWingMatches(leftWing, matches.slice(0, 8), 1);
    
    // Los siguientes 8 van al ala derecha
    buildWingMatches(rightWing, matches.slice(8, 16), 9);
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
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
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

// Guardar/Actualizar Predicción automáticamente al salir del input
async function savePrediction(matchId) {
    if (!AppState.session) return;

    const inputL = document.getElementById(`score-l-${matchId}`);
    const inputV = document.getElementById(`score-v-${matchId}`);
    
    if (!inputL || !inputV) return;

    const golesLocal = parseInt(inputL.value);
    const golesVisitante = parseInt(inputV.value);

    // No guardar si están en blanco ambos o si falta uno
    if (isNaN(golesLocal) || isNaN(golesVisitante)) {
        return;
    }

    try {
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

        // Actualizar el estado local
        const existingPred = AppState.predictions.find(p => p.partido_id === matchId);
        if (existingPred) {
            existingPred.goles_local = golesLocal;
            existingPred.goles_visitante = golesVisitante;
        } else {
            if (data && data.length > 0) {
                AppState.predictions.push(data[0]);
            }
        }
        
        // Efecto visual de guardado exitoso
        inputL.style.backgroundColor = 'rgba(132, 197, 76, 0.2)';
        inputV.style.backgroundColor = 'rgba(132, 197, 76, 0.2)';
        setTimeout(() => {
            inputL.style.backgroundColor = '';
            inputV.style.backgroundColor = '';
        }, 1000);

    } catch (e) {
        console.error("Error al guardar predicción:", e);
    }
}

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