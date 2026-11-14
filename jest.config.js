module.exports = {
    testEnvironment: 'node',
    modulePathIgnorePatterns: ['<rootDir>/.review-clone/', '<rootDir>/.tools/'],
    setupFiles: ['<rootDir>/tests/setupEnv.js'],
    testMatch: ['<rootDir>/tests/unit/**/*.test.js', '<rootDir>/tests/integration/**/*.test.js'],
    testTimeout: 30000
};
