// Same as jest.config.js, plus defaults that switch on the suites needing Redis and MongoDB.
const base = require('./jest.config');

module.exports = { ...base, setupFiles: [...base.setupFiles, '<rootDir>/tests/setup-services.ts'] };
