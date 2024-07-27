import Fs from 'node:fs';
import Path from 'node:path';
import { singleton } from 'tsyringe';
import { APP_RESOURCES_DIR } from '../../../constants.js';
import { createCamera, createModel } from '../../../legacy-3d/modelRender.js';
import ImageManipulator from '../../image/ImageManipulator.js';

@singleton()
export default class LegacyMinecraft3DRenderer {
  private static readonly rendering = {
    cams: {
      block: function() {
        const cam = createCamera(256, 256);
        cam.setPosition({ x: -1.25, y: 1.25, z: -1.25 });
        cam.setRotation({ x: Math.PI / 4, y: Math.PI / 4, z: 0 });
        cam.setPostPosition({ x: 0, y: .145 });
        cam.setScale({ x: 2.5, y: 2.5 });

        return cam;
      }()
    },

    models: {
      block: createModel(Path.join(APP_RESOURCES_DIR, 'legacy-3d-models', 'block.obj'), 64, 64)
    }
  };

  async renderBlock(texture: ImageManipulator): Promise<ImageManipulator> {
    const cam = LegacyMinecraft3DRenderer.rendering.cams.block;
    const model = LegacyMinecraft3DRenderer.rendering.models.block;

    const rawTexture = await texture.toRaw();
    return new ImageManipulator(
      Buffer.from(cam.render(model, rawTexture.data)),
      {
        channels: 4,
        width: cam.width,
        height: cam.height
      });
  }
}
