import { singleton } from 'tsyringe';
import SkinImageManipulator from './manipulator/SkinImageManipulator.js';

export type SkinType = 'steve' | 'alex';

@singleton()
export default class MinecraftSkinTypeDetector {
  detect(skin: SkinImageManipulator): SkinType {
    if (skin.getColor(55, 20).alpha === 0) {
      return 'alex';
    }
    return 'steve';
  }
}
