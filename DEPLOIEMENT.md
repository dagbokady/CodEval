# Déploiement de CodEval sur un VPS

Architecture : un seul domaine, HTTPS automatique.

```
https://DOMAINE/        → frontend (Caddy, fichiers statiques)
https://DOMAINE/api/*   → API FastAPI
worker de correction    → réseau interne seulement, sans accès Internet
PostgreSQL 17           → réseau interne, aucun port exposé
```

## 1. Louer le serveur

OVHcloud, gamme **VPS**, le plus petit modèle (VPS-1 ou équivalent,
au moins 2 vCPU et 4 Go de RAM). À la commande :

- localisation : **France** (Gravelines, Roubaix ou Strasbourg) ;
- système : **Ubuntu 24.04** ;
- clé SSH : coller le contenu de `~/.ssh/id_ed25519.pub`
  (la créer avant avec `ssh-keygen -t ed25519` si besoin).

L'IP du VPS et l'utilisateur (`ubuntu`) arrivent par e-mail et dans l'espace
client OVH, rubrique Bare Metal Cloud > VPS.

## 2. Pointer le domaine

Chez le registraire du domaine, dans la zone DNS :

| Type | Nom | Valeur |
|------|-----|--------|
| A    | @   | IP du VPS |
| A    | www | IP du VPS |

Attendre que `ping DOMAINE` réponde avec l'IP du VPS avant l'étape 5.

## 3. Préparer le serveur

```bash
ssh ubuntu@IP_DU_VPS
sudo -i
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

## 4. Récupérer le code

```bash
git clone <URL_DU_DEPOT> /opt/codeval
cd /opt/codeval
cp deploy/.env.example deploy/.env
nano deploy/.env
```

Remplir chaque ligne. Pour `POSTGRES_PASSWORD` et `SECRET_KEY`, générer une
valeur avec `openssl rand -hex 32`.

## 5. Lancer

```bash
docker compose -f docker-compose.prod.yml --env-file deploy/.env up -d --build
docker compose -f docker-compose.prod.yml --env-file deploy/.env logs -f
```

Au démarrage, l'API applique les migrations (`alembic upgrade head`) et Caddy
obtient le certificat HTTPS.

Créer le compte d'administration :

```bash
docker compose -f docker-compose.prod.yml --env-file deploy/.env exec api python -m app.seed
```

Vérification : `https://DOMAINE/api/health` répond `{"status":"ok"}`.

## 6. Sauvegardes

```bash
crontab -e
# ajouter :
0 3 * * * /opt/codeval/deploy/backup.sh >> /var/log/codeval-backup.log 2>&1
```

Les copies sont gardées 14 jours dans `/var/backups/codeval`. Une copie locale
ne protège pas contre la perte du serveur : activer aussi les sauvegardes du
VPS chez l'hébergeur, ou recopier ce dossier ailleurs.

Restauration :

```bash
gunzip -c /var/backups/codeval/FICHIER.sql.gz | \
  docker compose -f docker-compose.prod.yml --env-file deploy/.env exec -T db psql -U codeval codeval
```

## Mettre à jour

```bash
cd /opt/codeval
git pull
docker compose -f docker-compose.prod.yml --env-file deploy/.env up -d --build
```

## Sécurité de l'exécution du code

Les productions des apprenants tournent dans le conteneur `worker` :
utilisateur non root, aucune capacité Linux, pas d'accès Internet, mémoire,
CPU et nombre de processus plafonnés, en plus des limites POSIX de
`app/grading/sandbox.py`. Si l'API exécute aussi du code (essais des
apprenants), c'est avec les mêmes restrictions, sauf l'accès Internet
qu'elle garde pour l'envoi des e-mails.
