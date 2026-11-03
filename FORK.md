# The fork and the local setups

Every local Laradock setup (`~/Sites/<setup>_laradock/laradock`) is a clone of one GitHub fork,
`chieroz/laradock`, with **one branch per setup**: GitHub allows one fork per account per source
repo, so a shared fork with per-setup branches is the workaround. Pushing from one setup never
touches another one's configuration.

## Remotes (same in every clone)

- `origin` → https://github.com/chieroz/laradock.git: the fork, where you push
- `upstream` → https://github.com/laradock/laradock.git: the official repo, fetch only (no write access)

## Setups and branches

| Setup (`~/Sites/…`) | Local branch | Fork branch | Own changes |
|---|---|---|---|
| `edt_laradock` | `master` | `origin/edt` | PHP 8.4 services (`PHP84.md`), production-aligned customizations |
| `fininc_laradock` | `master` | `origin/fininc` | none |
| `shsoluzioni_laradock` | `master` | `origin/shsoluzioni` | FTP module; uncommitted Gotenberg service |
| `unito_laradock` | `master` | `origin/master` | `docker-compose.multi-php.yml` |
| `chierotti_laradock` | `master` | `origin/chierotti` | none |
| `conservatoriotorino_laradock` | `master` | `origin/conservatoriotorino` | Gotenberg service, `mysql_native_password` |

The local branch is always `master` and tracks its own fork branch (`git branch -vv` shows it).
History: `edt_laradock` was `edt83_laradock` (fork branch `edt83`, local branch `my-config`, containers
`edt83-*`) until 2026-11-03.

The fork branches lag `upstream` by many commits, and each lags the fork's own `master` (unito's
branch) too, by 100+ commits. They are never merged with each other.

## Pushing

Every clone has `push.default=upstream` in its `.git/config`, so a plain **`git push`** goes to the
tracked fork branch. Git's default (`simple`) refuses a plain push when the local name (`master`)
differs from the fork branch (`fininc`, `edt`, …). A fresh clone needs it again:

```bash
git config push.default upstream
```

Never `git push origin HEAD` or `git push origin master`: both target the fork's `master`, which is
unito's branch. Never push to `upstream`.

## A change for every setup

One self-contained commit, made in one setup and cherry-picked onto the others (a merge would drag
the 100+ commits of difference along):

```bash
cd ~/Sites/<other>_laradock/laradock
git fetch ~/Sites/<source>_laradock/laradock master && git cherry-pick <sha>
git push
```

## Updating

A local stack isn't exposed, so it isn't updated routinely: if it works, leave it.

- **From `origin`**: nothing to pull. Each fork branch has one writer, its own folder (plus the
  cherry-picks above). Exception: a setup also edited on another machine, `git pull` there first.
- **From `upstream`**: only when you need something from it, above all when **production changes**
  (a server moves to a new PHP version, extension or database) and the local setup must match it
  again; or for a fix to a build that broke. An update means rebuilding images, so one setup at a
  time, with its stack stopped:

  ```bash
  cd ~/Sites/<setup>_laradock/laradock
  git fetch upstream
  git log --oneline HEAD..upstream/master    # what's coming
  git merge upstream/master                  # conflicts, if any: docker-compose.yml, .env.example, Dockerfiles
  docker compose build workspace php-fpm nginx
  docker compose up -d
  ./local-https.sh && git push
  ```
- **Health check** of a folder: `git fetch && git status -sb`. `ahead N` = commits never pushed,
  `behind N` = something to pull.

The applications (merlino, agenzie, …) are separate repositories: pull them as usual.

## Adding a setup

1. Clone the fork, or reuse an existing clone: `git clone https://github.com/chieroz/laradock.git`
   inside `~/Sites/<setup>_laradock/`.
2. `git remote add upstream https://github.com/laradock/laradock.git`
3. Start from the closest setup's branch, then create the new one on the fork:
   `git checkout -B master origin/<closest>` and `git push -u origin master:<setup>`.
4. `git config push.default upstream`
5. `.env` with its own `COMPOSE_PROJECT_NAME=<setup>` and `DATA_PATH_HOST=~/.laradock/<setup>/data`,
   the shared certificate in `nginx/ssl/`, then `./local-https.sh` (see `LOCAL-HTTPS.md`).
6. Add a row to the table above, in every setup (a cherry-picked commit).

## Notes

- GitHub Actions is disabled on the fork: upstream's shell-lint workflow has pre-existing failures
  unrelated to the local changes, and running it on every push would be noise.
- Only one setup runs at a time: they all bind ports 80/443.
