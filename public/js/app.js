// ============================================
// LOUP-GAROU - Application Client
// ============================================

class LoupGarouApp {
    constructor() {
        this.socket = io();
        this.currentScreen = 'home';
        this.player = null;
        this.gameCode = null;
        this.gameState = null;
        this.myRole = null;
        this.selectedTarget = null;

        this.init();
    }

    init() {
        this.bindEvents();
        this.bindSocketEvents();
    }

    // ============================================
    // DOM BINDINGS
    // ============================================

    bindEvents() {
        // Home screen
        document.getElementById('createGameBtn').addEventListener('click', () => this.createGame());
        document.getElementById('joinGameBtn').addEventListener('click', () => this.joinGame());
        document.getElementById('playerName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.createGame();
        });
        document.getElementById('gameCode').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinGame();
        });

        // Lobby screen
        document.getElementById('copyCodeBtn').addEventListener('click', () => this.copyGameCode());
        document.getElementById('leaveGameBtn').addEventListener('click', () => this.leaveGame());
        document.getElementById('startGameBtn').addEventListener('click', () => this.startGame());

        // Game screen
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChat();
        });
        document.getElementById('sendChatBtn').addEventListener('click', () => this.sendChat());

        // End screen
        document.getElementById('newGameBtn').addEventListener('click', () => this.restartGame());
    }

    // ============================================
    // SOCKET EVENTS
    // ============================================

    bindSocketEvents() {
        // Connexion
        this.socket.on('connect', () => {
            console.log('🔌 Connecté au serveur');
        });

        this.socket.on('disconnect', () => {
            this.showNotification('Déconnecté du serveur', 'error');
        });

        this.socket.on('error', (message) => {
            this.showNotification(message, 'error');
        });

        // Lobby
        this.socket.on('gameCreated', (data) => {
            this.gameCode = data.gameCode;
            this.player = data.player;
            this.showScreen('lobby');
            this.updateLobby({ players: [data.player] });
            document.getElementById('displayGameCode').textContent = data.gameCode;
            this.showNotification('Partie créée ! Partagez le code', 'success');
        });

        this.socket.on('gameJoined', (data) => {
            this.gameCode = data.gameCode;
            this.player = data.player;
            document.getElementById('displayGameCode').textContent = data.gameCode;
            this.showScreen('lobby');
        });

        this.socket.on('playerJoined', (gameState) => {
            this.updateLobby(gameState);
            this.showNotification('Un joueur a rejoint !', 'info');
        });

        this.socket.on('playerLeft', (data) => {
            this.updateLobby(data.gameState);
        });

        // Game start
        this.socket.on('gameStarted', (data) => {
            this.myRole = data.role;
            this.gameState = data.gameState;
            this.showScreen('game');
            this.updateGameUI();
            this.showRoleReveal();
        });

        // Night phases
        this.socket.on('nightStart', (data) => {
            document.body.classList.remove('day-mode');
            this.updatePhaseDisplay('🌙 Nuit', data.round);
            this.showWaitingMessage();
            this.disableChat();
            this.addSystemMessage(`La nuit ${data.round} tombe sur le village...`);
        });

        this.socket.on('wolfTurn', (data) => {
            this.showWolfVoteUI(data);
        });

        this.socket.on('wolfVoteUpdate', (data) => {
            this.showNotification(`Vote enregistré (${data.votes}/${data.total})`, 'info');
        });

        this.socket.on('seerTurn', (data) => {
            this.showSeerUI(data);
        });

        this.socket.on('seerResult', (data) => {
            const isWolf = data.role.team === 'loups';
            this.showNotification(
                `${data.role.emoji} Ce joueur est ${data.role.name} (${isWolf ? '🐺 LOUP' : '👤 Village'})`,
                isWolf ? 'warning' : 'success'
            );
            this.showWaitingMessage();
        });

        this.socket.on('witchTurn', (data) => {
            this.showWitchUI(data);
        });

        // Day
        this.socket.on('nightEnd', (data) => {
            if (data.deaths && data.deaths.length > 0) {
                data.deaths.forEach(death => {
                    this.addSystemMessage(`☠️ ${death.name} (${death.role.emoji} ${death.role.name}) a été tué cette nuit !`);
                });
            } else {
                this.addSystemMessage('🌅 Personne n\'est mort cette nuit.');
            }
        });

        this.socket.on('dayStart', (data) => {
            document.body.classList.add('day-mode');
            this.gameState = data.gameState;
            this.updatePhaseDisplay('☀️ Jour', data.round);
            this.updatePlayersList();
            this.showDayUI();
            this.enableChat();
            this.addSystemMessage('Le village se réveille. Discutez et votez pour éliminer un suspect !');
        });

        this.socket.on('voteStart', (data) => {
            this.showVoteUI(data.targets);
        });

        this.socket.on('voteUpdate', (data) => {
            const actionDesc = document.getElementById('actionDescription');
            if (actionDesc) {
                actionDesc.textContent = `Votes: ${data.votes}/${data.total}`;
            }
        });

        this.socket.on('playerEliminated', (data) => {
            this.addSystemMessage(`⚰️ ${data.player.name} (${data.player.role.emoji} ${data.player.role.name}) a été éliminé par le village !`);
            this.updatePlayerDeath(data.player.id);
        });

        this.socket.on('voteTie', () => {
            this.addSystemMessage('🤷 Égalité des votes ! Personne n\'est éliminé.');
        });

        // Hunter
        this.socket.on('hunterTurn', (data) => {
            this.showHunterUI(data);
        });

        this.socket.on('hunterShot', (data) => {
            this.addSystemMessage(`🏹 Le chasseur tire ! ${data.victim.name} (${data.victim.role.emoji}) est abattu !`);
            this.updatePlayerDeath(data.victim.id);
        });

        // Game end
        this.socket.on('gameEnd', (data) => {
            this.showEndScreen(data);
        });

        // Chat
        this.socket.on('chatMessage', (data) => {
            this.addChatMessage(data.senderName, data.message);
        });
    }

    // ============================================
    // GAME ACTIONS
    // ============================================

    createGame() {
        const name = document.getElementById('playerName').value.trim();
        if (!name) {
            this.showNotification('Entrez votre nom', 'error');
            return;
        }
        this.socket.emit('createGame', name);
    }

    joinGame() {
        const name = document.getElementById('playerName').value.trim();
        const code = document.getElementById('gameCode').value.trim().toUpperCase();

        if (!name) {
            this.showNotification('Entrez votre nom', 'error');
            return;
        }
        if (!code || code.length !== 4) {
            this.showNotification('Entrez un code valide (4 caractères)', 'error');
            return;
        }

        this.socket.emit('joinGame', { gameCode: code, playerName: name });
    }

    copyGameCode() {
        navigator.clipboard.writeText(this.gameCode);
        this.showNotification('Code copié !', 'success');
    }

    leaveGame() {
        this.socket.emit('leaveGame');
        this.showScreen('home');
        this.resetState();
    }

    startGame() {
        this.socket.emit('startGame', this.gameCode);
    }

    sendChat() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();
        if (message) {
            this.socket.emit('chatMessage', { gameCode: this.gameCode, message });
            input.value = '';
        }
    }

    restartGame() {
        this.resetState();
        this.showScreen('home');
    }

    resetState() {
        this.player = null;
        this.gameCode = null;
        this.gameState = null;
        this.myRole = null;
        this.selectedTarget = null;
        document.body.classList.remove('day-mode');
    }

    // ============================================
    // UI UPDATES
    // ============================================

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(`${screenId}-screen`).classList.add('active');
        this.currentScreen = screenId;
    }

    updateLobby(gameState) {
        const grid = document.getElementById('playersGrid');
        const players = gameState.players;

        grid.innerHTML = players.map(p => `
      <div class="player-card ${p.isHost ? 'host' : ''}">
        <div class="player-avatar">${this.getInitials(p.name)}</div>
        <div class="player-name">${this.escapeHtml(p.name)}</div>
        <div class="player-status">${p.isHost ? '👑 Hôte' : 'En attente'}</div>
      </div>
    `).join('');

        document.getElementById('playerCount').textContent = players.length;

        // Enable start button if host and enough players
        const isHost = this.player && players.find(p => p.id === this.player.id && p.isHost);
        const startBtn = document.getElementById('startGameBtn');
        startBtn.disabled = !isHost || players.length < 5;
    }

    updateGameUI() {
        // Update role badge
        const badge = document.getElementById('roleBadge');
        badge.querySelector('.role-emoji').textContent = this.myRole.emoji;
        badge.querySelector('.role-name').textContent = this.myRole.name;

        this.updatePlayersList();
    }

    updatePlayersList() {
        const list = document.getElementById('gamePlayersList');
        if (!this.gameState) return;

        list.innerHTML = this.gameState.players.map(p => {
            const isMe = p.id === this.socket.id;
            const showRole = !p.alive || isMe || p.role;

            return `
        <div class="game-player-item ${!p.alive ? 'dead' : ''}">
          <div class="player-avatar">${p.alive ? this.getInitials(p.name) : '💀'}</div>
          <div class="player-info">
            <div class="player-name">${this.escapeHtml(p.name)} ${isMe ? '(vous)' : ''}</div>
            ${p.isWolf ? '<span class="wolf-indicator">🐺 Loup</span>' : ''}
            ${!p.alive && p.role ? `<span class="player-role-hint">${p.role.emoji} ${p.role.name}</span>` : ''}
          </div>
        </div>
      `;
        }).join('');
    }

    updatePlayerDeath(playerId) {
        if (this.gameState) {
            const player = this.gameState.players.find(p => p.id === playerId);
            if (player) player.alive = false;
            this.updatePlayersList();
        }
    }

    updatePhaseDisplay(phase, round) {
        document.getElementById('gamePhase').textContent = phase;
        document.getElementById('roundNumber').textContent = `Tour ${round}`;
    }

    showWaitingMessage() {
        document.getElementById('waitingMessage').style.display = 'block';
        document.getElementById('actionContent').style.display = 'none';
    }

    showActionPanel(title, description, targets, buttons) {
        document.getElementById('waitingMessage').style.display = 'none';
        document.getElementById('actionContent').style.display = 'block';

        document.getElementById('actionTitle').textContent = title;
        document.getElementById('actionDescription').textContent = description;

        const targetsContainer = document.getElementById('actionTargets');
        targetsContainer.innerHTML = targets.map(t => `
      <button class="target-btn" data-id="${t.id}">${this.escapeHtml(t.name)}</button>
    `).join('');

        // Bind target selection
        targetsContainer.querySelectorAll('.target-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                targetsContainer.querySelectorAll('.target-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.selectedTarget = btn.dataset.id;
            });
        });

        const buttonsContainer = document.getElementById('actionButtons');
        buttonsContainer.innerHTML = buttons.map(b => `
      <button class="btn ${b.class || 'btn-primary'}" id="${b.id}">${b.label}</button>
    `).join('');

        // Bind button actions
        buttons.forEach(b => {
            document.getElementById(b.id).addEventListener('click', b.action);
        });
    }

    showRoleReveal() {
        const role = this.myRole;
        this.showNotification(
            `Vous êtes ${role.emoji} ${role.name}`,
            role.team === 'loups' ? 'warning' : 'info'
        );

        // Add description
        setTimeout(() => {
            this.addSystemMessage(`📜 Votre rôle : ${role.emoji} ${role.name}`);
            this.addSystemMessage(role.description);
        }, 1000);
    }

    showWolfVoteUI(data) {
        const otherWolves = data.wolves.filter(w => w.id !== this.socket.id);
        let desc = 'Choisissez un villageois à dévorer.';
        if (otherWolves.length > 0) {
            desc += ` Autres loups : ${otherWolves.map(w => w.name).join(', ')}`;
        }

        this.showActionPanel(
            '🐺 Attaque des Loups',
            desc,
            data.targets,
            [{
                id: 'wolfVoteBtn',
                label: '🩸 Dévorer',
                action: () => {
                    if (this.selectedTarget) {
                        this.socket.emit('wolfVote', { gameCode: this.gameCode, targetId: this.selectedTarget });
                        this.showWaitingMessage();
                        this.selectedTarget = null;
                    } else {
                        this.showNotification('Choisissez une cible', 'error');
                    }
                }
            }]
        );
    }

    showSeerUI(data) {
        this.showActionPanel(
            '👁️ Vision de la Voyante',
            'Choisissez un joueur pour voir son rôle.',
            data.targets,
            [{
                id: 'seerActionBtn',
                label: '🔮 Voir le rôle',
                action: () => {
                    if (this.selectedTarget) {
                        this.socket.emit('seerAction', { gameCode: this.gameCode, targetId: this.selectedTarget });
                        this.selectedTarget = null;
                    } else {
                        this.showNotification('Choisissez un joueur', 'error');
                    }
                }
            }]
        );
    }

    showWitchUI(data) {
        let desc = '';
        if (data.victim) {
            desc = `${data.victim.name} a été attaqué cette nuit. `;
        } else {
            desc = 'Personne n\'a été attaqué cette nuit. ';
        }
        desc += `Potions restantes : 💚 Vie: ${data.potions.vie} | ☠️ Mort: ${data.potions.mort}`;

        const buttons = [];

        if (data.victim && data.potions.vie > 0) {
            buttons.push({
                id: 'witchSaveBtn',
                label: '💚 Sauver',
                class: 'btn-primary',
                action: () => {
                    this.socket.emit('witchAction', {
                        gameCode: this.gameCode,
                        action: { save: true, kill: false }
                    });
                    this.showWaitingMessage();
                }
            });
        }

        if (data.potions.mort > 0) {
            buttons.push({
                id: 'witchKillBtn',
                label: '☠️ Tuer',
                class: 'btn-danger',
                action: () => {
                    if (this.selectedTarget) {
                        this.socket.emit('witchAction', {
                            gameCode: this.gameCode,
                            action: { save: false, kill: true, killTarget: this.selectedTarget }
                        });
                        this.showWaitingMessage();
                        this.selectedTarget = null;
                    } else {
                        this.showNotification('Sélectionnez une cible à tuer', 'error');
                    }
                }
            });
        }

        buttons.push({
            id: 'witchSkipBtn',
            label: 'Ne rien faire',
            class: 'btn-secondary',
            action: () => {
                this.socket.emit('witchSkip', this.gameCode);
                this.showWaitingMessage();
            }
        });

        this.showActionPanel('🧙‍♀️ Pouvoir de la Sorcière', desc, data.targets, buttons);
    }

    showDayUI() {
        this.showActionPanel(
            '☀️ Discussion',
            'Discutez avec le village pour identifier les loups, puis votez.',
            [],
            [{
                id: 'startVoteBtn',
                label: '🗳️ Lancer le vote',
                action: () => {
                    this.socket.emit('startVote', this.gameCode);
                }
            }]
        );
    }

    showVoteUI(targets) {
        this.showActionPanel(
            '🗳️ Vote du Village',
            'Votez pour éliminer un suspect.',
            targets,
            [{
                id: 'dayVoteBtn',
                label: '⚖️ Voter',
                action: () => {
                    this.socket.emit('dayVote', { gameCode: this.gameCode, targetId: this.selectedTarget });
                    this.showWaitingMessage();
                    this.selectedTarget = null;
                }
            }, {
                id: 'skipVoteBtn',
                label: 'Ne pas voter',
                class: 'btn-secondary',
                action: () => {
                    this.socket.emit('dayVote', { gameCode: this.gameCode, targetId: null });
                    this.showWaitingMessage();
                }
            }]
        );
    }

    showHunterUI(data) {
        this.showActionPanel(
            '🏹 Tir du Chasseur',
            'Vous êtes mort ! Choisissez quelqu\'un à emporter avec vous.',
            data.targets,
            [{
                id: 'hunterShootBtn',
                label: '🎯 Tirer',
                action: () => {
                    if (this.selectedTarget) {
                        this.socket.emit('hunterShoot', { gameCode: this.gameCode, targetId: this.selectedTarget });
                        this.showWaitingMessage();
                        this.selectedTarget = null;
                    } else {
                        this.showNotification('Choisissez une cible', 'error');
                    }
                }
            }]
        );
    }

    showEndScreen(data) {
        this.showScreen('end');

        const announcement = document.getElementById('winnerAnnouncement');
        const title = document.getElementById('winnerTitle');
        const subtitle = document.getElementById('winnerSubtitle');

        announcement.className = `winner-announcement ${data.winner}`;

        if (data.winner === 'loups') {
            title.textContent = '🐺 Victoire des Loups-Garous !';
            subtitle.textContent = 'Les loups ont dévoré le village...';
        } else {
            title.textContent = '🏘️ Victoire du Village !';
            subtitle.textContent = 'Tous les loups ont été éliminés !';
        }

        const grid = document.getElementById('rolesGrid');
        grid.innerHTML = data.players.map(p => `
      <div class="role-reveal-card ${!p.alive ? 'dead' : ''}">
        <span class="role-emoji">${p.role.emoji}</span>
        <div class="player-name">${this.escapeHtml(p.name)}</div>
        <div class="role-name">${p.role.name}</div>
      </div>
    `).join('');
    }

    // ============================================
    // CHAT
    // ============================================

    enableChat() {
        document.getElementById('chatInput').disabled = false;
        document.getElementById('sendChatBtn').disabled = false;
    }

    disableChat() {
        document.getElementById('chatInput').disabled = true;
        document.getElementById('sendChatBtn').disabled = true;
    }

    addChatMessage(sender, text) {
        const container = document.getElementById('chatMessages');
        const div = document.createElement('div');
        div.className = 'chat-message';
        div.innerHTML = `<span class="chat-sender">${this.escapeHtml(sender)}:</span><span class="chat-text">${this.escapeHtml(text)}</span>`;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    addSystemMessage(text) {
        const container = document.getElementById('chatMessages');
        const div = document.createElement('div');
        div.className = 'system-message';
        div.textContent = text;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    // ============================================
    // NOTIFICATIONS
    // ============================================

    showNotification(message, type = 'info') {
        const container = document.getElementById('notifications');
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        container.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 4000);
    }

    // ============================================
    // HELPERS
    // ============================================

    getInitials(name) {
        return name.slice(0, 2).toUpperCase();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Start app
const app = new LoupGarouApp();
