# nginx + ModSecurity (déploiement) — plan et bug résolu

## 1. Plan — nginx `dep` avec HTTPS + WAF (ModSecurity)

Objectif : le nginx de déploiement (`docker-compose-dep.yml`) passe en HTTPS + WAF (ModSecurity/CRS),
pendant que le nginx de dev (`docker-compose-dev.yml`) reste HTTP simple, inchangé.

**Fichiers à créer/modifier :**
```
.env.dev                          ← .env actuel renommé, valeurs dev inchangées
.env.dep                          ← nouveau, valeurs dep (https, DEBUG=False)

docker-compose-dev.yml            ← fichier actuel, quasi inchangé
docker-compose-dep.yml            ← fichier existant, section frontend_nginx mise à niveau

run_dep_secure.sh                 ← une ligne changée : --env-file .env.dep

vault-init/gen_vault_cert.sh      ← génération du cert nginx ajoutée à la fin

frontend/docker_conf/
  Dockerfile                      ← nouveau, FROM owasp/modsecurity-crs:nginx-alpine
  nginx.dev.conf                  ← nginx.conf actuel renommé
  nginx.dep.conf                  ← nouveau, HTTPS + WAF + toutes les routes Django
  modsecurity/
    modsecurity.conf              ← nouveau
    exclusions.conf               ← nouveau
```

**Rien d'autre ne change** — postgres, redis, vault, vault-init, mailpit, chess_engine,
stockfish_ai, timeout_checker restent identiques dans les deux compose files.

### Étapes

