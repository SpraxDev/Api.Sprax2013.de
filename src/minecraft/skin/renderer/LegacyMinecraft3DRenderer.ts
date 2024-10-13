import Path from 'node:path';
import { singleton } from 'tsyringe';
import { APP_RESOURCES_DIR } from '../../../constants.js';
import ImageManipulator from '../../image/ImageManipulator.js';
import MinecraftSkinNormalizer from '../manipulator/MinecraftSkinNormalizer.js';
import SkinImageManipulator from '../manipulator/SkinImageManipulator.js';
import { Camera, createCamera, createModel, Model } from './legacy-3d/modelRender.js';

@singleton()
export default class LegacyMinecraft3DRenderer {
  private static readonly rendering = {
    cams: {
      body: function() {
        const cam = createCamera(525, 960);
        cam.setPosition({ x: -0.75, y: 2.1, z: -1.25 });
        cam.setRotation({ x: Math.PI / 12, y: Math.PI / 6, z: 0 });
        cam.setPostPosition({ x: 0.023, y: -0.380625 });
        cam.setScale({ x: 1.645, y: 1.645 });

        return cam;
      }(),
      bodyNoOverlay: function() {
        const cam = createCamera(510, 960);
        cam.setPosition({ x: -0.75, y: 2.1, z: -1.25 });
        cam.setRotation({ x: Math.PI / 12, y: Math.PI / 6, z: 0 });
        cam.setPostPosition({ x: 0.023, y: -0.39 });
        cam.setScale({ x: 1.6675, y: 1.6675 });

        return cam;
      }(),

      head: function() {
        const cam = createCamera(1040, 960);
        cam.setPosition({ x: -0.75, y: 2.1, z: -1.25 });
        cam.setRotation({ x: Math.PI / 12, y: Math.PI / 6, z: 0 });
        cam.setPostPosition({ x: -0.0335, y: -0.025 });
        cam.setScale({ x: 3.975, y: 3.975 });

        return cam;
      }(),
      headNoOverlay: function() {
        const cam = createCamera(1035, 960);
        cam.setPosition({ x: -0.75, y: 2.1, z: -1.25 });
        cam.setRotation({ x: Math.PI / 12, y: Math.PI / 6, z: 0 });
        cam.setPostPosition({ x: -0.0295, y: -0.013 });
        cam.setScale({ x: 4.49, y: 4.49 });

        return cam;
      }(),

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
      modelAlex: createModel(Path.join(APP_RESOURCES_DIR, 'legacy-3d-models', 'alex.obj'), 64, 64),
      modelAlexNoOverlay: createModel(Path.join(APP_RESOURCES_DIR, 'legacy-3d-models', 'alexNoOverlay.obj'), 64, 64),
      modelSteve: createModel(Path.join(APP_RESOURCES_DIR, 'legacy-3d-models', 'steve.obj'), 64, 64),
      modelSteveNoOverlay: createModel(Path.join(APP_RESOURCES_DIR, 'legacy-3d-models', 'steveNoOverlay.obj'), 64, 64),
      modelSteveHead: createModel(Path.join(APP_RESOURCES_DIR, 'legacy-3d-models', 'steveHead.obj'), 64, 64),
      modelSteveHeadNoOverlay: createModel(Path.join(APP_RESOURCES_DIR, 'legacy-3d-models', 'steveHeadNoOverlay.obj'), 64, 64),

      block: createModel(Path.join(APP_RESOURCES_DIR, 'legacy-3d-models', 'block.obj'), 64, 64)
    }
  };

  constructor(
    private readonly skinNormalizer: MinecraftSkinNormalizer
  ) {
  }

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

  async renderSkin(skinTexture: SkinImageManipulator, area: 'head' | 'body', overlay: boolean, alex: boolean): Promise<ImageManipulator> {
    const normalizedTexture = await this.skinNormalizer.normalizeSkin(skinTexture);
    this.skinNormalizer.enforceMinMaxAlphaOnSecondLayer(normalizedTexture);

    let cam: Camera;
    let model: Model;

    if (area === 'body') {
      if (overlay) {
        cam = LegacyMinecraft3DRenderer.rendering.cams.body;
        model = alex ? LegacyMinecraft3DRenderer.rendering.models.modelAlex : LegacyMinecraft3DRenderer.rendering.models.modelSteve;
      } else {
        cam = LegacyMinecraft3DRenderer.rendering.cams.bodyNoOverlay;
        model = alex ? LegacyMinecraft3DRenderer.rendering.models.modelAlexNoOverlay : LegacyMinecraft3DRenderer.rendering.models.modelSteveNoOverlay;
      }
    } else {
      cam = overlay ? LegacyMinecraft3DRenderer.rendering.cams.head : LegacyMinecraft3DRenderer.rendering.cams.headNoOverlay;
      model = overlay ? LegacyMinecraft3DRenderer.rendering.models.modelSteveHead : LegacyMinecraft3DRenderer.rendering.models.modelSteveHeadNoOverlay;
    }

    const rawSkinTexture = await normalizedTexture.toRaw();
    return new ImageManipulator(
      Buffer.from(cam.render(model, rawSkinTexture.data)),
      {
        channels: 4,
        width: cam.width,
        height: cam.height
      }
    );
  }
}
