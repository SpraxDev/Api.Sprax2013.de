import tf = require('@tensorflow/tfjs-node');
import { Canvas, CanvasRenderingContext2D, createCanvas, Image, loadImage } from 'canvas';
import { readFileSync } from 'fs';
import { join as joinPath } from 'path';

export class AiModel {
  private readonly canvas: Canvas;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly camera: Camera;

  // noinspection TypeScriptFieldCanBeMadeReadonly
  private modelDir?: string;

  private model?: tf.LayersModel;
  readonly metadata: { name: string, labels: string[], modelRevision: number };

  constructor(modelDir: string) {
    this.modelDir = modelDir;

    const metaJson = JSON.parse(readFileSync(joinPath(this.modelDir, 'metadata.json'), 'utf-8'));
    if (typeof metaJson.modelRevision != 'number') throw new Error('Model metadata.json is missing property modelRevision (number)');

    this.metadata = {
      name: metaJson.name,
      labels: metaJson.labels,
      modelRevision: metaJson.modelRevision
    };

    this.canvas = createCanvas(224, 224);
    this.camera = new Camera(this.canvas);

    this.ctx = this.canvas.getContext('2d');
    this.ctx.save();  // Save init state for resetting later
  }

  async init(): Promise<void> {
    new Promise<void>((resolve, reject) => {
      if (!this.modelDir) return reject(new Error('This AiModel instance has already been initialized'));

      tf.loadLayersModel('file://' + joinPath(this.modelDir, 'model.json'))
          .then((model) => {
            this.model = model;
            this.modelDir = undefined;

            resolve();
          })
          .catch(reject);
    });
  }

  /**
   * @param image The image to run the prediction on
   *
   * @author https://github.com/googlecreativelab/teachablemachine-community/blob/072e3abc1810cfc9266514c02f278ab00e4a5fcc/libraries/image/src/custom-mobilenet.ts
   */
  async predict(image: Image | Buffer): Promise<{ className: string, probability: number }[]> {
    return new Promise(async (resolve, reject): Promise<void> => {
      const model = this.model;
      if (!model) return reject(new Error('AiModel has not been initialized correctly!'));

      if (!(image instanceof Image)) {
        image = await loadImage(image);
      }

      this.ctx.drawImage(image, 0, 0, 224, 224);  // model is expecting 224x224 image

      const inputImage = this.camera.capture(); // crop & make image a tensor with shape [1, 224, 224, 3]
      this.ctx.restore(); // Reset canvas

      const logits = tf.tidy(() => {
        return model.predict(inputImage);
      });
      tf.dispose(inputImage);

      (logits as tf.Tensor).data()
          .then((values) => {
            const classes = [];

            for (let i = 0; i < values.length; i++) {
              classes.push({
                className: this.metadata.labels[i],
                probability: values[i]
              });
            }

            // Highest probability first
            classes.sort((o1, o2) => {
              return o2.probability - o1.probability;
            });

            resolve(classes);
          })
          .catch(reject)
          .finally(() => tf.dispose(logits));
    });
  }
}

class Camera {
  private readonly webcamElement: HTMLCanvasElement;

  constructor(webcamElement: Canvas) {
    this.webcamElement = webcamElement as any;
  }

  /**
   * Captures a frame from the webcam and normalizes it between -1 and 1.
   * Returns a batched image (1-element batch) of shape [1, w, h, c].
   */
  capture(): tf.Tensor {
    return tf.tidy(() => {
      // Reads the image as a Tensor from the webcam <video> element.
      const inputImage = tf.browser.fromPixels(this.webcamElement);  //TODO: use tf.node.decode instead

      // Crop the image so we're using the center square of the rectangular
      // webcam.
      const croppedImage = this.cropImage(inputImage);

      // Expand the outer most dimension so we have a batch size of 1.
      const batchedImage = croppedImage.expandDims(0);

      // Normalize the image between -1 and 1. The image comes in between 0-255
      // so we divide by 127 and subtract 1.
      return batchedImage.toFloat().div(tf.scalar(127)).sub(tf.scalar(1));
    });
  }

  /**
   * Crops an image tensor so we get a square image with no white space.
   *
   * @param img An input image Tensor to crop.
   */
  cropImage(img: tf.Tensor3D): tf.Tensor3D {
    const size = Math.min(img.shape[0], img.shape[1]);
    const centerHeight = img.shape[0] / 2;
    const beginHeight = centerHeight - size / 2;
    const centerWidth = img.shape[1] / 2;
    const beginWidth = centerWidth - size / 2;

    return img.slice([beginHeight, beginWidth, 0], [size, size, 3]);
  }
}