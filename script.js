let weeks = {};
        let currentWeek = null;
        let currentWeekNum = null;

        // Team name mappings for ESPN API
        const teamMappings = {
            'SF': '49ers',
            'CHI': 'Bears',
            'CIN': 'Bengals',
            'BUF': 'Bills',
            'DEN': 'Broncos',
            'CLE': 'Browns',
            'TB': 'Buccaneers',
            'ARI': 'Cardinals',
            'LAC': 'Chargers',
            'KC': 'Chiefs',
            'IND': 'Colts',
            'WSH': 'Commanders',
            'DAL': 'Cowboys',
            'MIA': 'Dolphins',
            'PHI': 'Eagles',
            'ATL': 'Falcons',
            'NYG': 'Giants',
            'JAX': 'Jaguars',
            'NYJ': 'Jets',
            'DET': 'Lions',
            'GB': 'Packers',
            'CAR': 'Panthers',
            'NE': 'Patriots',
            'LV': 'Raiders',
            'LAR': 'Rams',
            'BAL': 'Ravens',
            'NO': 'Saints',
            'SEA': 'Seahawks',
            'PIT': 'Steelers',
            'HOU': 'Texans',
            'TEN': 'Titans',
            'MIN': 'Vikings'
        };

        // Function to get logo filename from team name
        function getLogoFilename(teamName) {
            return teamName.toLowerCase().replace(/\s+/g, '') + '.png';
        }

        // Initialize app
        window.addEventListener('load', async function () {
            loadSavedData();
            await fetchFullSchedule();
            await fetchCurrentLive();
        });

        // Check if game has started based on status and time
        function hasGameStarted(game) {
            const currentTime = new Date();
            const gameTime = new Date(game.rawDate || game.time);

            // Check if status indicates game has started
            const gameStartedStatuses = [
                'In Progress', 'Halftime', '1st Quarter', '2nd Quarter',
                '3rd Quarter', '4th Quarter', 'Overtime', 'Final',
                'Final/OT', 'Final/2OT'
            ];

            if (gameStartedStatuses.some(status =>
                game.status && game.status.toLowerCase().includes(status.toLowerCase())
            )) {
                return true;
            }

            // Also check if current time is past game time (with 15 minute buffer for pre-game)
            if (gameTime.getTime() < currentTime.getTime()) {
                return true;
            }

            return false;
        }

        async function fetchFullSchedule() {
            const loading = document.getElementById('loading');
            const errorDiv = document.getElementById('error');

            loading.style.display = 'block';
            errorDiv.style.display = 'none';

            try {
                for (let weekNum = 1; weekNum <= 18; weekNum++) {
                    await fetchWeek(weekNum);
                }

                saveWeeksData();
                renderWeekTabs();

                if (Object.keys(weeks).length > 0 && !currentWeek) {
                    const firstWeekKey = Object.keys(weeks).sort((a, b) => parseInt(weeks[a].number) - parseInt(weeks[b].number))[0];
                    switchToWeek(firstWeekKey);
                }

            } catch (error) {
                console.error('Error fetching schedule:', error);
                errorDiv.textContent = `Error loading NFL schedule: ${error.message}`;
                errorDiv.style.display = 'block';
            } finally {
                loading.style.display = 'none';
            }
        }

        async function fetchWeek(weekNum) {
            const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${weekNum}`);
            if (!response.ok) {
                console.warn(`Week ${weekNum} not available`);
                return;
            }
            const data = await response.json();
            const weekKey = `week${weekNum}`;
            weeks[weekKey] = {
                number: weekNum.toString(),
                name: `Week ${weekNum}`,
                games: []
            };
            if (data.events && data.events.length > 0) {
                weeks[weekKey].games = data.events.map(event => {
                    const competition = event.competitions[0];
                    const homeTeam = competition.competitors.find(t => t.homeAway === 'home');
                    const awayTeam = competition.competitors.find(t => t.homeAway === 'away');
                    const homeTeamName = teamMappings[homeTeam.team.abbreviation] || homeTeam.team.displayName;
                    const awayTeamName = teamMappings[awayTeam.team.abbreviation] || awayTeam.team.displayName;
                    const gameDate = new Date(event.date);
                    const dayName = gameDate.toLocaleDateString('en-US', { weekday: 'long' });
                    const gameTime = gameDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin', timeZoneName: 'short' });
                    let status = competition.status.type.description;
                    let winner = null;
                    let finalScore = null;
                    let completed = competition.status.type.completed;
                    if (completed) {
                        const homeScore = parseInt(homeTeam.score);
                        const awayScore = parseInt(awayTeam.score);
                        winner = homeScore > awayScore ? homeTeamName : (awayScore > homeScore ? awayTeamName : null);
                        finalScore = `${awayTeamName} ${awayScore} - ${homeScore} ${homeTeamName}`;
                    }
                    return {
                        id: `${awayTeamName.toLowerCase().replace(/\s+/g, '')}-${homeTeamName.toLowerCase().replace(/\s+/g, '')}`,
                        away: awayTeamName,
                        home: homeTeamName,
                        day: dayName,
                        time: gameTime,
                        rawDate: event.date,
                        status,
                        winner,
                        finalScore,
                        completed
                    };
                });
            }
        }

        async function fetchCurrentLive() {
            const refreshBtn = document.getElementById('refreshBtn');
            const loading = document.getElementById('loading');
            const errorDiv = document.getElementById('error');

            refreshBtn.disabled = true;
            refreshBtn.textContent = 'Loading...';
            loading.style.display = 'block';
            errorDiv.style.display = 'none';

            try {
                const response = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard');

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();

                if (!data.events || data.events.length === 0) {
                    throw new Error('No games found');
                }

                currentWeekNum = data.week.number;
                currentWeek = `week${currentWeekNum}`;

                await updateWeekLive(currentWeekNum);
                switchToWeek(currentWeek);

            } catch (error) {
                console.error('Error fetching live data:', error);
                errorDiv.textContent = `Error loading live data: ${error.message}`;
                errorDiv.style.display = 'block';

                // Fall back to saved data
                if (Object.keys(weeks).length > 0) {
                    renderWeekTabs();
                    const firstWeek = Object.keys(weeks)[0];
                    switchToWeek(firstWeek);
                } else {
                    showNoWeeks();
                }
            } finally {
                refreshBtn.disabled = false;
                refreshBtn.textContent = 'Refresh Data';
                loading.style.display = 'none';
            }
        }

        async function updateWeekLive(weekNum) {
            try {
                const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${weekNum}`);

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();

                const liveEvents = data.events || [];
                const weekKey = `week${weekNum}`;

                if (!weeks[weekKey]) return;

                liveEvents.forEach(liveEvent => {
                    const liveComp = liveEvent.competitions[0];
                    const home = liveComp.competitors.find(c => c.homeAway === 'home');
                    const away = liveComp.competitors.find(c => c.homeAway === 'away');

                    const homeName = teamMappings[home.team.abbreviation] || home.team.displayName;
                    const awayName = teamMappings[away.team.abbreviation] || away.team.displayName;

                    const gameId = `${awayName.toLowerCase().replace(/\s+/g, '')}-${homeName.toLowerCase().replace(/\s+/g, '')}`;

                    const game = weeks[weekKey].games.find(g => g.id === gameId);

                    if (game) {
                        game.status = liveComp.status.type.description;
                        game.completed = liveComp.status.type.completed;

                        if (game.completed) {
                            const homeScore = parseInt(home.score);
                            const awayScore = parseInt(away.score);

                            game.winner = homeScore > awayScore ? homeName : (awayScore > homeScore ? awayName : null);
                            game.finalScore = `${awayName} ${awayScore} - ${homeScore} ${homeName}`;
                        }
                    }
                });

                saveWeeksData();

                if (currentWeek === weekKey) {
                    renderWeekContent();
                }

            } catch (error) {
                console.error(`Error updating week ${weekNum}:`, error);
            }
        }

        function renderWeekTabs() {
            const select = document.getElementById('weekSelect');
            select.innerHTML = '';

            Object.keys(weeks).sort((a, b) => {
                return parseInt(weeks[a].number) - parseInt(weeks[b].number);
            }).forEach(weekKey => {
                const option = document.createElement('option');
                option.value = weekKey;
                option.textContent = weeks[weekKey].name;
                select.appendChild(option);
            });

            select.value = currentWeek || Object.keys(weeks)[0];
            select.onchange = () => switchToWeek(select.value);
        }

        async function switchToWeek(weekKey) {
            currentWeek = weekKey;

            const weekNum = parseInt(weeks[weekKey].number);
            if (currentWeekNum && weekNum === currentWeekNum) {
                await updateWeekLive(weekNum);
            }

            renderWeekContent();
            document.getElementById('noWeeks').style.display = 'none';
        }

        function renderWeekContent() {
            if (!currentWeek || !weeks[currentWeek]) {
                showNoWeeks();
                return;
            }

            const week = weeks[currentWeek];
            const contentDiv = document.getElementById('weekContent');

            const gamesByDay = {};
            week.games.forEach(game => {
                if (!gamesByDay[game.day]) {
                    gamesByDay[game.day] = [];
                }
                gamesByDay[game.day].push(game);
            });

            const sortedDays = Object.keys(gamesByDay).map(day => ({
                day,
                minDate: Math.min(...gamesByDay[day].map(g => new Date(g.rawDate).getTime()))
            })).sort((a, b) => a.minDate - b.minDate).map(d => d.day);

            let html = `
                <div class="stats-bar">
                    <div class="stat">
                        <div class="stat-number" id="totalGames">${week.games.length}</div>
                        <div class="stat-label">Total Games</div>
                    </div>
                    <div class="stat">
                        <div class="stat-number" id="completedGames">0</div>
                        <div class="stat-label">Completed</div>
                    </div>
                    <div class="stat">
                        <div class="stat-number" id="correctPreds">0</div>
                        <div class="stat-label">Correct</div>
                    </div>
                    <div class="stat">
                        <div class="stat-number" id="accuracy">0%</div>
                        <div class="stat-label">Accuracy</div>
                    </div>
                </div>
            `;

            sortedDays.forEach(day => {
                html += `
                    <div class="day-section">
                        <div class="day-header">${day}</div>
                `;

                let games = gamesByDay[day].sort((a, b) => new Date(a.rawDate).getTime() - new Date(b.rawDate).getTime());

                games.forEach(game => {
                    const gameStarted = hasGameStarted(game);
                    const isLive = game.status && (
                        game.status.includes('Quarter') ||
                        game.status.includes('Halftime') ||
                        game.status.includes('Overtime') ||
                        game.status.includes('In Progress')
                    );

                    let resultDisplay;
                    if (game.completed && game.winner) {
                        resultDisplay = `
                            <div class="result-display winner">
                                <div>
                                    <div><strong>${game.winner}</strong></div>
                                    <div class="final-score">${game.finalScore}</div>
                                </div>
                            </div>
                        `;
                    } else {
                        resultDisplay = `
                            <div class="result-display">
                                ${game.status || 'Scheduled'}
                            </div>
                        `;
                    }

                    // Determine prediction area based on game status
                    let predictionArea;
                    if (gameStarted) {
                        // Game has started - show locked prediction
                        predictionArea = `
                            <div class="prediction-area">
                                <div class="prediction-logos">
                                    <img src="img/${getLogoFilename(game.away)}" 
                                         alt="${game.away}" 
                                         class="logo-prediction locked" 
                                         data-team="${game.away}" 
                                         data-game="${game.id}">
                                    <img src="img/${getLogoFilename(game.home)}" 
                                         alt="${game.home}" 
                                         class="logo-prediction locked" 
                                         data-team="${game.home}" 
                                         data-game="${game.id}">
                                </div>
                                <div class="prediction-text locked" data-game="${game.id}">Locked</div>
                            </div>
                        `;
                    } else {
                        // Game hasn't started - show selectable logos
                        predictionArea = `
                            <div class="prediction-area">
                                <div class="prediction-logos">
                                    <img src="img/${getLogoFilename(game.away)}" 
                                         alt="${game.away}" 
                                         class="logo-prediction" 
                                         data-team="${game.away}" 
                                         data-game="${game.id}">
                                    <img src="img/${getLogoFilename(game.home)}" 
                                         alt="${game.home}" 
                                         class="logo-prediction" 
                                         data-team="${game.home}" 
                                         data-game="${game.id}">
                                </div>
                                <div class="prediction-text" data-game="${game.id}">Select winner</div>
                            </div>
                        `;
                    }

                    let statusClass = isLive ? 'live' : (gameStarted ? 'locked' : '');

                    html += `
                        <div class="game-card">
                            <div class="game-info">
                                <div class="game-matchup">
                                    <div class="team-container">
                                        <img src="img/${getLogoFilename(game.away)}" alt="${game.away}" class="team-logo">
                                        <span>${game.away}</span>
                                    </div>
                                    <span class="vs-text">@</span>
                                    <div class="team-container">
                                        <img src="img/${getLogoFilename(game.home)}" alt="${game.home}" class="team-logo">
                                        <span>${game.home}</span>
                                    </div>
                                </div>
                                <div class="game-time">${game.time}</div>
                                <div class="game-status ${statusClass}">${game.status}${isLive ? ' 🔴' : ''}</div>
                            </div>
                            ${predictionArea}
                            ${resultDisplay}
                            <div class="status ${gameStarted ? 'locked' : 'pending'}" data-game="${game.id}">
                                ${gameStarted ? '🔒' : '⏳'}
                            </div>
                        </div>
                    `;
                });

                html += `</div>`;
            });

            html += `<div id="final-grade"></div>`;

            contentDiv.innerHTML = html;
            contentDiv.style.display = 'block';

            loadWeekData();
            updateStats();
            addEventListeners();
        }

        function showNoWeeks() {
            document.getElementById('weekContent').style.display = 'none';
            document.getElementById('noWeeks').style.display = 'block';
        }

        function addEventListeners() {
            // Add click event listeners to all selectable logos
            document.querySelectorAll('.logo-prediction:not(.locked)').forEach(logo => {
                logo.addEventListener('click', function () {
                    const gameId = this.dataset.game;
                    const team = this.dataset.team;

                    // Update UI to show selection
                    document.querySelectorAll(`.logo-prediction[data-game="${gameId}"]`).forEach(img => {
                        img.classList.remove('selected');
                    });
                    this.classList.add('selected');

                    // Update prediction text
                    const predictionText = document.querySelector(`.prediction-text[data-game="${gameId}"]`);
                    predictionText.textContent = `Prediction: ${team}`;

                    // Save the prediction
                    saveData(gameId, team);
                    updateStats();
                });
            });
        }

        function saveData(gameId, prediction) {
            if (!currentWeek) return;

            const saved = JSON.parse(localStorage.getItem('nflPredictions') || '{}');
            if (!saved[currentWeek]) {
                saved[currentWeek] = {};
            }

            saved[currentWeek][gameId] = { prediction: prediction };
            localStorage.setItem('nflPredictions', JSON.stringify(saved));
        }

        function saveWeeksData() {
            localStorage.setItem('nflWeeksData', JSON.stringify(weeks));
        }

        function loadSavedData() {
            const savedWeeks = localStorage.getItem('nflWeeksData');
            if (savedWeeks) {
                weeks = JSON.parse(savedWeeks);
                renderWeekTabs();
                const firstWeek = Object.keys(weeks).sort((a, b) => parseInt(weeks[a].number) - parseInt(weeks[b].number))[0];
                if (firstWeek) {
                    currentWeek = firstWeek;
                    switchToWeek(firstWeek);
                }
            }
        }

        function renderFinalGrade(correct, completed) {
            const gradeDiv = document.getElementById('final-grade');
            if (!gradeDiv) return;

            if (completed === weeks[currentWeek]?.games.length) {
                const accuracy = completed > 0 ? (correct / completed) : 0;
                let grade, message;

                if (accuracy >= 0.9) { grade = "A+"; message = "Exceptional!"; }
                else if (accuracy >= 0.8) { grade = "A"; message = "Excellent!"; }
                else if (accuracy >= 0.7) { grade = "B"; message = "Great job!"; }
                else if (accuracy >= 0.6) { grade = "C"; message = "Not bad!"; }
                else if (accuracy >= 0.5) { grade = "D"; message = "Could be better."; }
                else { grade = "F"; message = "Back to the drawing board!"; }

                gradeDiv.innerHTML = `
            <div class="grade">
                <strong>Week Complete! Your Grade: ${grade}</strong>
                <div>${message} You correctly predicted ${correct} out of ${completed} games.</div>
            </div>
        `;
            } else {
                gradeDiv.innerHTML = '';
            }
        }

        function loadWeekData() {
            if (!currentWeek || !weeks[currentWeek]) return;

            const saved = JSON.parse(localStorage.getItem('nflPredictions') || '{}');
            const weekData = saved[currentWeek] || {};

            weeks[currentWeek].games.forEach(game => {
                const gameStarted = hasGameStarted(game);
                const savedPrediction = weekData[game.id]?.prediction;

                if (savedPrediction) {
                    // Update UI to show the saved prediction
                    const predictionLogo = document.querySelector(`.logo-prediction[data-game="${game.id}"][data-team="${savedPrediction}"]`);
                    if (predictionLogo) {
                        predictionLogo.classList.add('selected');
                    }

                    const predictionText = document.querySelector(`.prediction-text[data-game="${game.id}"]`);
                    if (predictionText) {
                        if (gameStarted) {
                            predictionText.textContent = `Prediction: ${savedPrediction}`;
                        } else {
                            predictionText.textContent = `Prediction: ${savedPrediction}`;
                        }
                    }
                }
            });
        }

        function updateStats() {
            if (!currentWeek || !weeks[currentWeek]) return;

            let completed = 0;
            let correct = 0;

            weeks[currentWeek].games.forEach(game => {
                const gameStarted = hasGameStarted(game);
                const saved = JSON.parse(localStorage.getItem('nflPredictions') || '{}');

                if (game.completed) {
                    completed++;
                    const weekData = saved[currentWeek] || {};
                    const prediction = weekData[game.id]?.prediction;

                    if (prediction && game.winner && prediction === game.winner) {
                        correct++;
                    }
                }

                // Update status icons
                const statusDiv = document.querySelector(`.status[data-game="${game.id}"]`);
                if (statusDiv) {
                    if (game.completed) {
                        const weekData = saved[currentWeek] || {};
                        const prediction = weekData[game.id]?.prediction;

                        if (prediction && game.winner) {
                            if (prediction === game.winner) {
                                statusDiv.className = 'status correct';
                                statusDiv.textContent = '✅';
                            } else {
                                statusDiv.className = 'status incorrect';
                                statusDiv.textContent = '❌';
                            }
                        } else {
                            statusDiv.className = 'status incorrect';
                            statusDiv.textContent = '❌';
                        }
                    } else if (gameStarted) {
                        statusDiv.className = 'status locked';
                        statusDiv.textContent = '🔒';
                    } else {
                        statusDiv.className = 'status pending';
                        statusDiv.textContent = '⏳';
                    }
                }
            });

            const accuracy = completed > 0 ? Math.round((correct / completed) * 100) : 0;
            document.getElementById('totalGames').textContent = weeks[currentWeek].games.length;
            document.getElementById('completedGames').textContent = completed;
            document.getElementById('correctPreds').textContent = correct;
            document.getElementById('accuracy').textContent = `${accuracy}%`;
            renderFinalGrade(correct, completed);
        }