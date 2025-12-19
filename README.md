# 🐺 Loup-Garou - Jeu en ligne

Un jeu de Loup-Garou multijoueur en temps réel, jouable en local et partageable via ngrok.

## 🚀 Installation

### 1. Installer les dépendances Node.js

```bash
cd "c:\Users\maxen\Desktop\Projet\loup garoup"
npm install
```

### 2. Installer ngrok (pour partager en ligne)

**Option A - Via npm (recommandé):**
```bash
npm install -g ngrok
```

**Option B - Téléchargement direct:**
1. Aller sur https://ngrok.com/download
2. Télécharger la version Windows
3. Extraire le fichier
4. (Optionnel) Créer un compte gratuit sur ngrok.com et configurer votre token:
   ```bash
   ngrok config add-authtoken VOTRE_TOKEN
   ```

## 🎮 Lancer le jeu

### 1. Démarrer le serveur
```bash
npm start
```
Le serveur démarre sur http://localhost:3000

### 2. Exposer via ngrok
Dans un **nouveau terminal**:
```bash
ngrok http 3000
```

Vous obtiendrez une URL comme: `https://xxxx-xxxx.ngrok.io`

**Partagez cette URL avec vos amis !**

## 📋 Comment jouer

### Créer une partie
1. Entrez votre pseudo
2. Cliquez sur "Créer une partie"
3. Partagez le code à 4 lettres avec vos amis

### Rejoindre une partie
1. Entrez votre pseudo
2. Entrez le code de la partie
3. Cliquez sur "Rejoindre"

### Règles
- **5-12 joueurs** requis
- **Nuit**: Les loups votent pour dévorer quelqu'un, la voyante voit un rôle, la sorcière peut agir
- **Jour**: Discussion et vote pour éliminer un suspect
- **Victoire Village**: Tous les loups sont éliminés
- **Victoire Loups**: Les loups sont en égalité ou supériorité numérique

## 🎭 Rôles

| Rôle | Équipe | Pouvoir |
|------|--------|---------|
| 🐺 Loup-Garou | Loups | Vote pour tuer un villageois chaque nuit |
| 👁️ Voyante | Village | Voit le rôle d'un joueur chaque nuit |
| 🧙‍♀️ Sorcière | Village | 1 potion de vie + 1 potion de mort |
| 🏹 Chasseur | Village | Tire sur quelqu'un en mourant |
| 👤 Villageois | Village | Aucun pouvoir spécial |

## 📁 Structure du projet

```
loup garoup/
├── server.js           # Serveur Express + Socket.io
├── package.json
├── game/
│   ├── GameManager.js  # Logique de jeu
│   └── roles.js        # Définition des rôles
└── public/
    ├── index.html      # Page principale
    ├── css/style.css   # Styles
    └── js/app.js       # Client Socket.io
```

## 🐛 Problèmes courants

**"ngrok command not found"**
→ Installez ngrok globalement: `npm install -g ngrok`

**Le serveur ne démarre pas**
→ Vérifiez que le port 3000 n'est pas utilisé

**Les joueurs ne peuvent pas rejoindre**
→ Assurez-vous qu'ils utilisent l'URL ngrok (https://...) et non localhost
