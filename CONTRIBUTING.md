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

1. Clone the repository
2. Install backend dependencies: `cd backend && npm install`
3. Install frontend dependencies: `cd frontend && npm install`
4. Copy `.env.example` to `.env` and configure environment variables
5. Start services: `./START_ALL.sh`

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

## Questions?

Open an issue or contact the maintainers.
