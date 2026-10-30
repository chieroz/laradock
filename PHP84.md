# PHP 8.4 alongside PHP 8.3

This Laradock serves two groups of projects:

- **PHP 8.3** (default `workspace` / `php-fpm`, `PHP_VERSION=8.3` in `.env`): projects that stay on the
  Ubuntu Noble (PHP 8.3) hosts.
- **PHP 8.4** (`workspace84` / `php-fpm84`): projects deployed to the Debian trixie host
  (`chieroz-trixie-ireland`, PHP 8.4, RDS MySQL 8.4). First one: `lexicon.edt`.

Both groups share the same nginx and MySQL (`MYSQL_VERSION=8.4`). Each nginx site picks its PHP
version through its `fastcgi_pass`.

## How it is built

| File | Tracked | Role |
|---|---|---|
| `docker-compose.php84.yml` | yes | Defines `workspace84` and `php-fpm84` by extending `workspace` / `php-fpm` with `LARADOCK_PHP_VERSION=8.4`; nginx also depends on `php-fpm84` |
| `nginx/sites/php84-upstream.conf` | yes (gitignore exception in `nginx/sites/.gitignore`) | `upstream php84-upstream { server php-fpm84:9000; }` |
| `php-fpm/php8.4.ini` | yes (upstream Laradock) | php.ini mounted into `php-fpm84` |
| `.env` | no (gitignored) | `COMPOSE_FILE=docker-compose.yml:docker-compose.php84.yml` loads the extra file |
| `nginx/sites/<project>.conf` | no (gitignored) | A PHP 8.4 site uses `fastcgi_pass php84-upstream;` |

Details in `docker-compose.php84.yml`:

- `workspace84` has `INSTALL_SYMFONY=false`: the upstream Symfony CLI installer changed its install
  path and breaks Laradock's install step (the projects don't need the CLI).
- `workspace84` has `ports: !reset []`: the host ports (SSH 2222 etc.) are already taken by the
  PHP 8.3 `workspace`.
- `php-fpm84` has `depends_on: !override [workspace84]`, so it doesn't start the 8.3 workspace.

Why a separate file and not `docker-compose.override.yml`: Docker Compose loads the override file
only when `COMPOSE_FILE` is not set, and this `.env` sets it. (The existing untracked
`docker-compose.override.yml` is never loaded for that reason.)

## Setup on a new machine

1. In `.env`, set:
   ```
   COMPOSE_FILE=docker-compose.yml:docker-compose.php84.yml
   ```
2. Build the PHP 8.4 images (the first build takes a while):
   ```bash
   docker-compose build workspace84 php-fpm84
   ```
3. Start them with nginx and MySQL:
   ```bash
   docker-compose up -d nginx mysql workspace84 php-fpm84
   ```
4. Check:
   ```bash
   docker-compose exec workspace84 php -v   # PHP 8.4.x
   docker-compose exec php-fpm84 php -v     # PHP 8.4.x
   docker-compose config --services | grep 84
   ```

## Moving a project to PHP 8.4

1. **nginx**: in `nginx/sites/<project>.conf` replace `fastcgi_pass php-upstream;` with
   `fastcgi_pass php84-upstream;`, then `docker-compose restart nginx`.
2. **CLI**: run `composer`, `bin/console` / `artisan` and tests in `workspace84` instead of
   `workspace`:
   ```bash
   docker-compose exec workspace84 bash -c "cd /var/www/<project> && composer install"
   ```
   If the project has a Makefile, point its workspace variable at `workspace84` and make its `up`
   target start `php-fpm84` (see `lexicon.edt/Makefile`).
3. **Composer**: require PHP 8.4 and pin the platform so packages resolve for 8.4:
   ```json
   "require": { "php": "^8.4" },
   "config": { "platform": { "php": "8.4" } }
   ```
   then `composer update` inside `workspace84`.
4. **Database**: if the project uses Doctrine, set `server_version: '8.4'` (MySQL 8.4, as on RDS).
5. **Code**: optionally move Rector to `UP_TO_PHP_84`, then run the tests and static analysis on
   PHP 8.4.

Projects that stay on PHP 8.3 need no changes: they keep `php-upstream` and `workspace`.

## Removing PHP 8.4

Set `COMPOSE_FILE=docker-compose.yml` in `.env`, switch the PHP 8.4 sites back to
`php-upstream`, then `docker-compose stop workspace84 php-fpm84`.
