# Contributing to MallChain

Thank you for your interest in contributing to MallChain! This document provides guidelines for contributing to the project.

## Code of Conduct

Please read and follow our [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Getting Started

### Prerequisites

- Node.js 20+
- Go 1.24+
- MongoDB
- Redis
- Docker (optional, for containerized development)

### Setup

**Option A — docker-compose (fastest path to a fully working stack):**

1. Clone the repository
2. Copy `.env.example` to `.env` at the repo root and fill in at minimum
   `MONGO_ROOT_PASSWORD`, `MONGO_APP_PASSWORD`, `JWT_SECRET`,
   `SESSION_SECRET`, `ADMIN_API_KEY`, `PAYMENT_WEBHOOK_SECRET` (generate
   each with `openssl rand -hex 16` — the file has guidance next to each)
3. `docker-compose up --build`
4. **First run only:** the chain node starts with an empty data volume and
   won't have a genesis yet — see `docker-compose.yml`'s comment on the
   `marketplaced` service for the one-time init command
5. Once everything's up: `./scripts/smoke-test.sh` to confirm the whole
   stack is actually healthy, not just running

**Option B — running services directly (faster iteration on one piece):**

1. Install backend dependencies: `cd backend && npm install`
2. Install frontend dependencies: `cd mallchain-os-v14 && npm install`
3. Copy `.env.example` to `backend/.env` and configure environment variables
   (MongoDB + Redis must be running locally or reachable — see
   `docker-compose.yml` for a quick way to get just those two up:
   `docker-compose up mongo redis`)
4. `./START_ALL.sh` to start the chain node + backend + frontend together,
   or start each individually (`cd backend && npm start`,
   `cd mallchain-os-v14 && npm run dev`, `./scripts/start_blockchain.sh`)

**Running tests:**
- Backend: `cd backend && npm test` (Jest — see `backend/src/__tests__/`)
- Frontend: `cd mallchain-os-v14 && npm run test:run` (Vitest)
- Chain: `go test ./...` from the repo root
- A single backend test file: `cd backend && npx jest <name-fragment>`

## Development Workflow

### Branching

- `main` - Production branch
- Create feature branches from `main`: `git checkout -b feature/your-feature-name`
- Use descriptive branch names

### Commit Messages

Follow conventional commits format:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `test:` - Test changes
- `refactor:` - Code refactoring
- `chore:` - Maintenance tasks

Example: `feat: add wallet locking mechanism`

### Pull Requests

1. Ensure your branch is up to date with `main`
2. Run tests: `npm test` (backend) and `npm run test` (frontend)
3. Run linting: `npm run lint`
4. Create a PR with a clear description
5. Wait for CI checks to pass
6. Address review feedback

## Coding Standards

### JavaScript/TypeScript

- Use ESLint configuration
- Follow existing code style
- Add JSDoc comments for public functions
- Keep functions under 50 lines when possible

### Go

- Follow Go best practices
- Run `go fmt` on all code
- Run `go vet` before committing
- Write unit tests for all packages

### Testing

- Aim for 70%+ code coverage
- Write unit tests for business logic
- Write integration tests for API endpoints
- Mock external dependencies

## Security

- Never commit secrets or API keys
- Report security vulnerabilities privately
- Follow security best practices outlined in [SECURITY.md](SECURITY.md)

## Documentation

- Update README.md for user-facing changes
- Update API documentation for endpoint changes
- Add comments for complex logic

## Module Status

Some parts of the monorepo are intentionally not wired up yet, or are
duplicated. Read this before extending them, so effort doesn't land on a
path that's already been decided against.

- **`x/mallcoin` vs `x/mlcoin`** — `x/mlcoin` is the real ledger (wallets,
  minting, transfers, fees, staking). `x/mallcoin` is params-only and much
  smaller; the near-identical names are a known source of confusion, not two
  competing ledgers. Prefer `x/mlcoin` for anything transfer/balance-related.
- **`x/wasm`, `x/wasmbridge`, `x/crosschain`** — keepers and proto are built,
  but there is no backend route or frontend page for any of them. Treat
  these as future work, not dead code to remove: don't invest further here
  without a concrete product need driving it, since building REST/FE for a
  module without a defined use case tends to produce unused surface area.
- **`packages/shared-ui`** — has zero consumers in `mallchain-os-v14`. Its
  components assume Tailwind utility classes and target React 19 types;
  `mallchain-os-v14` uses neither (hand-rolled CSS, React 18). Wiring it in
  as-is would render unstyled. Recommendation: remove it rather than force
  the integration, unless a real second frontend consumer appears that
  actually shares this styling approach.
- **`packages/shared-config`** — pure env-var/chain-config helpers, no
  framework assumptions, so lower risk than shared-ui — but
  `mallchain-os-v14/src/services/config.ts` already duplicates this same
  logic independently. Consolidating the two is reasonable future cleanup;
  do it deliberately (one PR, checking every import site) rather than as a
  drive-by change, since `config.ts`'s `chain` export is imported by most of
  the chain-signing services.
- **`explorer/`** — a standalone backend-only indexer with its own routes,
  separate from `mallchain-os-v14`'s own `BlockchainExplorer` page (which is
  what's actually linked into the app). The two aren't unified. The FE page
  is the active one; treat `explorer/` as a separate indexing experiment
  until a decision is made to feed its data into the FE page or retire it.

## Questions?

Open an issue or contact the maintainers.
