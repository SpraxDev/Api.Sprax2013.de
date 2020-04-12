const context = require('./modelRender');
const sharp = require('sharp');

const width = 600;
const height = 960;

const camera = context.createCamera(width, height);
camera.setPosition({ x: -0.75, y: 2.1, z: -1.25 });
camera.setRotation({ x: Math.PI / 12, y: Math.PI / 6, z: 0 });
camera.setPostPosition({ x: 0, y: -0.385 });
camera.setScale({ x: 1.6, y: 1.6 });
const no2ndLayer = context.createModel('no2ndLayer.obj', 64, 64);
const with2ndLayer = context.createModel('with2ndLayer.obj', 64, 64);

sharp('skin.png')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true }).then((res) => {
        var result = camera.render(no2ndLayer, res.data);
        sharp(Buffer.from(result), { raw: { channels: 4, width: width, height: height } })
            .png()
            .toFile('no2ndLayer.png');
        var result2 = camera.render(with2ndLayer, res.data);
        sharp(Buffer.from(result2), { raw: { channels: 4, width: width, height: height } })
            .png()
            .toFile('with2ndLayer.png');
    })
    .catch(console.error);

