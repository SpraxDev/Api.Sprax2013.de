import { singleton } from 'tsyringe';
import DatabaseClient from '../../database/DatabaseClient.js';
import MinecraftProfileService from '../../minecraft/profile/MinecraftProfileService.js';
import CliCommand from './CliCommand.js';

@singleton()
export default class CreateInternalApiKeyCommand implements CliCommand {
  private readonly INTERNAL_API_KEY_OWNER = '955e4cf6411c40d1a1765bc8e03a8a9a'; // SpraxDev

  constructor(
    private readonly databaseClient: DatabaseClient,
    private readonly minecraftProfileService: MinecraftProfileService
  ) {
  }

  get commandName(): string {
    return 'create-internal-api-key';
  }

  get commandUsage(): string {
    return 'create-internal-api-key <name>';
  }

  async execute(args: string[]): Promise<boolean> {
    if (args.length !== 1) {
      console.error('Invalid number of arguments');
      console.error(`Usage: ${this.commandUsage}`);
      return false;
    }

    const parsedArgs = this.parseArgs(args);

    await this.ensureApiKeyOwnerExists();

    const apiKey = await this.databaseClient.apiKey.create({
      data: {
        name: parsedArgs.name,
        ownerId: this.INTERNAL_API_KEY_OWNER,
        internal: true
      }
    });
    console.log(`Created new API key (id=${apiKey.id}) with name ${JSON.stringify(apiKey.name)}:`);
    console.log(`spraxapi.${apiKey.key.toString('hex')}`);

    return true;
  }

  private async ensureApiKeyOwnerExists(): Promise<void> {
    const cachedProfile = await this.databaseClient.profileCache.findUnique({
      where: { id: this.INTERNAL_API_KEY_OWNER },
      select: { id: true }
    });
    if (cachedProfile == null) {
      await this.minecraftProfileService.provideProfileByUuid(this.INTERNAL_API_KEY_OWNER);
    }
  }

  private parseArgs(args: string[]): { name: string } {
    if (args[0].length === 0) {
      throw new Error(`Invalid name ${JSON.stringify(args[0])} – Expected non-empty string`);
    }

    return {
      name: args[0]
    };
  }
}
