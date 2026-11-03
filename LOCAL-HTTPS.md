# Local HTTPS between sites

One app calling another inside the stack, e.g. `merlino` → `https://login.edt.test/`, from
`php-fpm` or `workspace`, with certificate verification on (no `curl -k`, no `verify => false`).
The browser side (Mac → `https://<site>.test`) needs only the mkcert certificate in `nginx/ssl/`.

## Routine

After adding or renaming a vhost in `nginx/sites/`:

```bash
./local-https.sh
docker compose up -d nginx php-fpm workspace   # the exact list is printed by the script
```

The script:
- reads every `server_name` in `nginx/sites/*.conf` (not `localhost`, `_`, wildcards or regexes);
- writes `docker-compose.local.yml` (gitignored, never edit it by hand): those names become nginx
  aliases on the `frontend` and `backend` networks, and every `workspace*` / `php-fpm*` service in
  `COMPOSE_FILE` mounts the mkcert root CA and runs `update-ca-certificates` at start;
- adds `docker-compose.local.yml` to `COMPOSE_FILE` and `MKCERT_CAROOT` (`mkcert -CAROOT`) to `.env`;
- warns about site names that `nginx/ssl/default.crt` doesn't cover, and prints the `mkcert` command.

Check from inside a container:

```bash
docker compose exec php-fpm curl -sS -o /dev/null -w '%{http_code}\n' https://merlino.edt.test/
```

## The certificate

One certificate for all the Laradock setups on this Mac (only one setup runs at a time: they all
bind ports 80/443). It is signed by the local mkcert CA, which the Mac and, through the script, the
containers trust. `nginx/ssl/*.crt|key` are gitignored: the certificate lives on disk in each setup.

Reissue it when a site falls outside the names below, adding the new name, then copy it to every
setup and restart nginx in the running one:

```bash
cd nginx/ssl
mkcert -cert-file default.crt -key-file default.key \
  '*.edt.test' '*.chierotti.test' '*.shsoluzioni.test' '*.conservatoriotorino.test' \
  '*.unito.test' '*.fininc.test' 'guidemarcopolo.test' '*.lonelyplanetitalia.test' 'mfa.test'
chmod 644 default.key
for d in ~/Sites/*_laradock/laradock; do [ "$d/nginx/ssl" = "$PWD" ] || cp default.crt default.key "$d/nginx/ssl/"; done
```

A wildcard covers one label only: `*.edt.test` covers `next.edt.test`, not `next.merlino.edt.test`.

## Not covered

- **Selenium's Chrome** doesn't use the system trust store: browser tests on `https://` still need
  `--ignore-certificate-errors` in the driver. It does resolve the site names (it's on `frontend`).
- **Services outside `COMPOSE_FILE`**, e.g. `docker-compose.multi-php.yml` loaded with `-f`: put the
  file in `COMPOSE_FILE` and re-run the script.
- **Calls between setups**: only one setup runs at a time.

## Why it's built this way

- **Not `docker-compose.override.yml`**: Compose loads it only when `COMPOSE_FILE` is unset, and the
  setups set it. The old override (hard-coded `extra_hosts` to `172.19.0.7`) was silently ignored,
  and its IP had drifted anyway: container IPs change when the network is recreated.
- **Not `/etc/hosts` from the Mac**: inside a container the `*.test` names resolved to `127.0.0.1`,
  the container itself.
- **Aliases, generated**: Docker's DNS answers aliases before forwarding upstream, and follows nginx
  to whatever IP it gets. It has no wildcards, hence one alias per site, generated from the vhosts.
- **Not a DNS container** (CoreDNS rewriting `*.test` → nginx, zero list to maintain): it needs
  static IPs on the networks, and when it breaks, name resolution breaks for the whole stack.
- **CA mounted, not baked**: the CA is per machine (`MKCERT_CAROOT`), so the images stay generic.
  `SSL_CERT_FILE` pointing at the mkcert CA alone would drop the public CAs.

## Setups and branches

Every setup is a checkout of the fork `chieroz/laradock` (`origin`), whose own branches lag
`laradock/laradock` (`upstream`) by many commits. A setup branch is not kept merged with `master`:
a fork-wide change is one self-contained commit, cherry-picked onto each setup branch.

| Setup (`~/Sites/…`) | Local branch | Pushes to | Own changes |
|---|---|---|---|
| `edt_laradock` | `master` | `origin/edt83` | PHP 8.4 services (`PHP84.md`), production-aligned customizations |
| `fininc_laradock` | `master` | `origin/fininc` | none |
| `shsoluzioni_laradock` | `master` | `origin/shsoluzioni` | FTP module; uncommitted Gotenberg service |
| `unito_laradock` | `master` | `origin/master` | `docker-compose.multi-php.yml` |
| `chierotti_laradock` | `master` | `origin/chierotti` | none |
| `conservatoriotorino_laradock` | `master` | `origin/conservatoriotorino` | Gotenberg service, `mysql_native_password` |

Every folder has a local `master`, tracking its own setup branch (`edt_laradock`, once `edt83_laradock`, had `my-config` until 2026-11-03),
and `push.default=upstream` in its `.git/config`, so a plain `git push` goes to that branch (Git's default,
`simple`, refuses when the names differ). A fresh clone needs it again: `git config push.default upstream`.
Spreading a commit from the setup where it was made (`<source>`):

```bash
cd ~/Sites/<other>_laradock/laradock
git fetch ~/Sites/<source>_laradock/laradock master && git cherry-pick <sha>
git push
```

## Updating

A local stack isn't exposed, so it isn't updated routinely: if it works, leave it.

- **From `origin`**: nothing to pull. Each setup branch has one writer, its own folder (plus the
  cherry-picks above). Exception: a setup also edited on another machine, `git pull` there first.
- **From `upstream`**: only when you need something from it, above all when **production changes**
  (a server moves to a new PHP version, extension or database) and the local setup must match it
  again; or for a fix to a build that broke. An update means rebuilding images, so one setup at a
  time, with its stack stopped:

  ```bash
  cd ~/Sites/<setup>_laradock/laradock
  git fetch upstream
  git merge upstream/master          # conflicts, if any: docker-compose.yml, .env.example, Dockerfiles
  docker compose build workspace php-fpm nginx
  docker compose up -d
  ./local-https.sh && git push
  ```
- **Health check** of a folder: `git fetch && git status -sb`. `ahead N` = commits never pushed,
  `behind N` = something to pull.

The applications (merlino, agenzie, …) are separate repositories: pull them as usual.