1. **`settings.py`** — flag `BEHIND_PROXY` pour `SECURE_PROXY_SSL_HEADER`.
2. **`vault-init/gen_vault_cert.sh`** — génération du cert nginx en plus, même schéma que le cert vault, écrit `nginx-cert.pem`/`nginx-key.pem` dans `/vault/certs/`.
3. **`.env.dep`** — valeurs https, `BEHIND_PROXY=true`, `DEBUG=True` pour l'instant.
4. **`.env.dev`** — `.env` actuel renommé, `BEHIND_PROXY=false`.
5. **`modsecurity/modsecurity.conf`** — config core ModSecurity, `DetectionOnly` pour commencer.
6. **`modsecurity/exclusions.conf`** — règles d'exclusion Django/DRF/WebSocket/allauth.
7. **`nginx.dep.conf`** — config complète HTTPS + WAF + toutes les routes Django + rate limiting.
8. **`Dockerfile`** — nouveau, `FROM owasp/modsecurity-crs:nginx-alpine` (**voir §2 : ce choix d'image règle aussi le bug ci-dessous**).
9. **`docker-compose-dep.yml`** — section `frontend_nginx` mise à jour (image, ports, volumes, `depends_on`, healthcheck).
10. **`run_dep_secure.sh`** — `--env-file .env.dep`.
11. **`docker-compose-dev.yml`** — `nginx.dev.conf` + `.env.dev`.
12. **Test en mode `DetectionOnly`** — monter la stack dep, passer sur toutes les fonctionnalités, surveiller l'audit log, corriger les faux positifs.
13. **Passage à `SecRuleEngine On`** — une fois propre, activer l'application des règles.

Chaque étape seulement sur feu vert.

---

## 2. Bug résolu — nginx segfault (ModSecurity) au chargement des règles

### Statut : **résolu**, cause identifiée, correctif connu et déjà prévu par le plan ci-dessus (étape 8).

### 2.1 Ce qu'on observait au départ

En chargeant un fichier de règles ModSecurity (`modsecurity_rules_file`) contenant ces trois
directives **dans cet ordre précis** :

```
SecAuditLog /var/log/modsecurity/audit.log
SecRequestBodyLimit          5242880
SecRequestBodyNoFilesLimit   131072
```

nginx segfaultait (`Segmentation fault`, code de sortie `139`) pendant l'analyse de la config
(`nginx -t`), sans aucun message dans le log d'erreur nginx — le process meurt avant de logger.

- Deux des trois directives, n'importe lesquelles : pas de crash.
- Les trois dans cet ordre précis : crash systématique.
- Réordonner (`SecAuditLog` en dernier) : semblait éviter le crash — **piste fausse, voir 2.3**.

C'est du signalé sous ce nom (**#2 rapporté**) dans
`frontend/docker_conf/bug-report-2-ModSecurity-nginx.md` (rapport original, gardé tel quel comme
pièce jointe technique — ce fichier-ci en est la suite : investigation complète + solution).

### 2.2 Investigation — repris du fil GitHub officiel

Rapport déposé et suivi jusqu'à résolution sur le dépôt amont, par le mainteneur du connecteur
nginx de ModSecurity lui-même :
[owasp-modsecurity/ModSecurity-nginx#390](https://github.com/owasp-modsecurity/ModSecurity-nginx/issues/390).

Résumé du fil (chronologique) :

1. Le mainteneur (`airween`) n'arrive pas à reproduire avec des versions plus récentes
   (ModSecurity-nginx v1.0.4, nginx 1.30.1, libmodsecurity 3.0.15, Debian).
2. Reproduction confirmée avec les versions **précises** utilisées ici : ModSecurity-nginx v1.0.3,
   nginx 1.22.1, Alpine 3.16, image `owasp/modsecurity:nginx-alpine` (build d'octobre 2022).
3. Piste affinée : le crash ne dépend pas que de l'ordre — si les mêmes directives existent **déjà**
   dans le `modsecurity.conf` de base (ce qui est le cas par défaut dans cette image) et qu'on les
   redéfinit dans un fichier séparé, ça crash **quel que soit l'ordre**. L'ordre seul n'expliquait
   donc pas tout — juste un symptôme partiel.
4. **Cause réelle, trouvée après re-test** : rien à voir avec l'ordre ni les doublons — un simple
   **caractère TAB** dans un fichier de règles ModSecurity fait planter le parseur.
   `SecAuditLog<TAB>/tmp/audit.log` crashe ; le même avec un espace passe sans problème.
   Reproduction minimale publiée : [AlexPhoenix42/nginx-modsecurity-tab-segfault](https://github.com/AlexPhoenix42/nginx-modsecurity-tab-segfault).
5. Confirmation du mainteneur : bug **déjà connu et déjà corrigé**, cf. l'annonce officielle
   [CVE-2026-30923 et CVE-2026-42268](https://modsecurity.org/20260428/about-cve-2026-30923-and-2026-42268/#null-pointer-dereference-and-unhandled-exception-in-config-parser)
   et le [CHANGELOG](https://github.com/owasp-modsecurity/ModSecurity/blob/v3/master/CHANGES#L32-L33) —
   corrigé dans **libmodsecurity 3.0.15**, PR [owasp-modsecurity/ModSecurity#3543](https://github.com/owasp-modsecurity/ModSecurity/pull/3543)
   *"fix: nullptr dereference in seclang scanner"*.

### 2.3 Pourquoi ça plante — le mécanisme exact

Le scanner de ModSecurity (`seclang`, son propre analyseur pour les fichiers `.conf` de règles —
généré par `flex`, fichier source `src/parser/seclang-scanner.ll`) sépare le nom d'une directive de
son argument avec une expression régulière `[ \t]+` (espace **ou** tabulation, les deux sont censés
être acceptés).

Le problème est dans le code qui traite ensuite ce texte reconnu : il cherche le séparateur avec
`strchr(yytext, ' ')` — **qui ne cherche qu'un espace**, jamais une tabulation. Quand la regex a
matché sur une tabulation (donc un cas normalement valide), `strchr` ne trouve pas d'espace, renvoie
`NULL`, et le code fait `+ 1` sur ce pointeur nul juste après — déréférencement de pointeur nul,
undefined behavior, `SIGSEGV`. Le correctif (PR #3543) remplace ces appels par une fonction
`find_separator()` qui reconnaît correctement l'espace **et** la tabulation, et ajoute une capture
des exceptions C++ côté parseur pour que ce genre de cas ne tue plus jamais le process nginx
directement (il échouerait proprement à la place).

Donc : **ce n'était pas l'ordre des directives** (fausse piste initiale, due au hasard des fichiers
de test) — c'est un bug de bas niveau dans le parseur de `libmodsecurity3`, présent dans toutes les
versions jusqu'à 3.0.14 incluse, corrigé en 3.0.15.

### 2.4 Comment corriger, ici, concrètement

**Constat sur ce dépôt** : les fichiers ModSecurity réellement chargés par le Dockerfile actuel
(`main.conf`, `modsecurity.conf`, `exclusions.conf`, copiés dans `frontend/docker_conf/Dockerfile`)
**ne contiennent pas de tabulation** — pas de risque immédiat avec la config active aujourd'hui.
En revanche, `frontend/docker_conf/modsecurity/modsecurity0.conf` et
`frontend/docker_conf/modsecurity/override.conf` (ce dernier commenté, non chargé pour l'instant)
**contiennent des tabulations** — si `override.conf` est réactivé un jour tel quel, ou si un futur
fichier de règles est indenté à la tabulation, le crash réapparaît immédiatement sur l'image
actuelle. Le `Dockerfile` de ce dépôt est toujours sur `FROM owasp/modsecurity:nginx-alpine`
(libmodsecurity **3.0.8**, non corrigé).

Deux corrections, une immédiate et une définitive :

1. **Immédiat, sans rien changer d'autre** : n'indenter **aucun** fichier de règles ModSecurity à la
   tabulation — espaces uniquement. Ça évite le crash sur l'image actuelle, mais c'est fragile (un
   copier-coller depuis un éditeur qui indente en tab suffit à le faire revenir).
2. **Définitif — déjà prévu par le plan §1, étape 8** : passer le `Dockerfile` sur
   `FROM owasp/modsecurity-crs:nginx-alpine` au lieu de `owasp/modsecurity:nginx-alpine`. Cette
   image-là embarque **libmodsecurity 3.0.16** (donc le correctif) et le connecteur **v1.0.4**.
   Confirmé dans le fil GitHub (dernier message d'`AlexPhoenix42`) : le crash sur tabulation **ne se
   reproduit plus** sur cette image. C'est aussi la recommandation officielle du projet — l'image
   `owasp/modsecurity:nginx-alpine` est **archivée** sur Docker Hub (figée sur libmodsecurity 3.0.8,
   ne recevra jamais le correctif), et pointe elle-même vers `coreruleset/modsecurity-docker-crs`
   comme remplaçant.

**Recommandation** : faire l'étape 8 du plan (changement d'image) résout le bug à la racine, en plus
d'apporter le CRS (Core Rule Set) prévu par le reste du plan — un seul changement pour les deux
objectifs. Garder l'indentation espace en attendant (défense en profondeur, coûte rien).

### 2.5 Sources

- Rapport original (pièce jointe technique) : `frontend/docker_conf/bug-report-2-ModSecurity-nginx.md`
- Fil de résolution amont : [owasp-modsecurity/ModSecurity-nginx#390](https://github.com/owasp-modsecurity/ModSecurity-nginx/issues/390)
- Reproduction minimale (tab vs espace) : [AlexPhoenix42/nginx-modsecurity-tab-segfault](https://github.com/AlexPhoenix42/nginx-modsecurity-tab-segfault)
- Annonce officielle CVE-2026-30923 / CVE-2026-42268 : [modsecurity.org](https://modsecurity.org/20260428/about-cve-2026-30923-and-2026-42268/#null-pointer-dereference-and-unhandled-exception-in-config-parser)
- Changelog (entrée 3.0.15) : [ModSecurity/CHANGES](https://github.com/owasp-modsecurity/ModSecurity/blob/v3/master/CHANGES#L32-L33)
- Correctif : [owasp-modsecurity/ModSecurity#3543 — "fix: nullptr dereference in seclang scanner"](https://github.com/owasp-modsecurity/ModSecurity/pull/3543)
- Image de remplacement recommandée par le projet amont : `owasp/modsecurity-crs:nginx-alpine` (le `owasp/modsecurity:nginx-alpine` actuellement utilisé ici est archivé)
