import '../../src/container-init.js';
import { container } from 'tsyringe';
import { mockDeep } from 'vitest-mock-extended';
import AppConfiguration from '../../src/config/AppConfiguration.js';
import DatabaseClient from '../../src/database/DatabaseClient.js';
import QuestDbClient from '../../src/database/QuestDbClient.js';
import AutoProxiedHttpClient from '../../src/http/clients/AutoProxiedHttpClient.js';
import ProxyPoolHttpClient from '../../src/http/clients/ProxyPoolHttpClient.js';
import SimpleHttpClient from '../../src/http/clients/SimpleHttpClient.js';
import SocksProxyAgentFactory from '../../src/http/clients/SocksProxyAgentFactory.js';
import CachedDnsResolver from '../../src/http/dns/resolver/CachedDnsResolver.js';
import DnsResolver from '../../src/http/dns/resolver/DnsResolver.js';
import UnicastOnlyDnsResolver from '../../src/http/dns/resolver/UnicastOnlyDnsResolver.js';
import LazyImportTaskCreator from '../../src/import_queue/LazyImportTaskCreator.js';
import Metrics from '../../src/metrics/Metrics.js';
import CapeCache from '../../src/minecraft/cape/CapeCache.js';
import LabymodCapeProvider from '../../src/minecraft/cape/provider/LabymodCapeProvider.js';
import MojangCapeProvider from '../../src/minecraft/cape/provider/MojangCapeProvider.js';
import OptifineCapeProvider from '../../src/minecraft/cape/provider/OptifineCapeProvider.js';
import Cape2dRenderer from '../../src/minecraft/cape/renderer/Cape2dRenderer.js';
import UserCapeProvider from '../../src/minecraft/cape/UserCapeProvider.js';
import UserCapeService from '../../src/minecraft/cape/UserCapeService.js';
import MinecraftApiClient from '../../src/minecraft/MinecraftApiClient.js';
import CapePersister from '../../src/minecraft/persistance/base/CapePersister.js';
import ProfilePersister from '../../src/minecraft/persistance/base/ProfilePersister.js';
import ProfileSeenCapePersister from '../../src/minecraft/persistance/base/ProfileSeenCapePersister.js';
import ProfileSeenNamePersister from '../../src/minecraft/persistance/base/ProfileSeenNamePersister.js';
import SkinPersister from '../../src/minecraft/persistance/base/SkinPersister.js';
import ByPlayerProfileLazyPersister from '../../src/minecraft/persistance/ByPlayerProfileLazyPersister.js';
import MinecraftProfileCache from '../../src/minecraft/profile/MinecraftProfileCache.js';
import MinecraftProfileService from '../../src/minecraft/profile/MinecraftProfileService.js';
import FqdnValidator from '../../src/minecraft/server/blocklist/FqdnValidator.js';
import ServerBlocklistPersister from '../../src/minecraft/server/blocklist/ServerBlocklistPersister.js';
import ServerBlocklistService from '../../src/minecraft/server/blocklist/ServerBlocklistService.js';
import MinecraftSkinNormalizer from '../../src/minecraft/skin/manipulator/MinecraftSkinNormalizer.js';
import MinecraftSkinCache from '../../src/minecraft/skin/MinecraftSkinCache.js';
import MinecraftSkinService from '../../src/minecraft/skin/MinecraftSkinService.js';
import MinecraftSkinTypeDetector from '../../src/minecraft/skin/MinecraftSkinTypeDetector.js';
import LegacyMinecraft3DRenderer from '../../src/minecraft/skin/renderer/LegacyMinecraft3DRenderer.js';
import SkinImage2DRenderer from '../../src/minecraft/skin/renderer/SkinImage2DRenderer.js';
import ThirdPartyMinecraftApiClient from '../../src/minecraft/ThirdPartyMinecraftApiClient.js';
import ProxyServerConfigurationProvider from '../../src/net/proxy/ProxyServerConfigurationProvider.js';
import SocksProxyServerConnector from '../../src/net/proxy/SocksProxyServerConnector.js';
import ProxyPoolHttpClientHealthcheckTask from '../../src/task_queue/tasks/ProxyPoolHttpClientHealthcheckTask.js';
import FastifyWebServer from '../../src/webserver/FastifyWebServer.js';
import MetricsRouter from '../../src/webserver/routes/MetricsRouter.js';
import MinecraftV1Router from '../../src/webserver/routes/minecraft/MinecraftV1Router.js';
import StatusRouter from '../../src/webserver/routes/StatusRouter.js';

