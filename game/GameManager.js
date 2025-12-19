const { v4: uuidv4 } = require('uuid');
const { ROLES, getRoleDistribution, shuffle } = require('./roles');

class GameManager {
    constructor() {
        this.games = new Map();
    }

    createGame(hostSocketId, hostName) {
        const gameCode = this.generateGameCode();
        const game = {
            id: uuidv4(),
            code: gameCode,
            host: hostSocketId,
            players: new Map(),
            state: 'lobby', // lobby, night, day, ended
            phase: null, // wolves, seer, witch, vote, hunter
            round: 0,
            nightVictim: null,
            witchSaved: false,
            witchKilled: null,
            votes: new Map(),
            messages: [],
            deadPlayers: new Set()
        };

        // Ajouter l'hôte comme premier joueur
        game.players.set(hostSocketId, {
            id: hostSocketId,
            name: hostName,
            role: null,
            alive: true,
            ready: false,
            potions: null
        });

        this.games.set(gameCode, game);
        return game;
    }

    generateGameCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        // Vérifier l'unicité
        if (this.games.has(code)) {
            return this.generateGameCode();
        }
        return code;
    }

    joinGame(gameCode, socketId, playerName) {
        const game = this.games.get(gameCode.toUpperCase());
        if (!game) {
            return { success: false, error: 'Partie introuvable' };
        }
        if (game.state !== 'lobby') {
            return { success: false, error: 'La partie a déjà commencé' };
        }
        if (game.players.size >= 12) {
            return { success: false, error: 'La partie est pleine (12 joueurs max)' };
        }

        game.players.set(socketId, {
            id: socketId,
            name: playerName,
            role: null,
            alive: true,
            ready: false,
            potions: null
        });

        return { success: true, game };
    }

    leaveGame(socketId) {
        for (const [code, game] of this.games) {
            if (game.players.has(socketId)) {
                game.players.delete(socketId);

                // Si c'était l'hôte et qu'il reste des joueurs, transférer
                if (game.host === socketId && game.players.size > 0) {
                    game.host = game.players.keys().next().value;
                }

                // Supprimer la partie si vide
                if (game.players.size === 0) {
                    this.games.delete(code);
                }

                return { gameCode: code, game };
            }
        }
        return null;
    }

    getGame(gameCode) {
        return this.games.get(gameCode.toUpperCase());
    }

    getGameByPlayer(socketId) {
        for (const [code, game] of this.games) {
            if (game.players.has(socketId)) {
                return { code, game };
            }
        }
        return null;
    }

    startGame(gameCode, hostSocketId) {
        const game = this.games.get(gameCode);
        if (!game) return { success: false, error: 'Partie introuvable' };
        if (game.host !== hostSocketId) return { success: false, error: 'Seul l\'hôte peut lancer la partie' };
        if (game.players.size < 5) return { success: false, error: 'Il faut au moins 5 joueurs' };

        // Distribution des rôles
        const roles = getRoleDistribution(game.players.size);
        const shuffledRoles = shuffle(roles);

        let i = 0;
        for (const [socketId, player] of game.players) {
            player.role = shuffledRoles[i];
            // Initialiser les potions pour la sorcière
            if (player.role.id === 'sorciere') {
                player.potions = { vie: 1, mort: 1 };
            }
            i++;
        }

        game.state = 'night';
        game.phase = 'wolves';
        game.round = 1;

        return { success: true, game };
    }

    // Obtenir les loups-garous
    getWolves(game) {
        const wolves = [];
        for (const [socketId, player] of game.players) {
            if (player.role.id === 'loup_garou' && player.alive) {
                wolves.push({ socketId, player });
            }
        }
        return wolves;
    }

    // Vote des loups
    wolfVote(gameCode, wolfSocketId, targetSocketId) {
        const game = this.games.get(gameCode);
        if (!game || game.phase !== 'wolves') return { success: false };

        const wolf = game.players.get(wolfSocketId);
        if (!wolf || wolf.role.id !== 'loup_garou' || !wolf.alive) {
            return { success: false };
        }

        game.votes.set(wolfSocketId, targetSocketId);

        // Vérifier si tous les loups ont voté
        const wolves = this.getWolves(game);
        const allVoted = wolves.every(w => game.votes.has(w.socketId));

        if (allVoted) {
            // Compter les votes
            const voteCounts = new Map();
            for (const target of game.votes.values()) {
                voteCounts.set(target, (voteCounts.get(target) || 0) + 1);
            }

            // Trouver la victime (majorité)
            let maxVotes = 0;
            let victim = null;
            for (const [target, count] of voteCounts) {
                if (count > maxVotes) {
                    maxVotes = count;
                    victim = target;
                }
            }

            game.nightVictim = victim;
            game.votes.clear();

            // Passer à la voyante si elle existe et est vivante
            const seer = this.findAlivePlayerByRole(game, 'voyante');
            if (seer) {
                game.phase = 'seer';
            } else {
                // Passer à la sorcière
                const witch = this.findAlivePlayerByRole(game, 'sorciere');
                if (witch) {
                    game.phase = 'witch';
                } else {
                    this.endNight(game);
                }
            }

            return { success: true, phaseComplete: true, game };
        }

        return { success: true, phaseComplete: false, votes: game.votes.size, total: wolves.length };
    }

    // Action de la voyante
    seerAction(gameCode, seerSocketId, targetSocketId) {
        const game = this.games.get(gameCode);
        if (!game || game.phase !== 'seer') return { success: false };

        const seer = game.players.get(seerSocketId);
        if (!seer || seer.role.id !== 'voyante') return { success: false };

        const target = game.players.get(targetSocketId);
        if (!target) return { success: false };

        // Passer à la sorcière
        const witch = this.findAlivePlayerByRole(game, 'sorciere');
        if (witch) {
            game.phase = 'witch';
        } else {
            this.endNight(game);
        }

        return {
            success: true,
            targetRole: target.role,
            game
        };
    }

    // Action de la sorcière
    witchAction(gameCode, witchSocketId, action) {
        const game = this.games.get(gameCode);
        if (!game || game.phase !== 'witch') return { success: false };

        const witch = game.players.get(witchSocketId);
        if (!witch || witch.role.id !== 'sorciere') return { success: false };

        if (action.save && witch.potions.vie > 0 && game.nightVictim) {
            witch.potions.vie = 0;
            game.witchSaved = true;
        }

        if (action.kill && witch.potions.mort > 0 && action.killTarget) {
            witch.potions.mort = 0;
            game.witchKilled = action.killTarget;
        }

        this.endNight(game);
        return { success: true, game };
    }

    // Passer l'action de la sorcière
    witchSkip(gameCode, witchSocketId) {
        const game = this.games.get(gameCode);
        if (!game || game.phase !== 'witch') return { success: false };

        this.endNight(game);
        return { success: true, game };
    }

    findAlivePlayerByRole(game, roleId) {
        for (const [socketId, player] of game.players) {
            if (player.role.id === roleId && player.alive) {
                return { socketId, player };
            }
        }
        return null;
    }

    endNight(game) {
        const deaths = [];

        // Victime des loups (sauf si sauvée)
        if (game.nightVictim && !game.witchSaved) {
            const victim = game.players.get(game.nightVictim);
            if (victim) {
                victim.alive = false;
                game.deadPlayers.add(game.nightVictim);
                deaths.push({ socketId: game.nightVictim, player: victim, cause: 'loups' });
            }
        }

        // Victime de la sorcière
        if (game.witchKilled) {
            const victim = game.players.get(game.witchKilled);
            if (victim && victim.alive) {
                victim.alive = false;
                game.deadPlayers.add(game.witchKilled);
                deaths.push({ socketId: game.witchKilled, player: victim, cause: 'sorciere' });
            }
        }

        // Reset pour la nuit
        game.nightVictim = null;
        game.witchSaved = false;
        game.witchKilled = null;

        // Vérifier les conditions de victoire
        const winner = this.checkWinCondition(game);
        if (winner) {
            game.state = 'ended';
            game.winner = winner;
            return { deaths, winner };
        }

        // Vérifier si chasseur mort doit tirer
        const hunterDeath = deaths.find(d => d.player.role.id === 'chasseur');
        if (hunterDeath) {
            game.state = 'day';
            game.phase = 'hunter';
            game.hunterSocketId = hunterDeath.socketId;
            return { deaths, hunterAction: true };
        }

        // Passer au jour
        game.state = 'day';
        game.phase = 'discussion';

        return { deaths };
    }

    // Vote du jour
    dayVote(gameCode, voterSocketId, targetSocketId) {
        const game = this.games.get(gameCode);
        if (!game || game.state !== 'day' || game.phase !== 'vote') {
            return { success: false };
        }

        const voter = game.players.get(voterSocketId);
        if (!voter || !voter.alive) return { success: false };

        game.votes.set(voterSocketId, targetSocketId);

        // Compter les joueurs vivants
        let aliveCount = 0;
        for (const player of game.players.values()) {
            if (player.alive) aliveCount++;
        }

        // Vérifier si tout le monde a voté
        if (game.votes.size >= aliveCount) {
            return this.resolveDayVote(game);
        }

        return { success: true, phaseComplete: false, votes: game.votes.size, total: aliveCount };
    }

    resolveDayVote(game) {
        const voteCounts = new Map();
        for (const target of game.votes.values()) {
            if (target) { // null = vote blanc
                voteCounts.set(target, (voteCounts.get(target) || 0) + 1);
            }
        }

        let maxVotes = 0;
        let eliminated = null;
        let tie = false;

        for (const [target, count] of voteCounts) {
            if (count > maxVotes) {
                maxVotes = count;
                eliminated = target;
                tie = false;
            } else if (count === maxVotes) {
                tie = true;
            }
        }

        game.votes.clear();

        // En cas d'égalité, personne n'est éliminé
        if (tie || !eliminated) {
            // Passer à la nuit
            game.round++;
            game.state = 'night';
            game.phase = 'wolves';
            return { success: true, phaseComplete: true, eliminated: null, tie: true, game };
        }

        const victim = game.players.get(eliminated);
        victim.alive = false;
        game.deadPlayers.add(eliminated);

        // Vérifier victoire
        const winner = this.checkWinCondition(game);
        if (winner) {
            game.state = 'ended';
            game.winner = winner;
            return { success: true, phaseComplete: true, eliminated: { socketId: eliminated, player: victim }, winner, game };
        }

        // Chasseur éliminé ?
        if (victim.role.id === 'chasseur') {
            game.phase = 'hunter';
            game.hunterSocketId = eliminated;
            return { success: true, phaseComplete: true, eliminated: { socketId: eliminated, player: victim }, hunterAction: true, game };
        }

        // Passer à la nuit
        game.round++;
        game.state = 'night';
        game.phase = 'wolves';

        return { success: true, phaseComplete: true, eliminated: { socketId: eliminated, player: victim }, game };
    }

    // Action du chasseur
    hunterShoot(gameCode, hunterSocketId, targetSocketId) {
        const game = this.games.get(gameCode);
        if (!game || game.phase !== 'hunter') return { success: false };
        if (game.hunterSocketId !== hunterSocketId) return { success: false };

        const target = game.players.get(targetSocketId);
        if (!target || !target.alive) return { success: false };

        target.alive = false;
        game.deadPlayers.add(targetSocketId);

        // Vérifier victoire
        const winner = this.checkWinCondition(game);
        if (winner) {
            game.state = 'ended';
            game.winner = winner;
            return { success: true, victim: { socketId: targetSocketId, player: target }, winner, game };
        }

        // Passer à la nuit ou au jour selon l'état précédent
        if (game.state === 'night' || game.phase === 'hunter') {
            game.state = 'day';
            game.phase = 'discussion';
        } else {
            game.round++;
            game.state = 'night';
            game.phase = 'wolves';
        }

        return { success: true, victim: { socketId: targetSocketId, player: target }, game };
    }

    startVotePhase(gameCode) {
        const game = this.games.get(gameCode);
        if (!game) return { success: false };
        game.phase = 'vote';
        game.votes.clear();
        return { success: true, game };
    }

    checkWinCondition(game) {
        let wolves = 0;
        let villagers = 0;

        for (const player of game.players.values()) {
            if (player.alive) {
                if (player.role.team === 'loups') {
                    wolves++;
                } else {
                    villagers++;
                }
            }
        }

        if (wolves === 0) {
            return 'village';
        }
        if (wolves >= villagers) {
            return 'loups';
        }
        return null;
    }

    getPublicGameState(game, forSocketId = null) {
        const players = [];
        for (const [socketId, player] of game.players) {
            const publicPlayer = {
                id: socketId,
                name: player.name,
                alive: player.alive,
                isHost: socketId === game.host
            };

            // Montrer le rôle seulement au joueur lui-même ou si mort
            if (socketId === forSocketId || !player.alive) {
                publicPlayer.role = player.role;
            }

            // Montrer les loups entre eux
            if (forSocketId) {
                const requester = game.players.get(forSocketId);
                if (requester && requester.role && requester.role.id === 'loup_garou' && player.role.id === 'loup_garou') {
                    publicPlayer.role = player.role;
                    publicPlayer.isWolf = true;
                }
            }

            players.push(publicPlayer);
        }

        return {
            code: game.code,
            state: game.state,
            phase: game.phase,
            round: game.round,
            players,
            host: game.host
        };
    }
}

module.exports = new GameManager();
