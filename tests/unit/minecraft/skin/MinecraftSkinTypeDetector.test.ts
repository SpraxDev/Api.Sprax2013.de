import Fs from 'node:fs';
import Path from 'node:path';
import { APP_RESOURCES_DIR } from '../../../../src/constants.js';
import SkinImageManipulator from '../../../../src/minecraft/skin/manipulator/SkinImageManipulator.js';
import MinecraftSkinTypeDetector from '../../../../src/minecraft/skin/MinecraftSkinTypeDetector.js';

describe('MinecraftSkinTypeDetector', () => {
  test('Detects Steve skins', async () => {
    const skinPng = await Fs.promises.readFile(Path.join(APP_RESOURCES_DIR, 'steve.png'));
    const skin = await SkinImageManipulator.createByImage(skinPng);

    expect(new MinecraftSkinTypeDetector().detect(skin)).toBe('steve');
  });

  test('Detects Alex skins', async () => {
    const skinPng = await Fs.promises.readFile(Path.join(APP_RESOURCES_DIR, 'alex.png'));
    const skin = await SkinImageManipulator.createByImage(skinPng);

    expect(new MinecraftSkinTypeDetector().detect(skin)).toBe('alex');
  });
});
