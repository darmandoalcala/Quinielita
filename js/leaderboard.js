// ==========================================================================
// RENDERIZADO: LEADERBOARD Y MODAL DE PREDICCIONES
// ==========================================================================

async function loadLeaderboardData() {
    const tbody = document.getElementById("leaderboard-body");
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="5" class="text-center py-4">
                <div class="spinner inline-spinner"></div> Cargando tabla de clasificación...
            </td>
        </tr>
    `;

    try {
        const finishedMatches = AppState.matches.filter(m => m.goles_local !== null && m.goles_visitante !== null);
        finishedMatches.sort((a, b) => {
            const dateA = new Date(a.fecha_hora);
            const dateB = new Date(b.fecha_hora);
            return dateB - dateA;
        });
        const lastMatch = finishedMatches.length > 0 ? finishedMatches[0] : null;

        const { data: leaderboardData, error: viewError } = await window.supabaseClient.from('leaderboard_view').select('*');
        if (viewError) throw viewError;

        let lastMatchPreds = [];
        if (lastMatch) {
            const { data: predsData } = await window.supabaseClient.from('predicciones').select('usuario_id, puntos_ganados').eq('partido_id', lastMatch.id);
            if (predsData) {
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
                    ${player.lastMatchPoints === 3 ? `<span class="last-match-points-3">+3</span>` : ''}
                    ${player.lastMatchPoints === 1 ? `<span class="last-match-points-1">+1</span>` : ''}
                    ${player.lastMatchPoints === 0 ? `<span class="last-match-points">+0</span>` : ''}
                </td>
                <td class="participant-subtext" id="td-correo">
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

// Ver predicciones (de otros)
async function viewPlayerPredictions(playerUserId) {
    const modal = document.getElementById("user-details-modal");
    const title = document.getElementById("details-user-name");
    const info = document.getElementById("details-user-info");
    const container = document.getElementById("details-predictions-grid");
    if (!modal || !container) return;

    container.innerHTML = `<div class="loading-placeholder"><img src="../img/worldcup_trophy/0001.webp" onerror="this.src='img/worldcup_trophy/0001.webp'" class="trophy-spinner" alt="Cargando..." style="width: 40px;"> Cargando pronósticos del competidor...</div>`;
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

        // Genera LINEA DEL TIEMPO
        const groupMatches = AppState.matches.filter(m => !m.fase || m.fase === 'Fase de Grupos');
        groupMatches.sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora));

        let timelineSegments = "";
        const TOTAL_GROUP_MATCHES = 72;

        for (let i = 0; i < TOTAL_GROUP_MATCHES; i++) {
            let lineClass = "";
            let labelHTML = "";

            if (i < groupMatches.length) {
                const match = groupMatches[i];
                const isFinished = match.goles_local !== null && match.goles_visitante !== null;
                const pred = rawPreds.find(p => p.partido_id === match.id);

                if (isFinished) {
                    const pts = pred ? (pred.puntos_ganados || 0) : 0;
                    if (pts === 3) {
                        lineClass = "pts-3";
                        labelHTML = `<span class="timeline-label top pts-3">3</span>`;
                    } else if (pts === 1) {
                        lineClass = "pts-1";
                        labelHTML = `<span class="timeline-label top pts-1">1</span>`;
                    } else {
                        lineClass = "pts-0";
                        labelHTML = `<span class="timeline-label bottom pts-0">0</span>`;
                    }
                }
            }

            timelineSegments += `
                <div class="timeline-segment">
                    ${labelHTML.includes('top') ? labelHTML : ''}
                    <div class="timeline-line ${lineClass}"></div>
                    ${labelHTML.includes('bottom') ? labelHTML : ''}
                </div>
            `;
        }

        const timelineHTML = `
            <div class="timeline-wrapper" style="grid-column: 1 / -1;">
                <h4 class="timeline-title">Fase de Grupos</h4>
                <div class="timeline-scroll-container">
                    <div class="timeline-track">
                        ${timelineSegments}
                    </div>
                </div>
            </div>
        `;

        container.innerHTML += timelineHTML;

        const showPredictionsButton = `
            <div id="btn-show-preds-container" style="text-align: center; margin-top: 1rem; margin-bottom: 1rem; grid-column: 1 / -1;">
                <button class="btn-view-predictions" onclick="renderPlayerPredictions('${playerUserId}')" style="margin: 0 auto;">
                    <i data-lucide="eye" style="width: 14px; height: 14px;"></i>
                    <span>Ver Pronósticos Detallados</span>
                </button>
            </div>
            <div id="modal-predictions-list" style="grid-column: 1 / -1; display: flex; flex-direction: column; width: 100%;"></div>
        `;
        
        container.innerHTML += showPredictionsButton;

        if (typeof lucide !== 'undefined') { //Si existe lucide (iconos)
            lucide.createIcons();
        }

    } catch (err) {
        console.error("Error al visualizar apuestas ajenas:", err);
        container.innerHTML = `<p class="empty-state" style="color:var(--danger)">No se pudieron cargar los datos solicitados en este momento.</p>`;
    }
}

async function renderPlayerPredictions(playerUserId) {
    const btnContainer = document.getElementById("btn-show-preds-container");
    const listContainer = document.getElementById("modal-predictions-list");
    if (!listContainer) return;

    if (btnContainer) {
        btnContainer.innerHTML = `<div class="spinner inline-spinner"></div> Cargando pronósticos...`;
    }

    try {
        const { data: rawPreds, error } = await window.supabaseClient
            .from('predicciones')
            .select('*')
            .eq('usuario_id', playerUserId);

        if (error) throw error;

        if (btnContainer) btnContainer.style.display = 'none';
        listContainer.innerHTML = "";

        const isMe = AppState.session ? playerUserId === AppState.session.user.id : false;

        const orderedPhases = ["Fase de Grupos", "16avos", "Octavos", "Cuartos", "Semifinales", "Tercer lugar", "Final"];
        let groupedMatches = {};
        orderedPhases.forEach(ph => groupedMatches[ph] = []);
        
        AppState.matches.forEach(m => {
            const phase = m.fase || "Fase de Grupos";
            if (groupedMatches[phase] !== undefined) {
                groupedMatches[phase].push(m);
            }
        });
        
        let finalHTML = "";

        orderedPhases.forEach(phase => {
            const phaseMatches = groupedMatches[phase];

            let isPhaseUnlocked = true;
            if (phase !== "Fase de Grupos" && !isMe) {
                if (phaseMatches.length === 0) {
                    isPhaseUnlocked = false; // No hay partidos = aún no llegamos a esa fase
                } else {
                    const latestMatchTime = Math.max(...phaseMatches.map(m => new Date(m.fecha_hora).getTime()));
                    if (AppState.currentDate.getTime() < latestMatchTime) {
                        isPhaseUnlocked = false;
                    }
                }
            }

            finalHTML += `<div class="phase-box">`;
            finalHTML += `<h3 class="phase-box-title">${phase}</h3>`;

            if (!isPhaseUnlocked) {
                finalHTML += `
                    <div class="phase-locked-message">
                        <i data-lucide="lock" style="width: 32px; height: 32px;"></i>
                        <span>Fase Oculta</span>
                    </div>
                `;
            } else if (phaseMatches.length === 0) {
                // Caso especial: si esMi perfil, está desbloqueada pero no hay partidos
                finalHTML += `
                    <div class="phase-locked-message" style="opacity: 0.5;">
                        <i data-lucide="calendar" style="width: 32px; height: 32px;"></i>
                        <span>Equipos por definir</span>
                    </div>
                `;
            } else {
                const sortedPhaseMatches = phaseMatches.sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora));
                
                finalHTML += `<div style="display: flex; flex-direction: column; gap: 8px;">`;
                
                sortedPhaseMatches.forEach(match => {
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
                                    <i data-lucide="lock" style="width: 15px; height: 15px;"></i>
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

                    const faseText = match.fase || 'Fase de Grupos';
                    
                    finalHTML += `
                        <div class="mini-prediction-card">
                            <div class="mini-card-header">
                                <span>${faseText === 'Fase de Grupos' ? 'Grupo ' + (localTeam.grupo || 'A') : faseText}</span>
                                ${pointsEarnedLabel}
                            </div>
                            ${cardBody}
                        </div>
                    `;
                });
                
                finalHTML += `</div>`;
            }
            finalHTML += `</div>`;
        });
        
        listContainer.innerHTML = finalHTML;

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

    } catch (err) {
        console.error("Error al cargar pronósticos detallados:", err);
        listContainer.innerHTML = `<p class="empty-state" style="color:var(--danger)">Hubo un error al cargar los pronósticos.</p>`;
    }
}

// Cerrar modal
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

