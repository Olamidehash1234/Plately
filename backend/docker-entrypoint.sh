#!/bin/sh
# Make the mounted volume writable, then drop to the unprivileged user.
#
# Container hosts attach persistent volumes owned by root, regardless of the
# USER the image declares. The application runs as `plately` and writes two
# things — the SQLite database and uploaded meal photos — so without this the
# very first request fails with EACCES and the deploy looks broken for a
# reason that has nothing to do with the application.
#
# Only the mount point itself is chowned, not its contents: anything already
# inside was written by `plately` on an earlier run, and recursing would get
# slower with every photo a user uploads.

set -e

APP_UID=10001
APP_GID=10001

for dir in /app/data /app/media; do
    if [ -d "$dir" ]; then
        chown "$APP_UID:$APP_GID" "$dir" 2>/dev/null || true
    fi
done

# Already unprivileged (some hosts override USER) — just run.
if [ "$(id -u)" != "0" ]; then
    exec "$@"
fi

exec setpriv --reuid="$APP_UID" --regid="$APP_GID" --init-groups "$@"
