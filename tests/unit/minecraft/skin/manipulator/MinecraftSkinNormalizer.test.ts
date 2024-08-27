import Fs from 'node:fs';
import ImageManipulator from '../../../../../src/minecraft/image/ImageManipulator.js';
import MinecraftSkinNormalizer from '../../../../../src/minecraft/skin/manipulator/MinecraftSkinNormalizer.js';
import SkinImageManipulator from '../../../../../src/minecraft/skin/manipulator/SkinImageManipulator.js';
import { readTestResource } from '../../../../resources/resources.js';

describe('MinecraftSkinNormalizer', () => {
  test('properly upgrade legacy skin', async () => {
    const legacySkin = await SkinImageManipulator.createByImage(await readTestResource('skins/legacy.png'));
    const normalizedSkin = await new MinecraftSkinNormalizer().normalizeSkin(legacySkin);
    const normalizedSkinBuffer = await normalizedSkin.toRaw();

    const expectedImage = await (await ImageManipulator.createByImage(await readTestResource('skins/legacy-normalized.png'))).toRaw();
    expect(normalizedSkinBuffer.info).toEqual(expectedImage.info);
    expect(normalizedSkinBuffer.data).toEqual(expectedImage.data);
  });

  test.each([
    ['legacy-normalized.png'],
    ['modern-2nd-layer-normalized.png'],
    ['modern-red-transparent-overlay.png']
  ])('normalizing an already normalized skin changes nothing', async (fileName: string) => {
    const skinBytes = await readTestResource(`skins/${fileName}`);
    const expectedImage = await (await ImageManipulator.createByImage(skinBytes)).toRaw();

    const normalizedSkin = await new MinecraftSkinNormalizer().normalizeSkin(await SkinImageManipulator.createByImage(skinBytes));
    const normalizedSkinBuffer = await normalizedSkin.toRaw();

    expect(normalizedSkinBuffer.info).toEqual(expectedImage.info);
    expect(normalizedSkinBuffer.data).toEqual(expectedImage.data);
  });

  test('Fully transparent 64x64 skin is turned into black skin without second layer', async () => {
    const inputSkin = await ImageManipulator.createEmpty(64, 64);
    inputSkin.drawRect(0, 0, 64, 64, { r: 0, g: 0, b: 0, alpha: 0 });
    const inputSkinBytes = await inputSkin.toPngBuffer();

    const normalizedSkin = await new MinecraftSkinNormalizer().normalizeSkin(await SkinImageManipulator.createByImage(inputSkinBytes));
    const normalizedSkinBuffer = await normalizedSkin.toRaw();

    await Fs.promises.writeFile('/tmp/_normalized-skin.png', (await normalizedSkin.toPngBuffer()));

    const expectedSkin = await (await ImageManipulator.createByImage(await readTestResource('skins/legacy-black-normalized.png'))).toRaw();
    expect(normalizedSkinBuffer.info).toEqual(expectedSkin.info);
    expect(normalizedSkinBuffer.data).toEqual(expectedSkin.data);
  });

  test.each([64, 32])('Fully transparent skin is turned into black skin without second layer (64x%j px)', async (height: number) => {
    const inputSkin = await ImageManipulator.createEmpty(64, height);
    inputSkin.drawRect(0, 0, 64, height, { r: 0, g: 0, b: 0, alpha: 0 });
    const inputSkinBytes = await inputSkin.toPngBuffer();

    const normalizedSkin = await new MinecraftSkinNormalizer().normalizeSkin(await SkinImageManipulator.createByImage(inputSkinBytes));
    const normalizedSkinBuffer = await normalizedSkin.toRaw();

    const expectedSkin = await (await ImageManipulator.createByImage(await readTestResource('skins/legacy-black-normalized.png'))).toRaw();
    expect(normalizedSkinBuffer.info).toEqual(expectedSkin.info);
    expect(normalizedSkinBuffer.data).toEqual(expectedSkin.data);
  });

  test('Unneeded parts of skins are removed (64x64 black)', async () => {
    const inputSkin = await ImageManipulator.createEmpty(64, 64);
    inputSkin.drawRect(0, 0, 64, 64, { r: 255, g: 0, b: 0, alpha: 255 });
    const inputSkinBytes = await inputSkin.toPngBuffer();

    const normalizedSkin = await new MinecraftSkinNormalizer().normalizeSkin(await SkinImageManipulator.createByImage(inputSkinBytes));
    const normalizedSkinBuffer = await normalizedSkin.toRaw();

    const expectedSkin = await (await ImageManipulator.createByImage(await readTestResource('skins/modern-red-normalized.png'))).toRaw();
    expect(normalizedSkinBuffer.info).toEqual(expectedSkin.info);
    expect(normalizedSkinBuffer.data).toEqual(expectedSkin.data);
  });

  test('Unneeded parts of skins are removed after upgrading', async () => {
    const inputSkin = await ImageManipulator.createEmpty(64, 32);
    inputSkin.drawRect(0, 0, 64, 32, { r: 255, g: 0, b: 0, alpha: 255 });
    const inputSkinBytes = await inputSkin.toPngBuffer();

    const normalizedSkin = await new MinecraftSkinNormalizer().normalizeSkin(await SkinImageManipulator.createByImage(inputSkinBytes));
    const normalizedSkinBuffer = await normalizedSkin.toRaw();

    const expectedSkin = await (await ImageManipulator.createByImage(await readTestResource('skins/legacy-red-normalized.png'))).toRaw();
    expect(normalizedSkinBuffer.info).toEqual(expectedSkin.info);
    expect(normalizedSkinBuffer.data).toEqual(expectedSkin.data);
  });

  test.each([64, 32])('Invisible pixels do not hold any color information (64x%j px)', async (height: number) => {
    const inputSkin = await ImageManipulator.createEmpty(64, height);
    inputSkin.drawRect(0, 0, 64, height, { r: 255, g: 0, b: 0, alpha: 0 });
    const inputSkinBytes = await inputSkin.toPngBuffer();

    const normalizedSkin = await new MinecraftSkinNormalizer().normalizeSkin(await SkinImageManipulator.createByImage(inputSkinBytes));
    const normalizedSkinBuffer = await normalizedSkin.toRaw();

    const expectedSkin = await (await ImageManipulator.createByImage(await readTestResource('skins/legacy-black-normalized.png'))).toRaw();
    expect(normalizedSkinBuffer.info).toEqual(expectedSkin.info);
    expect(normalizedSkinBuffer.data).toEqual(expectedSkin.data);
  });

  test('#enforceMinMaxAlphaOnSecondLayer sets alpha values accordingly', async () => {
    const inputSkinBytes = await readTestResource('skins/modern-red-transparent-overlay.png');
    const inputSkin = await SkinImageManipulator.createByImage(inputSkinBytes);
    new MinecraftSkinNormalizer().enforceMinMaxAlphaOnSecondLayer(inputSkin);

    const rawSkin = await inputSkin.toRaw();

    const expectedSkin = await (await ImageManipulator.createByImage(await readTestResource('skins/modern-red-normalized.png'))).toRaw();
    expect(rawSkin.info).toEqual(expectedSkin.info);
    expect(rawSkin.data).toEqual(expectedSkin.data);
  });

  test.each([
    [100, 100],
    [32, 32],
    [32, 64],
    [65, 65]
  ])('Expect error for invalid skin dimensions: (%j|%j)', async (width: number, height: number) => {
    const inputImage = await (await ImageManipulator.createEmpty(width, height)).toPngBuffer();
    await expect(SkinImageManipulator.createByImage(inputImage)).rejects.toThrow('Image does not have valid skin dimensions');
  });
});
