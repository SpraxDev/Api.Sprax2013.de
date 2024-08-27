/** @type {import('ts-jest').JestConfigWithTsJest['projects'][number]} */
const defaultProjectConfig = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  clearMocks: true,
  restoreMocks: true,

  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '(.+\/.+)\\.js': '$1' },
  transform: { '^.+\\.ts$': ['ts-jest', { useESM: true }] },

  setupFiles: ['reflect-metadata'],
};

/** @type {import('ts-jest').JestConfigWithTsJest} */
const config = {
  projects: [
    {
      ...defaultProjectConfig,
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],
    },
    {
      ...defaultProjectConfig,
      displayName: 'acceptance',
      testMatch: ['<rootDir>/tests/acceptance/**/*.test.ts'],
      coveragePathIgnorePatterns: ['^(?!<rootDir>/src/webserver/).*\\.ts$'],

      setupFilesAfterEnv: ['<rootDir>/tests/acceptance/jest.setup.ts'],
    },
  ],

  collectCoverageFrom: [
    '<rootDir>/src/**/*.ts',
    '!<rootDir>/src/sentry-init.ts',
    '!<rootDir>/src/container-init.ts',
    '!<rootDir>/src/main.ts',
  ],
};
export default config;
