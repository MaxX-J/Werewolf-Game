// Définition des rôles du jeu
const ROLES = {
  LOUP_GAROU: {
    id: 'loup_garou',
    name: 'Loup-Garou',
    emoji: '🐺',
    team: 'loups',
    description: 'Chaque nuit, votez avec les autres loups pour éliminer un villageois.',
    nightAction: true,
    priority: 1
  },
  VOYANTE: {
    id: 'voyante',
    name: 'Voyante',
    emoji: '👁️',
    team: 'village',
    description: 'Chaque nuit, découvrez le rôle d\'un joueur de votre choix.',
    nightAction: true,
    priority: 2
  },
  SORCIERE: {
    id: 'sorciere',
    name: 'Sorcière',
    emoji: '🧙‍♀️',
    team: 'village',
    description: 'Vous possédez une potion de vie et une potion de mort à utiliser une seule fois.',
    nightAction: true,
    priority: 3,
    potions: { vie: 1, mort: 1 }
  },
  CHASSEUR: {
    id: 'chasseur',
    name: 'Chasseur',
    emoji: '🏹',
    team: 'village',
    description: 'Si vous mourrez, vous emportez un joueur de votre choix avec vous.',
    nightAction: false,
    deathAction: true
  },
  VILLAGEOIS: {
    id: 'villageois',
    name: 'Villageois',
    emoji: '👤',
    team: 'village',
    description: 'Vous n\'avez pas de pouvoir spécial. Utilisez votre intuition pour démasquer les loups !',
    nightAction: false
  }
};

// Configuration des rôles selon le nombre de joueurs
function getRoleDistribution(playerCount) {
  if (playerCount < 5) {
    return null; // Pas assez de joueurs
  }
  
  const distribution = [];
  
  // Nombre de loups (environ 1/3 des joueurs, minimum 1)
  const wolfCount = Math.max(1, Math.floor(playerCount / 3));
  
  for (let i = 0; i < wolfCount; i++) {
    distribution.push(ROLES.LOUP_GAROU);
  }
  
  // Rôles spéciaux du village
  if (playerCount >= 5) distribution.push(ROLES.VOYANTE);
  if (playerCount >= 6) distribution.push(ROLES.SORCIERE);
  if (playerCount >= 8) distribution.push(ROLES.CHASSEUR);
  
  // Compléter avec des villageois
  while (distribution.length < playerCount) {
    distribution.push(ROLES.VILLAGEOIS);
  }
  
  return distribution;
}

// Mélanger un tableau (Fisher-Yates)
function shuffle(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

module.exports = { ROLES, getRoleDistribution, shuffle };