beforeAll(async () => {
  (SimpleHttpClient as any).DEBUG_LOGGING = false;
});

beforeEach(async () => {
  container.clearInstances();

  container.registerInstance<DatabaseClient>(DatabaseClient, mockDeep<DatabaseClient>());
  container.registerInstance<AppConfiguration>(AppConfiguration, mockDeep<AppConfiguration>({
    config: {
      serverPort: 8087,
      proxyServerUris: '',
    },
  }));

  // We need to do this because tsyringe does not work with vitest – Hopefully we can get rid of this in the future ,_,
  container.registerInstance(ProxyPoolHttpClientHealthcheckTask, new ProxyPoolHttpClientHealthcheckTask(new QuestDbClient(container.resolve(AppConfiguration))));
  container.registerInstance(UnicastOnlyDnsResolver, new UnicastOnlyDnsResolver(new CachedDnsResolver(new DnsResolver())));

  const metrics = new Metrics();
  const autoProxiedHttpClient = new AutoProxiedHttpClient(
    new ProxyPoolHttpClient(
      new ProxyServerConfigurationProvider([]),
      new SocksProxyAgentFactory(
        container.resolve(UnicastOnlyDnsResolver),
        new SocksProxyServerConnector(),
      ),
      new CachedDnsResolver(new DnsResolver()),
      metrics,
    ),
    new SimpleHttpClient(new Metrics()),
  );
  const minecraftProfileService = new MinecraftProfileService(
    new MinecraftProfileCache(container.resolve(DatabaseClient)),
    new MinecraftApiClient(autoProxiedHttpClient),
    new ThirdPartyMinecraftApiClient(autoProxiedHttpClient),
    new ProfilePersister(container.resolve(DatabaseClient)),
    new ByPlayerProfileLazyPersister(
      new ProfilePersister(container.resolve(DatabaseClient)),
      new ProfileSeenNamePersister(container.resolve(DatabaseClient)),
      new LazyImportTaskCreator(container.resolve(DatabaseClient)),
    ),
  );
  container.registerInstance(MinecraftProfileService, minecraftProfileService);

  const minecraftV1Router = new MinecraftV1Router(
    minecraftProfileService,
    new MinecraftSkinService(
      autoProxiedHttpClient,
      new MinecraftSkinCache(container.resolve(DatabaseClient)),
      new MinecraftSkinNormalizer(),
      new SkinPersister(container.resolve(DatabaseClient)),
      new LazyImportTaskCreator(container.resolve(DatabaseClient)),
    ),
    new MinecraftSkinCache(container.resolve(DatabaseClient)),
    new SkinImage2DRenderer(),
    new UserCapeService(
      new CapeCache(container.resolve(DatabaseClient)),
      new UserCapeProvider([
        new MojangCapeProvider(
          autoProxiedHttpClient,
          new CapeCache(container.resolve(DatabaseClient)),
        ),
        new LabymodCapeProvider(autoProxiedHttpClient),
        new OptifineCapeProvider(autoProxiedHttpClient),
      ]),
      new CapePersister(container.resolve(DatabaseClient)),
      new ProfileSeenCapePersister(container.resolve(DatabaseClient)),
    ),
    new Cape2dRenderer(),
    new ServerBlocklistService(
      new FqdnValidator(),
      container.resolve(DatabaseClient),
      new ServerBlocklistPersister(container.resolve(DatabaseClient)),
    ),
    new MinecraftSkinTypeDetector(),
    new LegacyMinecraft3DRenderer(new MinecraftSkinNormalizer()),
  );
  container.registerInstance(FastifyWebServer,
    new FastifyWebServer(
      [
        new StatusRouter(),
        new MetricsRouter(metrics),
        minecraftV1Router,
      ],
      metrics,
    ),
  );

});
