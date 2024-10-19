import { injectAll, singleton } from 'tsyringe';
import CliCommand from './commands/CliCommand.js';

@singleton()
export default class CommandExecutor {
  constructor(
    @injectAll('CliCommand') private readonly cliCommands: CliCommand[]
  ) {
  }

  async run(args: string[]): Promise<boolean> {
    if (args.length === 0) {
      this.printCommandList();
      return true;
    }

    return this.handleExecuteCommand(args);
  }

  private async handleExecuteCommand(args: string[]): Promise<boolean> {
    const commandName = args[0];
    const command = this.cliCommands.find(cmd => cmd.commandName === commandName);
    if (command == null) {
      console.error(`Unknown command ${JSON.stringify(commandName)}`);
      return false;
    }

    return command.execute(args.slice(1));
  }

  private printCommandList(): void {
    console.log('Available commands:');
    for (const cmd of this.cliCommands) {
      console.log(`  ${cmd.commandUsage.replace(/\n/g, '\n  ')}`);
    }
  }
}
