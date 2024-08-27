import Fs from 'node:fs';
import Path from 'node:path';

export const TEST_RESOURCES_DIR = new URL('../resources', import.meta.url).pathname;

export async function readTestResource(path: string): Promise<Buffer> {
  return Fs.promises.readFile(Path.join(TEST_RESOURCES_DIR, path));
}
