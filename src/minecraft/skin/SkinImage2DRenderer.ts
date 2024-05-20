import ImageManipulator from './ImageManipulator.js';
import SkinImageManipulator from './SkinImageManipulator.js';

export default class SkinImage2DRenderer {
  async extractHead(skin: SkinImageManipulator, renderOverlay: boolean): Promise<ImageManipulator> {
    const renderedHead = await ImageManipulator.createEmpty(8, 8);

    renderedHead.drawSubImg(skin, 8, 8, 8, 8, 0, 0, true);
    if (renderOverlay) {
      renderedHead.drawSubImg(skin, 40, 8, 8, 8, 0, 0, false, 'add');
    }

    return renderedHead;
  }

  async extractBody(skin: SkinImageManipulator, renderOverlay: boolean, useSlimArms: boolean): Promise<ImageManipulator> {
    const renderedBody = await ImageManipulator.createEmpty(16, 32);
    const armWidth = useSlimArms ? 3 : 4;
    const xOffset = useSlimArms ? 1 : 0;

    renderedBody.drawSubImg(skin, 8, 8, 8, 8, 4, 0, true);  // Head
    renderedBody.drawSubImg(skin, 20, 20, 8, 12, 4, 8, true); // Body
    renderedBody.drawSubImg(skin, 44, 20, armWidth, 12, 0 + xOffset, 8, true);  // Right arm
    renderedBody.drawSubImg(skin, 36, 52, armWidth, 12, 12, 8, true); // Left arm
    renderedBody.drawSubImg(skin, 4, 20, 4, 12, 4, 20, true); // Right leg
    renderedBody.drawSubImg(skin, 20, 52, 4, 12, 8, 20, true);  // Left leg

    if (renderOverlay) {
      renderedBody.drawSubImg(skin, 40, 8, 8, 8, 4, 0, false, 'add'); // Head
      renderedBody.drawSubImg(skin, 20, 36, 8, 12, 4, 8, false, 'add'); // Body
      renderedBody.drawSubImg(skin, 44, 36, armWidth, 12, 0 + xOffset, 8, false, 'add');  // Right arm
      renderedBody.drawSubImg(skin, 52, 52, armWidth, 12, 12, 8, false, 'add'); // Left arm
      renderedBody.drawSubImg(skin, 4, 36, 4, 12, 4, 20, false, 'add'); // Right leg
      renderedBody.drawSubImg(skin, 4, 52, 4, 12, 8, 20, false, 'add'); // Left leg
    }

    return renderedBody;
  }
}
