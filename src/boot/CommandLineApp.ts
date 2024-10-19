import { container } from 'tsyringe';
import CliArgumentProvider from '../cli/CliArgumentProvider.js';
import CommandExecutor from '../cli/CommandExecutor.js';
import App from './App.js';

export default class CommandLineApp implements App {
  async boot(): Promise<void> {
    const commandResult = await container
      .resolve(CommandExecutor)
      .run(CliArgumentProvider.determineLeftoverArgs());

    process.exitCode = commandResult ? 0 : 1;

    await container.dispose();  // TODO: We don't have a good way to trigger a graceful shutdown
                                //       disposing the container *should* make sure pending stuff is shut down properly
                                //       This is just a failsafe, just in case commands leak resources
  }

  async shutdown(): Promise<void> {
    // nothing to explicitly shut down here
  }
}
