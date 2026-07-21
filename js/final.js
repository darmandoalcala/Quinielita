document.addEventListener("DOMContentLoaded", () => {
    initFinal();
});

let state = {
    users: [],
    matches: [],
    predictions: [],
    currentMatchIndex: 0,
    animationInterval: null,
    barHeight: 70 // Height of each bar + margin
};

async function initFinal() {
    if (!window.supabaseClient) {
        console.error("Supabase client no configurado.");
        return;
    }

    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();

        // Cargar Usuarios
        const { data: usersData, error: usersError } = await window.supabaseClient
            .from('usuarios')
            .select('*');
        if (usersError) throw usersError;

        // Cargar Partidos (ordenados por ID para la línea de tiempo)
        const { data: matchesData, error: matchesError } = await window.supabaseClient
            .from('partidos')
            .select(`
                *,
                equipo_local:equipos!equipo_local_id(*),
                equipo_visitante:equipos!equipo_visitante_id(*)
            `)
            .order('id', { ascending: true });
        if (matchesError) throw matchesError;

        // Cargar Predicciones (Paginación para superar el límite de 1000 registros de Supabase)
        let allPreds = [];
        let limit = 1000;
        let start = 0;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await window.supabaseClient
                .from('predicciones')
                .select('usuario_id, partido_id, puntos_ganados')
                .range(start, start + limit - 1);

            if (error) throw error;

            allPreds = allPreds.concat(data);

            if (data.length < limit) {
                hasMore = false;
            } else {
                start += limit;
            }
        }
        const predsData = allPreds;

        // Inicializar estado
        state.users = usersData.map(u => ({
            ...u,
            points: 0,
            rank: 0,
            element: null
        }));

        state.matches = matchesData;
        state.predictions = predsData;

        // Asegurar que se muestra la pantalla de premiación
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) loadingScreen.classList.add('hidden');

        const premiacionScreen = document.getElementById('premiacion-screen');
        if (premiacionScreen) premiacionScreen.classList.remove('hidden');
        if (typeof lucide !== 'undefined') lucide.createIcons();

        buildLeaderboardDOM();
    } catch (err) {
        console.error("Error al cargar datos:", err);
    }
}

// Función para iniciar la premiación y transición al dashboard
window.startAwarding = function () {
    const premiacionScreen = document.getElementById('premiacion-screen');
    if (!premiacionScreen) return;

    // Efecto de desvanecimiento
    premiacionScreen.style.transition = 'opacity 0.6s ease';
    premiacionScreen.style.opacity = '0';

    setTimeout(() => {
        premiacionScreen.classList.add('hidden');
        premiacionScreen.style.opacity = ''; // Restaurar para futuras cargas

        const dashboard = document.getElementById('dashboard-screen');
        if (dashboard) {
            dashboard.classList.remove('hidden');
            dashboard.style.opacity = '0';
            dashboard.style.transition = 'opacity 0.8s ease';
            void dashboard.offsetWidth; // Forzar reflow
            dashboard.style.opacity = '1';
        }

        // Iniciar animación automática de resultados después de una pausa de 3 segundos
        setTimeout(() => {
            startAnimation();
        }, 3000);
    }, 600);
};

function buildLeaderboardDOM() {
    const container = document.getElementById('leaderboard-container');
    container.innerHTML = '';

    // Asignar color random o inicial a los avatares
    const colors = ['#f87171', '#fb923c', '#fbbf24', '#a3e635', '#4ade80', '#34d399', '#2dd4bf', '#38bdf8', '#818cf8', '#a78bfa', '#e879f9', '#f472b6'];

    // Sort users alphabetically initially
    state.users.sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo));

    state.users.forEach((user, index) => {
        user.rank = index;
        const color = colors[index % colors.length];
        const initials = user.nombre_completo.substring(0, 2).toUpperCase();

        const bar = document.createElement('div');
        bar.className = 'user-bar';
        bar.id = `user-bar-${user.id}`;
        bar.style.transform = `translateY(${index * state.barHeight}px)`;

        bar.innerHTML = `
            <div class="user-rank" id="rank-${user.id}">${index + 1}</div>
            <div class="user-avatar" style="border-color: ${color}">${initials}</div>
            <div class="user-name">${user.nombre_completo}</div>
            <div class="user-trend" id="trend-${user.id}">-</div>
            <div class="user-points" id="points-${user.id}">0 pts</div>
        `;

        container.appendChild(bar);
        user.element = bar;
    });

    // Set container height based on number of users
    container.style.height = `${state.users.length * state.barHeight}px`;
}

