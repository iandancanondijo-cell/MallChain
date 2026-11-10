# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Blockchain-level wallet locking mechanism
- MongoDB transactions for balance operations
- Idempotency middleware for financial operations
- Prometheus metrics infrastructure
- Structured logging with correlation IDs
- Comprehensive test suite with coverage thresholds
- Docker security hardening (non-root users, healthchecks)

### Changed
- Upgraded Node.js from 18 to 20
- Standardized Dockerfiles with multi-stage builds
- Improved CI pipeline to fail on vulnerabilities
- Rotated all secrets and mnemonics

### Fixed
- FeesAccumulated state initialization in blockchain
- Ownership checks on submission updates
- CORS configuration for Socket.IO
- Gas fee consumption for failed transactions

### Security
- P0: All critical security issues addressed
- P1: Testing infrastructure and deployment security improved
