import { jest } from '@jest/globals';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import * as Undici from 'undici';
import SocksProxyAgentFactory from '../../../../src/http/clients/SocksProxyAgentFactory.js';
import ResolvedToNonUnicastIpError from '../../../../src/http/dns/errors/ResolvedToNonUnicastIpError.js';
import UnicastOnlyDnsResolver from '../../../../src/http/dns/UnicastOnlyDnsResolver.js';
import { SocksProxyServer } from '../../../../src/net/proxy/ProxyServerConfigurationProvider.js';
import SocksProxyServerConnector from '../../../../src/net/proxy/SocksProxyServerConnector.js';

const proxyServer: SocksProxyServer = {
  displayName: 'socks5://127.0.0.1:1080',
  simplifiedUri: 'socks5://127.0.0.1:1080',
  username: '',
  password: '',
  socksProxyOptions: {
    version: 5,
    host: '127.0.0.1',
    port: 1080
  }
};

describe('SocksProxyAgentFactory', () => {
  let unicastOnlyDnsResolver: DeepMockProxy<UnicastOnlyDnsResolver>;
  let socksProxyServerConnector: DeepMockProxy<SocksProxyServerConnector>;
  let socksProxyAgentFactory: SocksProxyAgentFactory;

  beforeEach(() => {
    unicastOnlyDnsResolver = mockDeep<UnicastOnlyDnsResolver>({
      resolvesToUnicastIp: jest.fn<any>().mockResolvedValue(true)
    });

    socksProxyServerConnector = mockDeep<SocksProxyServerConnector>();
    socksProxyAgentFactory = new SocksProxyAgentFactory(unicastOnlyDnsResolver, socksProxyServerConnector);
  });

  test('Creating an agent with the given options returns in a valid Undici.Agent', () => {
    const agent = socksProxyAgentFactory.create(proxyServer, { bodyTimeout: 10, headersTimeout: 10 });

    const agentOptions = extractOptionsFromAgent(agent);
    expect(agentOptions.bodyTimeout).toBe(10);
    expect(agentOptions.headersTimeout).toBe(10);

    expect(typeof agentOptions.connect).toBe('function');
  });

  test.each([
    ['http:'],
    ['https:']
  ])('Connecting to a domain that resolves to a non-unicast IP throws an error (%j)', async (protocol: string) => {
    unicastOnlyDnsResolver.resolvesToUnicastIp.mockResolvedValue(false);

    const agent = socksProxyAgentFactory.create(proxyServer, {});
    await expect(() => Undici.request(`${protocol}//local.example.com`, { dispatcher: agent })).rejects.toThrow(ResolvedToNonUnicastIpError);

    expect(unicastOnlyDnsResolver.resolvesToUnicastIp).toHaveBeenCalledWith('local.example.com');
  });
});

function extractOptionsFromAgent(agent: Undici.Agent): Undici.Agent.Options {
  const optionsSymbol = Object.getOwnPropertySymbols(agent).find(symbol => symbol.toString() === 'Symbol(options)');
  expect(optionsSymbol).toBeDefined();

  const options = (agent as any)[optionsSymbol as any];
  expect(options).toBeDefined();
  expect(typeof options).toBe('object');
  return options;
}
