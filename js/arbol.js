// Estado Global de la vista Árbol
const ArbolState = {
    matches: [],
    teams: []
};

document.addEventListener("DOMContentLoaded", () => {
    initArbol();
});

async function initArbol() {
    showScreen('loading-screen');

    if (!window.supabaseClient) {
        console.error("Credenciales no configuradas.");
        return;
    }

    try {
        // Cargar equipos para cruces
        const { data: teamsData, error: teamsError } = await window.supabaseClient.from('equipos').select('*');
        if (teamsError) throw teamsError;
        ArbolState.teams = teamsData || [];

        // Cargar TODOS los partidos
        const { data: matchesData, error: matchesError } = await window.supabaseClient
            .from('partidos')
            .select(`
                *,
                equipo_local:equipos!equipo_local_id(*),
                equipo_visitante:equipos!equipo_visitante_id(*)
            `)
            .order('fecha_hora', { ascending: true });

        if (matchesError) throw matchesError;
        ArbolState.matches = matchesData || [];

        renderArbol();

        showScreen('dashboard-screen');
    } catch (err) {
        console.error("Error al cargar datos del árbol:", err);
        alert("Ocurrió un error al cargar el árbol del torneo.");
    }
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(el => el.style.display = 'none');
    document.getElementById(screenId).style.display = 'block';
}

function getMatchById(id) {
    return ArbolState.matches.find(m => m.id === id);
}

// Renderizar el árbol completo según la disposición oficial de FIFA
function renderArbol() {
    // Arrays de IDs según el orden lógico de la llave oficial (basado en P73-P104)
    const leftWingLayout = {
        '16avos': [74, 77, 73, 75, 83, 84, 81, 82],
        'Octavos': [89, 90, 93, 94],
        'Cuartos': [97, 98],
        'Semifinales': [101]
    };

    const rightWingLayout = {
        '16avos': [76, 78, 79, 80, 86, 88, 85, 87],
        'Octavos': [91, 92, 95, 96],
        'Cuartos': [99, 100],
        'Semifinales': [102]
    };

    const centerLayout = {
        'Final': 104,
        'Tercer Puesto': 103
    };

    const leftContainer = document.getElementById('left-wing');
    const rightContainer = document.getElementById('right-wing');

    leftContainer.innerHTML = '';
    rightContainer.innerHTML = '';

    // Renderizar Ala Izquierda
    leftContainer.appendChild(createCol('Dieciseisavos de final', leftWingLayout['16avos']));
    leftContainer.appendChild(createCol('Octavos de final', leftWingLayout['Octavos']));
    leftContainer.appendChild(createCol('Cuartos de final', leftWingLayout['Cuartos']));
    leftContainer.appendChild(createCol('Semifinal', leftWingLayout['Semifinales']));

    // Renderizar Ala Derecha (Orden inverso visualmente, pero flex-direction: row-reverse lo maneja)
    rightContainer.appendChild(createCol('Semifinal', rightWingLayout['Semifinales']));
    rightContainer.appendChild(createCol('Cuartos de final', rightWingLayout['Cuartos']));
    rightContainer.appendChild(createCol('Octavos de final', rightWingLayout['Octavos']));
    rightContainer.appendChild(createCol('Dieciseisavos de final', rightWingLayout['16avos']));

    // Renderizar Centro
    const finalMatch = getMatchById(centerLayout['final']);
    const thirdMatch = getMatchById(centerLayout['tercero']);

    const finalContainer = document.getElementById('final-match-container');
    const thirdContainer = document.getElementById('tercer-lugar-container');
    
    finalContainer.innerHTML = '';
    thirdContainer.innerHTML = '';
    
    finalContainer.innerHTML = `<div class="bracket-column-title" style="text-align: center; margin-bottom: 1rem;">Final</div>`;
    if (finalMatch) finalContainer.appendChild(createReadOnlyCard(finalMatch));

    thirdContainer.innerHTML = `<div class="bracket-column-title" style="text-align: center; margin-bottom: 1rem;">Partido por el tercer puesto</div>`;
    if (thirdMatch) thirdContainer.appendChild(createReadOnlyCard(thirdMatch));
}