function createMatchCard(matchIndex) {
    if (matchIndex >= state.matches.length) return null;
    const match = state.matches[matchIndex];

    const local = match.equipo_local ? match.equipo_local.nombre : "Por definir";
    const visit = match.equipo_visitante ? match.equipo_visitante.nombre : "Por definir";

    const localIso = match.equipo_local && match.equipo_local.codigo_iso ? match.equipo_local.codigo_iso.toLowerCase() : "";
    const visitIso = match.equipo_visitante && match.equipo_visitante.codigo_iso ? match.equipo_visitante.codigo_iso.toLowerCase() : "";

    const localAcronym = localIso ? localIso.toUpperCase() : local.substring(0, 3).toUpperCase();
    const visitAcronym = visitIso ? visitIso.toUpperCase() : visit.substring(0, 3).toUpperCase();

    const flagL = localIso ? `https://flagcdn.com/w160/${localIso}.png` : "";
    const flagV = visitIso ? `https://flagcdn.com/w160/${visitIso}.png` : "";

    const phase = match.fase || 'Fase de Grupos';
    const matchNum = match.partido_id || (matchIndex + 1);

    const isPast = matchIndex < state.currentMatchIndex;
    let scoreL = match.goles_local !== null ? match.goles_local : "-";
    let scoreV = match.goles_visitante !== null ? match.goles_visitante : "-";

    const card = document.createElement('div');
    card.className = 'match-card';
    card.id = `match-card-${matchIndex}`;

    card.innerHTML = `
        <div class="card-match-counter">${phase}</div>
        <div class="match-number-badge">${matchNum}</div>
        <div class="led-content">
            <div class="led-team led-team-local">
                <img class="led-flag" src="${flagL}" alt="" onerror="this.style.display='none'">
                <div class="led-name">${localAcronym}</div>
            </div>
            <div class="led-score">
                <span class="score-local">${isPast ? scoreL : '?'}</span>
                <span class="led-separator">-</span>
                <span class="score-visit">${isPast ? scoreV : '?'}</span>
            </div>
            <div class="led-team led-team-visit">
                <img class="led-flag" src="${flagV}" alt="" onerror="this.style.display='none'">
                <div class="led-name">${visitAcronym}</div>
            </div>
        </div>
    `;

    return card;
}

function startAnimation() {
    state.currentMatchIndex = 0;

    const carousel = document.getElementById('match-carousel');
    if (carousel) {
        carousel.innerHTML = '';

        const currentCard = createMatchCard(0);
        if (currentCard) { currentCard.classList.add('card-current'); carousel.appendChild(currentCard); }

        const upcoming1 = createMatchCard(1);
        if (upcoming1) { upcoming1.classList.add('card-upcoming-1'); carousel.appendChild(upcoming1); }

        const upcoming2 = createMatchCard(2);
        if (upcoming2) { upcoming2.classList.add('card-upcoming-2'); carousel.appendChild(upcoming2); }
    }

    processNextMatch();
}

function scheduleNextMatch() {
    if (state.currentMatchIndex >= state.matches.length) return;
    if (state.isManualPaused) return;

    state.animationTimeout = setTimeout(() => {
        processNextMatch();
    }, 900);
}

