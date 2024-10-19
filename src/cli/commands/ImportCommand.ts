import Fs from 'node:fs';
import { singleton } from 'tsyringe';
import BulkQueueImporter from '../../import_queue/bulk/BulkQueueImporter.js';
import CliCommand from './CliCommand.js';

type ImportCommandArgs = {
  type: 'uuid',
  filePath: string,
  apiKeyId: bigint
};

@singleton()
export default class ImportCommand implements CliCommand {
  private readonly VALID_IMPORT_TYPES = ['uuid'] satisfies ImportCommandArgs['type'][];

  constructor(
    private readonly bulkQueueImporter: BulkQueueImporter
  ) {
  }

  get commandName(): string {
    return 'import';
  }

  get commandUsage(): string {
    return 'import <type> <file> <apiKeyId>\n' +
      `    <type> is one of: ${this.VALID_IMPORT_TYPES.join(', ')}\n` +
      '    <file> is the path to the file to import\n' +
      '    <apiKeyId> is the numeric ID of the API key to use for this import';
  }

  async execute(args: string[]): Promise<boolean> {
    if (args.length !== 3) {
      console.error('Invalid number of arguments');
      console.error(`Usage: ${this.commandUsage}`);
      return false;
    }

    const parsedArgs = this.parseArgs(args);

    const result = await this.bulkQueueImporter.importEachLine(parsedArgs.filePath, parsedArgs.type, parsedArgs.apiKeyId);
    console.log('\nFinished adding everything to the import queue:');
    console.log(result);
    return true;
  }

  private parseArgs(args: string[]): ImportCommandArgs {
    if (!['uuid', 'username'].includes(args[0])) {
      throw new Error(`Invalid import type ${JSON.stringify(args[0])} – Expected one of [${this.VALID_IMPORT_TYPES.join(', ')}]`);
    }
    if (args[1].length === 0 || !Fs.existsSync(args[1])) {
      throw new Error(`File ${JSON.stringify(args[1])} does not exist`);
    }
    if (!/^[0-9]+$/.test(args[2])) {
      throw new Error(`Invalid apiKeyId ${JSON.stringify(args[2])} – Expected a number`);
    }

    return {
      type: args[0] as ImportCommandArgs['type'],
      filePath: args[1],
      apiKeyId: BigInt(args[2])
    };
  }
}
