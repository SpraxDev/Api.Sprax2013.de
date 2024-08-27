import Sharp from 'sharp';
import ImageManipulator, { Color } from '../../../../src/minecraft/image/ImageManipulator.js';
import { readTestResource } from '../../../resources/resources.js';

describe('static methods', () => {
  test.each([
    [{ r: 0, g: 0, b: 0, alpha: 0 }, { r: 0, g: 0, b: 0, alpha: 0 }, { r: 0, g: 0, b: 0, alpha: 0 }],
    [{ r: 0, g: 0, b: 0, alpha: 0 }, { r: 255, g: 255, b: 255, alpha: 255 }, { r: 255, g: 255, b: 255, alpha: 255 }],
    [{ r: 255, g: 255, b: 255, alpha: 255 }, { r: 0, g: 0, b: 0, alpha: 0 }, { r: 255, g: 255, b: 255, alpha: 255 }]
  ])('#mergeColors', async (a: Color, b: Color, expected: Color) => {
    expect(ImageManipulator.mergeColors(a, b)).toEqual(expected);
  });

  test('#createEmpty', async () => {
    const image = await ImageManipulator.createEmpty(2, 2);

    expect(image.width).toBe(2);
    expect(image.height).toBe(2);
    expect(image.channels).toBe(4);

    const rawImage = await image.toRaw();

    expect(rawImage.info.width).toBe(2);
    expect(rawImage.info.height).toBe(2);
    expect(rawImage.info.channels).toBe(4);
    expect(rawImage.info.format).toBe('raw');

    expect(rawImage.data).toEqual(Buffer.alloc(16));
  });

  test('#createByImage', async () => {
    const testImageBytes = await readTestResource('rgb-test.png');
    expect((await Sharp(testImageBytes).metadata()).channels).toBe(3);

    const image = await ImageManipulator.createByImage(testImageBytes);

    expect(image.width).toBe(2);
    expect(image.height).toBe(2);
    expect(image.channels).toBe(4);

    const rawImage = await image.toRaw();

    expect(rawImage.info.width).toBe(2);
    expect(rawImage.info.height).toBe(2);
    expect(rawImage.info.channels).toBe(4);
    expect(rawImage.info.format).toBe('raw');

    expect(rawImage.data).toEqual(Buffer.from([
      0x00, 0x00, 0x00, 0xff,
      0xff, 0xff, 0xff, 0xff,
      0xff, 0xff, 0x00, 0xff,
      0x00, 0x00, 0xff, 0xff
    ]));
  });
});

describe('accessing individual pixels', () => {
  test('#getColor', async () => {
    const image = await ImageManipulator.createByImage(await readTestResource('rgb-test.png'));

    expect(image.getColor(0, 0)).toEqual({ r: 0, g: 0, b: 0, alpha: 255 });
    expect(image.getColor(1, 0)).toEqual({ r: 255, g: 255, b: 255, alpha: 255 });
    expect(image.getColor(0, 1)).toEqual({ r: 255, g: 255, b: 0, alpha: 255 });
    expect(image.getColor(1, 1)).toEqual({ r: 0, g: 0, b: 255, alpha: 255 });
  });

  test('#setColor', async () => {
    const image = await ImageManipulator.createEmpty(2, 2);

    image.setColor(0, 0, { r: 0, g: 0, b: 0, alpha: 255 });
    image.setColor(1, 0, { r: 255, g: 255, b: 255, alpha: 255 });
    image.setColor(0, 1, { r: 255, g: 255, b: 0, alpha: 255 });
    image.setColor(1, 1, { r: 0, g: 0, b: 255, alpha: 255 });

    const rawImage = await image.toRaw();

    expect(rawImage.info.width).toBe(2);
    expect(rawImage.info.height).toBe(2);
    expect(rawImage.info.channels).toBe(4);

    expect(rawImage.data).toEqual(Buffer.from([
      0x00, 0x00, 0x00, 0xff,
      0xff, 0xff, 0xff, 0xff,
      0xff, 0xff, 0x00, 0xff,
      0x00, 0x00, 0xff, 0xff
    ]));
  });

  test('#getColor fails if coordinates are out of bounds', async () => {
    const image = await ImageManipulator.createEmpty(2, 2);

    expect(() => image.getColor(-1, 0)).toThrow();
    expect(() => image.getColor(0, -1)).toThrow();
    expect(() => image.getColor(2, 0)).toThrow();
    expect(() => image.getColor(0, 2)).toThrow();
  });

  test('#setColor fails if coordinates are out of bounds', async () => {
    const image = await ImageManipulator.createEmpty(2, 2);

    expect(() => image.setColor(-1, 0, { r: 0, g: 0, b: 0, alpha: 255 })).toThrow();
    expect(() => image.setColor(0, -1, { r: 0, g: 0, b: 0, alpha: 255 })).toThrow();
    expect(() => image.setColor(2, 0, { r: 0, g: 0, b: 0, alpha: 255 })).toThrow();
    expect(() => image.setColor(0, 2, { r: 0, g: 0, b: 0, alpha: 255 })).toThrow();
  });
});

