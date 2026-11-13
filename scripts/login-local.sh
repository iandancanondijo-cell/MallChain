#!/bin/bash
# login-local.sh — establish a cookie-authenticated session against the local
# backend so scripts/survey-routes.sh can probe authenticated endpoints.
#
#   LOGIN_PASSWORD='…' ./scripts/login-local.sh [email]
#   ./scripts/login-local.sh me@example.com 'secret'      # argv also works
#
# Writes curl's cookie jar to $JAR (default /tmp/mc.cookies) and the CSRF token
# to /tmp/mc.csrf. The backend authenticates with an httpOnly cookie (the SPA
# sends credentials:'include', never an Authorization header) and checks
# X-CSRF-Token against its secret cookie on every mutating request — see
# backend/src/middleware/requireAuth.js checkCsrf.
#
# No password is stored here, on purpose: the local superadmin credentials live
# in docs/SUPERADMIN_CREDENTIALS_FIXED.md, which is untracked precisely so a
# live credential never reaches git (the gitleaks hook and GitHub push
# protection both reject one). Source them from there if you want them typed
# for you:
#   LOGIN_PASSWORD="$(sed -n "s/.*password[^A-Za-z0-9]*\([^\"']*\).*/\1/p" docs/SUPERADMIN_CREDENTIALS_FIXED.md | head -1)" ./scripts/login-local.sh
set -eu
BASE=${BASE:-http://localhost:4000}
JAR=${JAR:-/tmp/mc.cookies}
EMAIL=${1:-${LOGIN_EMAIL:-}}
PASSWORD=${2:-${LOGIN_PASSWORD:-}}

if [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; then
  echo "usage: LOGIN_EMAIL=… LOGIN_PASSWORD=… $0 [email] [password]" >&2
  echo "       (credentials are not stored in this repo — see the header)" >&2
  exit 2
fi

csrf=$(curl -s -c "$JAR" "$BASE/api/csrf-token" | jq -r '.csrfToken // .token // empty')
body=$(curl -s -b "$JAR" -c "$JAR" \
  -H 'Content-Type: application/json' \
  ${csrf:+-H "X-CSRF-Token: $csrf"} \
  -d "$(jq -nc --arg e "$EMAIL" --arg p "$PASSWORD" '{email:$e,password:$p}')" \
  "$BASE/api/auth/login")
echo "$csrf" > /tmp/mc.csrf
if role=$(echo "$body" | jq -r '.user.role // empty'); [ -n "$role" ]; then
  echo "logged in as $(echo "$body" | jq -r '.user.email') ($role); jar=$JAR csrf=/tmp/mc.csrf"
else
  echo "login failed: $(echo "$body" | head -c 300)" >&2
  exit 1
fi