function processNextMatch() {
    const matchIndex = state.currentMatchIndex;
    const isFinishedMatch = matchIndex >= state.matches.length;

    if (isFinishedMatch) {
        if (state.animationTimeout) clearTimeout(state.animationTimeout);
        return;
    }

    const match = state.matches[matchIndex];
    let scoreL = match.goles_local !== null ? match.goles_local : "-";
    let scoreV = match.goles_visitante !== null ? match.goles_visitante : "-";

    // Avanzar carrusel
    if (matchIndex > 0) {
        const prevCard = document.getElementById(`match-card-${matchIndex - 1}`);
        if (prevCard) {
            prevCard.className = 'match-card card-finished';
            setTimeout(() => { if (prevCard.parentNode) prevCard.parentNode.removeChild(prevCard); }, 1000);
        }
    }

    const cardCurrent = document.getElementById(`match-card-${matchIndex}`);
    if (cardCurrent) {
        cardCurrent.className = 'match-card card-current';
        cardCurrent.querySelector('.score-local').innerText = scoreL;
        cardCurrent.querySelector('.score-visit').innerText = scoreV;
    }

    const next1 = document.getElementById(`match-card-${matchIndex + 1}`);
    if (next1) next1.className = 'match-card card-upcoming-1';

    const next2 = document.getElementById(`match-card-${matchIndex + 2}`);
    if (next2) next2.className = 'match-card card-upcoming-2';

    // Inject new upcoming
    if (!document.getElementById(`match-card-${matchIndex + 3}`)) {
        const newCard = createMatchCard(matchIndex + 3);
        if (newCard) {
            newCard.className = 'match-card card-upcoming-2';
            newCard.style.opacity = '0';
            document.getElementById('match-carousel').appendChild(newCard);
            setTimeout(() => { newCard.style.opacity = ''; }, 50);
        }
    }

    const isPauseMatch = matchIndex > 0 && matchIndex % 15 === 0;

    const applyPointsAndRanks = () => {
        let pointsAdded = false;
        const matchPreds = state.predictions.filter(p => p.partido_id === match.id);

        matchPreds.forEach(pred => {
            if (pred.puntos_ganados && pred.puntos_ganados > 0) {
                const user = state.users.find(u => u.id === pred.usuario_id);
                if (user) {
                    user.points += pred.puntos_ganados;
                    pointsAdded = true;

                    const pointsEl = document.getElementById(`points-${user.id}`);
                    if (pointsEl) {
                        pointsEl.innerText = `${user.points} pts`;
                        pointsEl.style.color = '#4ade80';
                        pointsEl.style.transform = 'scale(1.2)';
                        setTimeout(() => {
                            pointsEl.style.color = '#eab308';
                            pointsEl.style.transform = 'scale(1)';
                        }, 300);
                    }
                }
            }
        });

        state.users.forEach(u => u.prevRank = u.rank);

        const isFinished = state.currentMatchIndex >= state.matches.length - 1;

        if (isFinished) {
            const container = document.getElementById('leaderboard-container');
            if (container) {
                container.style.height = `${340 + Math.max(0, state.users.length - 3) * state.barHeight}px`;
            }

            const carousel = document.getElementById('match-carousel');
            if (carousel) {
                carousel.style.opacity = '0';
                setTimeout(() => {
                    carousel.style.display = 'none';
                }, 500);
            }
        }

        if (pointsAdded || state.currentMatchIndex === 0 || isFinished) {
            state.users.sort((a, b) => {
                if (b.points !== a.points) {
                    return b.points - a.points;
                }
                return a.nombre_completo.localeCompare(b.nombre_completo);
            });

            const UP_ARROW = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`;
            const DOWN_ARROW = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;
            const DASH = `<span style="color: #6b7280; font-weight: bold;">-</span>`;

            state.users.forEach((user, index) => {
                user.rank = index;
                if (user.element) {
                    const trendEl = document.getElementById(`trend-${user.id}`);
                    if (trendEl) {
                        if (user.rank < user.prevRank) {
                            trendEl.innerHTML = UP_ARROW;
                        } else if (user.rank > user.prevRank) {
                            trendEl.innerHTML = DOWN_ARROW;
                        } else {
                            trendEl.innerHTML = DASH;
                        }
                    }

                    if (isFinished) {
                        user.element.classList.add('slow-transition');
                        if (index === 0) {
                            user.element.classList.add('podium-1');
                        } else if (index === 1) {
                            user.element.classList.add('podium-2');
                        } else if (index === 2) {
                            user.element.classList.add('podium-3');
                        } else {
                            const yOffset = 340 + ((index - 3) * state.barHeight);
                            user.element.style.transform = `translateY(${yOffset}px)`;
                            user.element.style.zIndex = state.users.length - index;
                        }
                    } else {
                        user.element.style.transform = `translateY(${index * state.barHeight}px)`;
                        user.element.style.zIndex = state.users.length - index;
                    }

                    const rankEl = document.getElementById(`rank-${user.id}`);
                    if (rankEl) {
                        rankEl.innerText = index + 1;
                    }
                }
            });
        }

        state.currentMatchIndex++;
        scheduleNextMatch();
    };

    if (isPauseMatch) {
        const top1 = state.users.find(u => u.rank === 0);
        const top2 = state.users.find(u => u.rank === 1);
        const top3 = state.users.find(u => u.rank === 2);

        if (top1 && top1.element) top1.element.classList.add('pause-highlight-1');
        if (top2 && top2.element) top2.element.classList.add('pause-highlight-2');
        if (top3 && top3.element) top3.element.classList.add('pause-highlight-3');

        setTimeout(() => {
            applyPointsAndRanks();
        }, 1000);

        setTimeout(() => {
            if (top1 && top1.element) top1.element.classList.remove('pause-highlight-1');
            if (top2 && top2.element) top2.element.classList.remove('pause-highlight-2');
            if (top3 && top3.element) top3.element.classList.remove('pause-highlight-3');
        }, 8000);
    } else {
        applyPointsAndRanks();
    }
}

window.togglePause = function () {
    state.isManualPaused = !state.isManualPaused;
    const btn = document.getElementById('btn-manual-pause');
    if (state.isManualPaused) {
        if (state.animationTimeout) clearTimeout(state.animationTimeout);
        if (btn) btn.innerHTML = '<i data-lucide="play"></i>';
    } else {
        scheduleNextMatch();
        if (btn) btn.innerHTML = '<i data-lucide="pause"></i>';
    }
    if (window.lucide) lucide.createIcons();
};
