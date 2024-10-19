export default interface CliCommand {
  get commandName(): string;

  get commandUsage(): string;

  execute(args: string[]): Promise<boolean> | boolean;
}