describe('drawing rectangles', () => {
  test('#drawRect', async () => {
    const image = await ImageManipulator.createEmpty(2, 2);

    image.drawRect(0, 0, 2, 1, { r: 255, g: 0, b: 0, alpha: 255 });
    image.drawRect(0, 1, 2, 1, { r: 0, g: 0, b: 255, alpha: 255 });

    const rawImage = await image.toRaw();

    expect(rawImage.info.width).toBe(2);
    expect(rawImage.info.height).toBe(2);
    expect(rawImage.info.channels).toBe(4);

    expect(rawImage.data).toEqual(Buffer.from([
      0xff, 0x00, 0x00, 0xff,
      0xff, 0x00, 0x00, 0xff,
      0x00, 0x00, 0xff, 0xff,
      0x00, 0x00, 0xff, 0xff
    ]));
  });

  test('#drawRect fails if coordinates are out of bounds', async () => {
    const image = await ImageManipulator.createEmpty(2, 2);

    expect(() => image.drawRect(-1, 0, 1, 1, { r: 255, g: 0, b: 0, alpha: 255 })).toThrow();
    expect(() => image.drawRect(0, 0, 1, 3, { r: 255, g: 0, b: 0, alpha: 255 })).toThrow();
    expect(() => image.drawRect(0, 3, 1, 1, { r: 255, g: 0, b: 0, alpha: 255 })).toThrow();
  });
});

describe('drawing with images', () => {
  test('#drawImage', async () => {
    const image = await ImageManipulator.createEmpty(2, 2);

    const testImageBytes = await readTestResource('rgb-test.png');
    const testImage = await ImageManipulator.createByImage(testImageBytes);

    image.drawImage(testImage, 0, 0);

    const rawImage = await image.toRaw();
    expect(rawImage.data).toEqual(Buffer.from([
      0x00, 0x00, 0x00, 0xff,
      0xff, 0xff, 0xff, 0xff,
      0xff, 0xff, 0x00, 0xff,
      0x00, 0x00, 0xff, 0xff
    ]));
  });

  test('#drawImage fails if source image is bigger than the destination', async () => {
    const image = await ImageManipulator.createEmpty(1, 1);

    const testImageBytes = await readTestResource('rgb-test.png');
    const testImage = await ImageManipulator.createByImage(testImageBytes);

    expect(() => image.drawImage(testImage, 0, 0)).toThrow();
  });

  test.each(
    [
      ['replace', true],
      ['replace', false],
      ['replace', undefined],
      ['add', true],
      ['add', false],
      ['add', undefined],
      [undefined, true],
      [undefined, false],
      [undefined, undefined]
    ] satisfies (['replace' | 'add' | undefined, boolean | undefined])[]
  )('#drawSubImg with mode=%j and ignoreAlpha=%j', async (mode: 'replace' | 'add' | undefined, ignoreAlpha: boolean | undefined) => {
    const image = await ImageManipulator.createEmpty(2, 2);

    const testImageBytes = await readTestResource('rgb-test.png');
    const testImage = await ImageManipulator.createByImage(testImageBytes);

    image.drawSubImg(testImage, 0, 0, 2, 1, 0, 1, ignoreAlpha, mode);
    image.drawSubImg(testImage, 0, 1, 2, 1, 0, 0, ignoreAlpha, mode);

    const rawImage = await image.toRaw();
    expect(rawImage.data).toEqual(Buffer.from([
      0xff, 0xff, 0x00, 0xff,
      0x00, 0x00, 0xff, 0xff,
      0x00, 0x00, 0x00, 0xff,
      0xff, 0xff, 0xff, 0xff
    ]));
  });

  test('#drawSubImageFlipped', async () => {
    const image = await ImageManipulator.createEmpty(2, 2);

    const testImageBytes = await readTestResource('rgb-test.png');
    const testImage = await ImageManipulator.createByImage(testImageBytes);

    image.drawSubImageFlipped(testImage, 0, 0, 2, 1, 0, 1);
    image.drawSubImageFlipped(testImage, 0, 1, 2, 1, 0, 0);

    const rawImage = await image.toRaw();
    expect(rawImage.data).toEqual(Buffer.from([
      0x00, 0x00, 0xff, 0xff,
      0xff, 0xff, 0x00, 0xff,
      0xff, 0xff, 0xff, 0xff,
      0x00, 0x00, 0x00, 0xff
    ]));
  });
});

