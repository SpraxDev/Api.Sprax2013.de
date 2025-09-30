import { defineConfig } from 'vitest/config';
import { ProjectConfig } from 'vitest/node';

const defaultProjectConfig: ProjectConfig = {
  environment: 'node',
  clearMocks: true,
  restoreMocks: true,
  globals: true,

  setupFiles: ['reflect-metadata'],
};

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          ...defaultProjectConfig,
          dir: './tests/unit/',
          name: 'unit',
        },
      },
      {
        test: {
          ...defaultProjectConfig,
          dir: './tests/acceptance/',
          name: 'acceptance',
          setupFiles: ['./tests/acceptance/vitest.setup.ts'],
          testTimeout: 8_000,
          // TODO: Acceptance tests should not cause coverage for src/webserver/ files (was configured that way in jest, before migrating to vitest)
          // coveragePathIgnorePatterns: ['^(?!<rootDir>/src/webserver/).*\\.ts$'],
        },
      },
    ],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage/',

      include: [
        'src/**/*.ts',
      ],
      exclude: [
        './src/container-init.ts',
        './src/sentry-init.ts',
        './src/main.ts',

        './src/database/DatabaseClient.ts',
        './src/webserver/routes/minecraft/MinecraftV2Router.ts',
      ],
    },
  },
});
