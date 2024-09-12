import AppConfiguration from '../../../src/config/AppConfiguration.js';

describe('AppConfiguration', () => {
  let backupEnv: NodeJS.ProcessEnv;
  beforeEach(() => {
    backupEnv = process.env;
    process.env = {};
  });
  afterEach(() => {
    process.env = backupEnv;
  });

  test('Default values without any env vars', () => {
    const config = new AppConfiguration();

    expect(config.config).toEqual({
      serverPort: 8087,
      proxyServerUris: ''
    });
  });

  test('Configuration object is frozen', () => {
    const config = new AppConfiguration();
    expect(Object.isFrozen(config.config)).toBe(true);
    expect(Object.isFrozen(config.config.serverPort)).toBe(true);
    expect(Object.isFrozen(config.config.proxyServerUris)).toBe(true);
  });

  test.each(['abc', '0'])('Invalid port: %s', (portValue: string) => {
    process.env.SPRAXAPI_SERVER_PORT = portValue;

    const config = new AppConfiguration();
    expect(config.config).toEqual({
      serverPort: 8087,
      proxyServerUris: ''
    });
  });

  test.each([
    '',
    'socks5://[::1]:1080',
    'https://localhost?name=test,socks5://[::1]:1081'
  ])('Configured valid proxy server uris: %s', (proxyServerUris: string) => {
    process.env.PROXY_SERVER_URIS = proxyServerUris;

    const config = new AppConfiguration();
    expect(config.config).toEqual({
      serverPort: 8087,
      proxyServerUris
    });
  });

  test('configure object frozen recursively', () => {
    process.env.PROXY_SERVER_URIS = ['abc'] as any; // hacky because currently, the config is not nested

    const config = new AppConfiguration();
    expect(Object.isFrozen(config.config)).toBe(true);
    expect(Object.isFrozen(config.config.proxyServerUris)).toBe(true);
  });
});
