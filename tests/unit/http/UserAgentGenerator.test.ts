import { jest } from '@jest/globals';
import Os from 'node:os';
import { getAppInfo } from '../../../src/constants.js';
import UserAgentGenerator from '../../../src/http/UserAgentGenerator.js';

describe('UserAgentGenerator', () => {
  const originalPlatform = process.platform;
  const originalArch = process.arch;

  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'test' });
    Object.defineProperty(process, 'arch', { value: 'x64' });

    jest.spyOn(Os, 'type').mockReturnValue('Test');
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    Object.defineProperty(process, 'arch', { value: originalArch });
  });

  test('generate User-Agent with app name and version', () => {
    const userAgent = UserAgentGenerator.generate('test-app', '1.0.0', false);

    expect(userAgent).toBe('test-app/1.0.0');
    expect(Os.type).toHaveBeenCalledTimes(0);
  });

  test('generate User-Agent with app name, version and project URL', () => {
    const userAgent = UserAgentGenerator.generate('test-app', '1.0.0', false, 'https://example.com');

    expect(userAgent).toBe('test-app/1.0.0 (+https://example.com)');
    expect(Os.type).toHaveBeenCalledTimes(0);
  });

  test.each([true, undefined])('generate User-Agent with system info', (includeSystemInfo) => {
    const userAgent = UserAgentGenerator.generate('test-app', '1.0.0', includeSystemInfo);

    expect(userAgent).toBe('test-app/1.0.0 (Test; x64; test)');
    expect(Os.type).toHaveBeenCalledTimes(1);
  });

  test('generating default User-Agent uses #getAppInfo', () => {
    const userAgent = UserAgentGenerator.generateDefault();

    expect(userAgent).toBe(`${getAppInfo().name}/${getAppInfo().version} (Test; x64; test) (+${getAppInfo().homepage})`);
    expect(Os.type).toHaveBeenCalledTimes(1);
  });
});
