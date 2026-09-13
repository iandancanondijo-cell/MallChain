module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!**/node_modules/**'
  ],
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/?(*.)+(spec|test).js'
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // sanitize-html pulls in htmlparser2, which pulls in the rest of the
  // fb55 dom* parsing ecosystem — all of which migrated to ESM-only
  // (package.json "type": "module", no CJS export condition) together.
  // Jest's default CJS transform pipeline can't require() any of them.
  // Node's native require(esm) interop (20.19+/22.12+) papers over this
  // outside Jest, but Jest has its own module system that doesn't get
  // that interop, so each needs an explicit babel transform.
  transformIgnorePatterns: [
    'node_modules/(?!(htmlparser2|entities|domhandler|domelementtype|domutils|dom-serializer|parse5)/)',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  }
};
