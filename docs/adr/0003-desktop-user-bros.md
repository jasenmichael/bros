# Desktop user is bros, and abc stays

Selkies names its account `abc` and looks that name up on every start. `init-adduser` remaps that account to `PUID`/`PGID`. The other start scripts start the session as `abc`. There is no username setting.

The desktop user is `bros`. Foot and the Terminal shell are that user. `bros-live` gives `bros` the same uid and gid, then lists `bros` first in `/etc/passwd`. `whoami` and the bash prompt use the first line for that uid, so both say `bros`. `s6-setuidgid abc` still finds `abc`.

Rewriting those Selkies scripts was rejected. A base-image update would put the name `abc` back, and the group name has to stay `abc` because `init-adduser` runs `groupmod` on it. The group name stays `abc`.
