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

## Setups, branches, updating

The six setups, their fork branches, how to push, spread a change and update from upstream:
`FORK.md`.
