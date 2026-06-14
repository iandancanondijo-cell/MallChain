# Marketplace Backend (Node/Express)

Quick start:

1. copy `.env.example` to `.env` and fill values (MONGO_URI, JWT_SECRET, GOOGLE_CLIENT_*)
2. install deps:

```bash
cd backend
npm install
```

1. run in dev:

```bash
npm run dev
```

API endpoints:

- `GET /api/health` health check
- `POST /api/auth/register` { email, password }
- `POST /api/auth/login` { email, password }
- `GET /api/auth/google` OAuth start
- `GET /api/auth/google/callback` OAuth callback
- `GET /api/protected` JWT-protected route (`Authorization: Bearer <token>`)

Example: obtain a JWT and create a vault

1. Login to get a token:

```bash
curl -s -X POST http://localhost:4000/api/auth/login \
	-H 'Content-Type: application/json' \
	-d '{"email":"dev@example.com","password":"password"}' | jq -r .token
```

2. Create a vault using the token:

```bash
TOKEN=ey... # token from login
curl -v -X POST http://localhost:4000/api/vault \
	-H "Authorization: Bearer $TOKEN" \
	-H 'Content-Type: application/json' \
	-d '{"authority":"dev","status":"active","data":{"test":"ok"}}'
```

If you don't have `jq` you can inspect the raw JSON response to extract the `token` field.
