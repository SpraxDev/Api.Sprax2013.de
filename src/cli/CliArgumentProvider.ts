import Mri from 'mri';
import { getAppInfo } from '../constants.js';

export type AppCommand = 'web' | 'queue-worker';
export type AppArguments = { command: AppCommand };

type ParsedCliArguments = {
  _: string[],
  help: boolean,
  version: boolean,
}

export default class CliArgumentProvider {
  private static readonly VALID_COMMANDS: AppCommand[] = ['web', 'queue-worker'];

  static determineAppArguments(): AppArguments {
    const parsedArgs = this.getParsedArgs();
    if (parsedArgs.help) {
      this.printHelp();
      process.exit(0);
    }
    if (parsedArgs.version) {
      this.printVersion();
      process.exit(0);
    }

    if (parsedArgs._.length === 0) {
      this.printHelp();
      process.exit(1);
    }
    if (parsedArgs._.length !== 1) {
      throw new Error('Expected exactly one command, but got ' + JSON.stringify(parsedArgs._));
    }

    return {
      command: this.toAppCommand(parsedArgs._[0])
    };
  }

  private static printHelp(): void {
    console.log(`Usage: sprax-api [--help | -h] [--version] <command> \n\n<command> is one of: ${this.VALID_COMMANDS.join(', ')}`);
  }

  private static printVersion(): void {
    const appInfo = getAppInfo();
    console.log(`${appInfo.name} v${appInfo.version}\n${appInfo.homepage}`);
  }

  private static getParsedArgs(): ParsedCliArguments {
    return Mri(process.argv.slice(2), {
      default: {
        help: false,
        version: false
      },
      alias: {
        help: 'h'
      },
      unknown(flag: string): void {
        console.error(`Unknown flag ${JSON.stringify(flag)}`);
        process.exit(1);
      }
    });
  }

  private static toAppCommand(command: unknown): AppCommand {
    if (typeof command !== 'string' || !this.VALID_COMMANDS.includes(command as any)) {
      throw new Error(`Command ${JSON.stringify(command)} is invalid – Expected one of ${this.VALID_COMMANDS.join(', ')}`);
    }

    return command as AppCommand;
  }
}