function createCol(title, matchIds) {
    const col = document.createElement('div');
    col.className = 'bracket-col';
    
    const titleEl = document.createElement('div');
    titleEl.className = 'bracket-column-title';
    titleEl.textContent = title;
    col.appendChild(titleEl);

    // Los partidos se agrupan en bracket-matchup (de 2 en 2)
    for (let i = 0; i < matchIds.length; i += 2) {
        const matchupDiv = document.createElement("div");
        matchupDiv.className = "bracket-matchup";

        const m1 = getMatchById(matchIds[i]);
        const m2 = matchIds[i+1] ? getMatchById(matchIds[i+1]) : null;

        if (m1) matchupDiv.appendChild(createReadOnlyCard(m1));
        if (m2) matchupDiv.appendChild(createReadOnlyCard(m2));

        col.appendChild(matchupDiv);
    }
    
    return col;
}

// Crear tarjeta estática (Solo Lectura)
function createReadOnlyCard(match) {
    const matchDiv = document.createElement('div');
    matchDiv.className = 'bracket-match';

    const localTeam = match.equipo_local || { nombre: "Por definir", siglas: "---", codigo_iso: "unknown" };
    const visitTeam = match.equipo_visitante || { nombre: "Por definir", siglas: "---", codigo_iso: "unknown" };
    
    const matchDate = new Date(match.fecha_hora);
    const dateFormatted = matchDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeFormatted = matchDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    const isFinished = match.goles_local !== null && match.goles_visitante !== null;
    let matchStatusStr = isFinished ? 'Finalizado' : `${dateFormatted} &nbsp; ${timeFormatted}`;

    const scoreL = isFinished ? match.goles_local : '-';
    const scoreV = isFinished ? match.goles_visitante : '-';

    matchDiv.innerHTML = `
        <div class="match-card read-only-card" style="width: 100%; margin: 0; position: relative; z-index: 2; background: var(--bg-card); border: 1px solid var(--border-card); border-radius: 8px; padding: 8px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
            <!-- Status Header -->
            <div class="match-header" style="display: flex; justify-content: space-between; font-size: 0.65rem; color: var(--text-muted); border-bottom: 1px solid var(--border-card); padding-bottom: 4px;">
                <span class="match-time">${matchStatusStr}</span>
                <span class="match-id" style="font-weight: bold;">P${match.id}</span>
            </div>

            <!-- Versus Area -->
            <div class="match-versus-area" style="display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px;">
                <!-- Local -->
                <div class="team-col local" style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                    <div class="flag-wrapper" style="width: 28px; height: 20px; border-radius: 2px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                        <img src="https://flagcdn.com/w40/${localTeam.codigo_iso.toLowerCase()}.png" 
                             alt="${localTeam.nombre}" 
                             onerror="this.src='img/default_flag.png'"
                             style="width: 100%; height: 100%; object-fit: cover;">
                    </div>
                    <span class="team-siglas" style="font-size: 0.75rem; color: var(--text-muted); font-weight: bold;">${localTeam.siglas}</span>
                </div>

                <!-- Scores -->
                <div class="score-display" style="display: flex; align-items: center; justify-content: center; gap: 8px; background: rgba(0,0,0,0.2); padding: 4px 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
                    <span class="real-score-val" style="font-size: 1.2rem; font-weight: bold; color: #fff;">${scoreL}</span>
                    <span style="color: var(--text-muted); font-size: 0.8rem;">-</span>
                    <span class="real-score-val" style="font-size: 1.2rem; font-weight: bold; color: #fff;">${scoreV}</span>
                </div>

                <!-- Visitante -->
                <div class="team-col visitante" style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                    <div class="flag-wrapper" style="width: 28px; height: 20px; border-radius: 2px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                        <img src="https://flagcdn.com/w40/${visitTeam.codigo_iso.toLowerCase()}.png" 
                             alt="${visitTeam.nombre}" 
                             onerror="this.src='img/default_flag.png'"
                             style="width: 100%; height: 100%; object-fit: cover;">
                    </div>
                    <span class="team-siglas" style="font-size: 0.75rem; color: var(--text-muted); font-weight: bold;">${visitTeam.siglas}</span>
                </div>
            </div>
        </div>
    `;

    return matchDiv;
}