describe('#toPngBuffer', () => {
  test('#toPngBuffer', async () => {
    const testImageBytes = await readTestResource('rgb-test.png');
    const testImage = await ImageManipulator.createByImage(testImageBytes);

    const expectedPixelData = (await testImage.toRaw()).data;

    const pngBuffer = await testImage.toPngBuffer();
    const pngMetadata = await Sharp(pngBuffer).metadata();

    expect(pngMetadata.width).toBe(2);
    expect(pngMetadata.height).toBe(2);
    expect(pngMetadata.channels).toBe(4);
    expect(pngMetadata.format).toBe('png');

    expect((await (await ImageManipulator.createByImage(pngBuffer)).toRaw()).data).toEqual(expectedPixelData);
  });

  test('#toPngBuffer with resizing (downscaling, same aspect ratio)', async () => {
    const testImageBytes = await readTestResource('rgb-test.png');
    const testImage = await ImageManipulator.createByImage(testImageBytes);

    const pngBuffer = await testImage.toPngBuffer({ width: 1, height: 1 });
    const pngMetadata = await Sharp(pngBuffer).metadata();

    expect(pngMetadata.width).toBe(1);
    expect(pngMetadata.height).toBe(1);
    expect(pngMetadata.channels).toBe(4);
    expect(pngMetadata.format).toBe('png');
  });

  test('#toPngBuffer with resizing (upscaling, same aspect ratio)', async () => {
    const testImageBytes = await readTestResource('rgb-test.png');
    const testImage = await ImageManipulator.createByImage(testImageBytes);

    const pngBuffer = await testImage.toPngBuffer({ width: 4, height: 4 });
    const pngMetadata = await Sharp(pngBuffer).metadata();

    expect(pngMetadata.width).toBe(4);
    expect(pngMetadata.height).toBe(4);
    expect(pngMetadata.channels).toBe(4);
    expect(pngMetadata.format).toBe('png');
  });

  test('#toPngBuffer with resizing with different aspect ratio chooses dimensions that fit', async () => {
    const testImageBytes = await readTestResource('rgb-test.png');
    const testImage = await ImageManipulator.createByImage(testImageBytes);

    const pngBuffer = await testImage.toPngBuffer({ width: 14, height: 8 });
    const pngMetadata = await Sharp(pngBuffer).metadata();

    expect(pngMetadata.width).toBe(14);
    expect(pngMetadata.height).toBe(14);
    expect(pngMetadata.channels).toBe(4);
    expect(pngMetadata.format).toBe('png');
  });
});
