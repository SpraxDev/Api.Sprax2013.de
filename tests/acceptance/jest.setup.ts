import '../../src/container-init.js';
import { jest } from '@jest/globals';
import { mockDeep } from 'jest-mock-extended';
import { container } from 'tsyringe';
import DatabaseClient from '../../src/database/DatabaseClient.js';
import HttpClient from '../../src/http/HttpClient.js';

jest.setTimeout(8_000);

beforeAll(async () => {
  (HttpClient as any).DEBUG_LOGGING = false;
});

beforeEach(async () => {
  container.clearInstances();
  container.registerInstance<DatabaseClient>(DatabaseClient, mockDeep<DatabaseClient>());
});
