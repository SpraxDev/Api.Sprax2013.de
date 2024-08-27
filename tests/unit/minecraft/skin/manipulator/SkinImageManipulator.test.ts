import ImageManipulator from '../../../../../src/minecraft/image/ImageManipulator.js';
import SkinImageManipulator from '../../../../../src/minecraft/skin/manipulator/SkinImageManipulator.js';

describe('static methods', () => {
  test('#createEmpty returns a 64x64 pixel image with 4 channels', async () => {
    const image = await SkinImageManipulator.createEmpty();

    expect(image.width).toBe(64);
    expect(image.height).toBe(64);
    expect(image.channels).toBe(4);

    const rawImage = await image.toRaw();

    expect(rawImage.info.width).toBe(64);
    expect(rawImage.info.height).toBe(64);
    expect(rawImage.info.channels).toBe(4);
    expect(rawImage.info.format).toBe('raw');

    expect(rawImage.data).toEqual(Buffer.alloc(64 * 64 * 4));
  });

  test.each([
    [32, 64],
    [100, 100]
  ])('#createByImage fails for images with wrong dimensions (%jx%j px)', async (width: number, height: number) => {
    const image = await ImageManipulator.createEmpty(width, height);
    const imageBytes = await image.toPngBuffer();

    await expect(SkinImageManipulator.createByImage(imageBytes)).rejects.toThrow();
  });

  test.each([
    [64, 32],
    [64, 64]
  ])('#createByImage succeeds for images with correct dimensions (%jx%j px)', async (width: number, height: number) => {
    const image = await ImageManipulator.createEmpty(width, height);
    const imageBytes = await image.toPngBuffer();

    const skinImage = await SkinImageManipulator.createByImage(imageBytes);
    const skinImageRaw = await skinImage.toRaw();

    expect(skinImage.width).toBe(width);
    expect(skinImage.height).toBe(height);
    expect(skinImage.channels).toBe(4);

    expect(skinImageRaw.info.width).toBe(width);
    expect(skinImageRaw.info.height).toBe(height);
    expect(skinImageRaw.info.channels).toBe(4);
    expect(skinImageRaw.info.format).toBe('raw');
  });
});
