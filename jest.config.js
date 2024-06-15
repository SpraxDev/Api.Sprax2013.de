/** @type {import('ts-jest').JestConfigWithTsJest} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  clearMocks: true,
  collectCoverageFrom: ['src/**/*.ts'],
  setupFiles: ['reflect-metadata'],

  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '(.+)\\.js': '$1' },
  transform: { '^.+\\.ts$': ['ts-jest', { useESM: true }] },
};
export default config;
