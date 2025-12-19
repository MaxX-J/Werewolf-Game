const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const gameManager = require('./game/GameManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname, 'public')));

// Route principale
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.io - Gestion des connexions
io.on('connection', (socket) => {
    console.log(`🔌 Joueur connecté: ${socket.id}`);

    // Créer une partie
    socket.on('createGame', (playerName) => {
        const game = gameManager.createGame(socket.id, playerName);
        socket.join(game.code);
        socket.emit('gameCreated', {
            gameCode: game.code,
            player: { id: socket.id, name: playerName, isHost: true }
        });
        console.log(`🎮 Partie créée: ${game.code} par ${playerName}`);
    });

    // Rejoindre une partie
    socket.on('joinGame', ({ gameCode, playerName }) => {
        const result = gameManager.joinGame(gameCode, socket.id, playerName);

        if (!result.success) {
            socket.emit('error', result.error);
            return;
        }

        socket.join(gameCode.toUpperCase());

        // Notifier le joueur
        socket.emit('gameJoined', {
            gameCode: gameCode.toUpperCase(),
            player: { id: socket.id, name: playerName, isHost: false }
        });

        // Notifier tous les autres joueurs
        const publicState = gameManager.getPublicGameState(result.game);
        io.to(gameCode.toUpperCase()).emit('playerJoined', publicState);

        console.log(`👤 ${playerName} a rejoint la partie ${gameCode}`);
    });

    // Quitter la partie
    socket.on('leaveGame', () => {
        handlePlayerLeave(socket);
    });

    // Lancer la partie
    socket.on('startGame', (gameCode) => {
        const result = gameManager.startGame(gameCode, socket.id);

        if (!result.success) {
            socket.emit('error', result.error);
            return;
        }

        // Envoyer à chaque joueur son rôle
        for (const [socketId, player] of result.game.players) {
            const playerSocket = io.sockets.sockets.get(socketId);
            if (playerSocket) {
                playerSocket.emit('gameStarted', {
                    role: player.role,
                    gameState: gameManager.getPublicGameState(result.game, socketId)
                });
            }
        }

        // Notifier du début de la nuit
        io.to(gameCode).emit('nightStart', {
            round: result.game.round,
            phase: 'wolves'
        });

        // Notifier les loups qu'ils doivent voter
        const wolves = gameManager.getWolves(result.game);
        wolves.forEach(wolf => {
            const wolfSocket = io.sockets.sockets.get(wolf.socketId);
            if (wolfSocket) {
                const targets = getAliveVillagers(result.game);
                wolfSocket.emit('wolfTurn', {
                    wolves: wolves.map(w => ({ id: w.socketId, name: w.player.name })),
                    targets
                });
            }
        });

        console.log(`🌙 Partie ${gameCode} lancée - Nuit 1`);
    });

    // Vote des loups
    socket.on('wolfVote', ({ gameCode, targetId }) => {
        const result = gameManager.wolfVote(gameCode, socket.id, targetId);

        if (!result.success) return;

        // Notifier les autres loups du vote
        const game = gameManager.getGame(gameCode);
        const wolves = gameManager.getWolves(game);
        wolves.forEach(wolf => {
            const wolfSocket = io.sockets.sockets.get(wolf.socketId);
            if (wolfSocket) {
                wolfSocket.emit('wolfVoteUpdate', {
                    voterId: socket.id,
                    votes: result.votes,
                    total: result.total
                });
            }
        });

        if (result.phaseComplete) {
            handlePhaseChange(gameCode, result.game);
        }
    });

    // Action de la voyante
    socket.on('seerAction', ({ gameCode, targetId }) => {
        const result = gameManager.seerAction(gameCode, socket.id, targetId);

        if (!result.success) return;

        socket.emit('seerResult', {
            targetId,
            role: result.targetRole
        });

        handlePhaseChange(gameCode, result.game);
    });

    // Action de la sorcière
    socket.on('witchAction', ({ gameCode, action }) => {
        const result = gameManager.witchAction(gameCode, socket.id, action);
        if (result.success) {
            handleNightEnd(gameCode, result.game);
        }
    });

    socket.on('witchSkip', (gameCode) => {
        const result = gameManager.witchSkip(gameCode, socket.id);
        if (result.success) {
            handleNightEnd(gameCode, result.game);
        }
    });

    // Lancer le vote du jour
    socket.on('startVote', (gameCode) => {
        const result = gameManager.startVotePhase(gameCode);
        if (result.success) {
            io.to(gameCode).emit('voteStart', {
                targets: getAlivePlayers(result.game)
            });
        }
    });

    // Vote du jour
    socket.on('dayVote', ({ gameCode, targetId }) => {
        const result = gameManager.dayVote(gameCode, socket.id, targetId);

        if (!result.success) return;

        io.to(gameCode).emit('voteUpdate', {
            votes: result.votes,
            total: result.total
        });

        if (result.phaseComplete) {
            handleDayVoteResult(gameCode, result);
        }
    });

    // Action du chasseur
    socket.on('hunterShoot', ({ gameCode, targetId }) => {
        const result = gameManager.hunterShoot(gameCode, socket.id, targetId);

        if (!result.success) return;

        io.to(gameCode).emit('hunterShot', {
            hunterId: socket.id,
            victim: {
                id: result.victim.socketId,
                name: result.victim.player.name,
                role: result.victim.player.role
            }
        });

        if (result.winner) {
            io.to(gameCode).emit('gameEnd', {
                winner: result.winner,
                players: getAllPlayersWithRoles(result.game)
            });
        } else {
            // Continuer le jeu
            const publicState = gameManager.getPublicGameState(result.game);
            if (result.game.state === 'night') {
                startNightPhase(gameCode, result.game);
            } else {
                io.to(gameCode).emit('dayStart', { gameState: publicState });
            }
        }
    });

    // Message de chat
    socket.on('chatMessage', ({ gameCode, message }) => {
        const gameData = gameManager.getGameByPlayer(socket.id);
        if (!gameData) return;

        const player = gameData.game.players.get(socket.id);
        if (!player) return;

        // Ne pas permettre aux morts de parler
        if (!player.alive) return;

        // Chat normal pendant le jour
        if (gameData.game.state === 'day') {
            io.to(gameCode).emit('chatMessage', {
                senderId: socket.id,
                senderName: player.name,
                message,
                timestamp: Date.now()
            });
        }
    });

    // Déconnexion
    socket.on('disconnect', () => {
        handlePlayerLeave(socket);
        console.log(`🔌 Joueur déconnecté: ${socket.id}`);
    });

    // Fonctions helper
    function handlePlayerLeave(socket) {
        const result = gameManager.leaveGame(socket.id);
        if (result && result.game) {
            socket.leave(result.gameCode);
            io.to(result.gameCode).emit('playerLeft', {
                playerId: socket.id,
                gameState: gameManager.getPublicGameState(result.game)
            });
        }
    }

    function handlePhaseChange(gameCode, game) {
        if (game.phase === 'seer') {
            const seer = gameManager.findAlivePlayerByRole(game, 'voyante');
            if (seer) {
                const seerSocket = io.sockets.sockets.get(seer.socketId);
                if (seerSocket) {
                    seerSocket.emit('seerTurn', {
                        targets: getAlivePlayers(game).filter(p => p.id !== seer.socketId)
                    });
                }
            }
        } else if (game.phase === 'witch') {
            const witch = gameManager.findAlivePlayerByRole(game, 'sorciere');
            if (witch) {
                const witchSocket = io.sockets.sockets.get(witch.socketId);
                if (witchSocket) {
                    const victim = game.nightVictim ? game.players.get(game.nightVictim) : null;
                    witchSocket.emit('witchTurn', {
                        victim: victim ? { id: game.nightVictim, name: victim.name } : null,
                        potions: witch.player.potions,
                        targets: getAlivePlayers(game).filter(p => p.id !== witch.socketId)
                    });
                }
            }
        }
    }

    function handleNightEnd(gameCode, game) {
        const result = gameManager.endNight ?
            { deaths: [], winner: game.winner } :
            (() => {
                // La logique de fin de nuit est déjà dans witchAction/witchSkip
                const deaths = [];
                // Récupérer les morts de cette nuit depuis le game state
                return { deaths, winner: game.winner };
            })();

        // Le jour commence
        io.to(gameCode).emit('nightEnd', {
            deaths: Array.from(game.deadPlayers).slice(-2).map(id => {
                const p = game.players.get(id);
                return p ? { id, name: p.name, role: p.role } : null;
            }).filter(Boolean)
        });

        if (game.winner) {
            io.to(gameCode).emit('gameEnd', {
                winner: game.winner,
                players: getAllPlayersWithRoles(game)
            });
        } else if (game.phase === 'hunter') {
            const hunterSocket = io.sockets.sockets.get(game.hunterSocketId);
            if (hunterSocket) {
                hunterSocket.emit('hunterTurn', {
                    targets: getAlivePlayers(game)
                });
            }
        } else {
            io.to(gameCode).emit('dayStart', {
                round: game.round,
                gameState: gameManager.getPublicGameState(game)
            });
        }
    }

    function handleDayVoteResult(gameCode, result) {
        if (result.eliminated) {
            io.to(gameCode).emit('playerEliminated', {
                player: {
                    id: result.eliminated.socketId,
                    name: result.eliminated.player.name,
                    role: result.eliminated.player.role
                },
                tie: false
            });
        } else if (result.tie) {
            io.to(gameCode).emit('voteTie');
        }

        if (result.winner) {
            io.to(gameCode).emit('gameEnd', {
                winner: result.winner,
                players: getAllPlayersWithRoles(result.game)
            });
        } else if (result.hunterAction) {
            const hunterSocket = io.sockets.sockets.get(result.game.hunterSocketId);
            if (hunterSocket) {
                hunterSocket.emit('hunterTurn', {
                    targets: getAlivePlayers(result.game)
                });
            }
        } else {
            // Nouvelle nuit
            startNightPhase(gameCode, result.game);
        }
    }

    function startNightPhase(gameCode, game) {
        io.to(gameCode).emit('nightStart', {
            round: game.round,
            phase: 'wolves'
        });

        const wolves = gameManager.getWolves(game);
        wolves.forEach(wolf => {
            const wolfSocket = io.sockets.sockets.get(wolf.socketId);
            if (wolfSocket) {
                wolfSocket.emit('wolfTurn', {
                    wolves: wolves.map(w => ({ id: w.socketId, name: w.player.name })),
                    targets: getAliveVillagers(game)
                });
            }
        });
    }

    function getAlivePlayers(game) {
        const players = [];
        for (const [socketId, player] of game.players) {
            if (player.alive) {
                players.push({ id: socketId, name: player.name });
            }
        }
        return players;
    }

    function getAliveVillagers(game) {
        const players = [];
        for (const [socketId, player] of game.players) {
            if (player.alive && player.role.team !== 'loups') {
                players.push({ id: socketId, name: player.name });
            }
        }
        return players;
    }

    function getAllPlayersWithRoles(game) {
        const players = [];
        for (const [socketId, player] of game.players) {
            players.push({
                id: socketId,
                name: player.name,
                role: player.role,
                alive: player.alive
            });
        }
        return players;
    }
});

server.listen(PORT, () => {
    console.log(`
🐺 ═══════════════════════════════════════════════════════════ 🐺
   
   LOUP-GAROU - Serveur lancé !
   
   🌐 Local:  http://localhost:${PORT}
   
   Pour héberger en ligne, lancez ngrok:
   npx ngrok http ${PORT}
   
🐺 ═══════════════════════════════════════════════════════════ 🐺
  `);
});
