// Used only by Jest, only to transform the one ESM-only dependency
// (htmlparser2, pulled in via sanitize-html) that Jest's default CJS
// transform can't require() — see jest.config.js's transformIgnorePatterns.
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
};
