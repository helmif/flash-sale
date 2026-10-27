module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/*.test.ts'],
    testPathIgnorePatterns: ['/node_modules/', '/dist/'],
    setupFiles: ['<rootDir>/tests/setup-env.ts'],
    collectCoverageFrom: ['src/**/*.service.ts', 'src/**/*.processor.ts'],
};
