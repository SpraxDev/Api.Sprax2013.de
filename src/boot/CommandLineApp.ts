import { container } from 'tsyringe';
import CliArgumentProvider from '../cli/CliArgumentProvider.js';
import CommandExecutor from '../cli/CommandExecutor.js';
import TaskScheduler from '../task_queue/TaskScheduler.js';
import App from './App.js';

export default class CommandLineApp implements App {
  private taskScheduler: TaskScheduler | undefined;

  async boot(): Promise<void> {
    this.taskScheduler = container.resolve(TaskScheduler);
    this.taskScheduler.start(false);

    const commandResult = await container
      .resolve(CommandExecutor)
      .run(CliArgumentProvider.determineLeftoverArgs());

    process.exitCode = commandResult ? 0 : 1;

    await container.dispose();  // TODO: We don't have a good way to trigger a graceful shutdown
                                //       disposing the container *should* make sure pending stuff is shut down properly
                                //       This is just a failsafe, just in case commands leak resources
  }

  async shutdown(): Promise<void> {
    this.taskScheduler?.dispose();
    this.taskScheduler = undefined;
  }
}
