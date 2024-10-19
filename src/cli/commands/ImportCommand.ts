import Fs from 'node:fs';
import { singleton } from 'tsyringe';
import CliCommand from './CliCommand.js';

type ImportCommandArgs = {
  type: 'uuid' | 'username',
  filePath: string
};

@singleton()
export default class ImportCommand implements CliCommand {
  private readonly VALID_IMPORT_TYPES = ['uuid', 'username'];

  get commandName(): string {
    return 'import';
  }

  get commandUsage(): string {
    return 'import <type> <file>\n' +
      '  <type> is one of: ' + this.VALID_IMPORT_TYPES.join(', ');
  }

  async execute(args: string[]): Promise<boolean> {
    if (args.length !== 2) {
      console.error('Invalid number of arguments');
      console.error(`Usage: ${this.commandUsage}`);
      return false;
    }

    const parsedArgs = this.parseArgs(args);
    console.log(parsedArgs);
    // TODO: implement import
    return true;
  }

  private parseArgs(args: string[]): ImportCommandArgs {
    if (!['uuid', 'username'].includes(args[0])) {
      throw new Error(`Invalid import type ${JSON.stringify(args[0])} – Expected one of [${this.VALID_IMPORT_TYPES.join(', ')}]`);
    }
    if (!Fs.existsSync(args[1])) {
      throw new Error(`File ${JSON.stringify(args[1])} does not exist`);
    }

    return {
      type: args[0] as ImportCommandArgs['type'],
      filePath: args[1]
    };
  }
}
