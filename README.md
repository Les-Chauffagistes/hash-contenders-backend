# ShareLogs WebSocket Server

Serveur Node.js qui lit des logs CKPool et diffuse les shares en temps réel via WebSocket.

---

## Prérequis

* Node.js ≥ 18
* npm

Vérification :

```bash
node -v
npm -v
```

---

## Installation

Dans le dossier du projet :

```bash
npm install
```

Si nécessaire :

```bash
npm install express ws dotenv
```

---

## Configuration

Créer un fichier `.env` à la racine :

```env
ROUNDS_DIR=/data/ckpool/logs
PORT=3003
HOST=127.0.0.1
WS_TOKEN=
TRUST_PROXY=1
```

---

## Variables

* `ROUNDS_DIR` : dossier des logs CKPool
* `PORT` : port du serveur (ex : 3003)
* `HOST` : interface d’écoute
* `WS_TOKEN` : token optionnel pour sécuriser le WS
* `TRUST_PROXY` : activer si reverse proxy (nginx, traefik)

---

## Lancement

```bash
node index.js
```

---

## WebSocket

Exemple de connexion :

```text
ws://localhost:3003/ws/shares?address=bc1q2clhlfps3a1phmftq3qp8fbxaw7ku7hkajpukqhaz1tzvrupy8
```

Paramètres possibles :

* `address` : adresse BTC à filtrer
* `worker` : nom du worker (optionnel)
* `minutes` : fenêtre de temps (optionnel)

---

## Endpoint HTTP

Healthcheck :

```text
GET /health
```

---

## Fonctionnement

* Lecture continue des fichiers dans `ROUNDS_DIR`
* Parsing des lignes de shares
* Ajout des métadonnées (round, fichier)
* Diffusion en temps réel aux clients WebSocket
* Protection contre abus (rate limit, ban, limites de connexions)

---

## Notes

* Vérifier que `ROUNDS_DIR` existe et contient des logs
* Vérifier les permissions d’accès
* Si aucune donnée n’est reçue, vérifier que les logs sont actifs
* Compatible avec reverse proxy (activer `TRUST_PROXY`)
