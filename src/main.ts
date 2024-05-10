import 'reflect-metadata';
import SentrySdk from './SentrySdk.js';

await bootstrap();

async function bootstrap(): Promise<void> {
  await SentrySdk.init();
  registerShutdownHooks();
}

function registerShutdownHooks(): void {
  const handleShutdown = async () => {
    console.log('Shutting down...');

    await SentrySdk.shutdown();

    console.log('Finished graceful shutdown.');
    process.exit(0);
  };

  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
  process.on('SIGQUIT', handleShutdown);
  process.on('SIGHUP', handleShutdown);
}
