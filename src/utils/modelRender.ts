import { readFileSync } from 'fs';

const gl = require('gl')(64, 64, { preserveDrawingBuffer: true });

const vertexShaderSource: string =
    `
attribute vec4 a_position;
attribute vec2 a_texcoord;

varying vec2 v_texcoord;

uniform mat4 u_mvp;

void main(){
    gl_Position = u_mvp * a_position;
    v_texcoord = a_texcoord;
}
`;

const fragmentShaderSource: string =
    `
precision mediump float;
varying vec2 v_texcoord;

uniform sampler2D u_texture;

void main(){
    gl_FragColor = texture2D(u_texture, vec2(v_texcoord.x, 1.0-v_texcoord.y));
    if(gl_FragColor.w != 1.0)
        discard;
}
`;

/* MODEL */
class Model {
    vdata: Float32Array;
    idata: Uint16Array;
    readonly texture: WebGLTexture;
    readonly vertexBuffer: WebGLBuffer;
    readonly indexBuffer: WebGLBuffer;
    readonly textureWidth: number;
    readonly textureHeight: number;

    constructor(vdata: Float32Array, idata: Uint16Array, width: number, height: number) {
        let maxValue = 0;
        idata.forEach(v => maxValue = Math.max(v, maxValue));
        if (maxValue > (Math.pow(2, 16) - 1)) {
            throw new Error('Model contains too many different vertices');
        }
        this.textureWidth = width;
        this.textureHeight = height;
        this.texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4 * width * height));

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

        this.vdata = vdata;
        this.idata = idata;

        this.vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vdata, gl.STATIC_DRAW);

        this.indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idata, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 16);
    }
}

/* CAMERA */

function multiplyMatrixAndPoint(matrix: number[], point: number[]) {
    // Give a simple variable name to each part of the matrix, a column and row number
    let c0r0 = matrix[0], c1r0 = matrix[1], c2r0 = matrix[2], c3r0 = matrix[3];
    let c0r1 = matrix[4], c1r1 = matrix[5], c2r1 = matrix[6], c3r1 = matrix[7];
    let c0r2 = matrix[8], c1r2 = matrix[9], c2r2 = matrix[10], c3r2 = matrix[11];
    let c0r3 = matrix[12], c1r3 = matrix[13], c2r3 = matrix[14], c3r3 = matrix[15];

    // Now set some simple names for the point
    let x = point[0];
    let y = point[1];
    let z = point[2];
    let w = point[3];

    // Multiply the point against each part of the 1st column, then add together
    let resultX = (x * c0r0) + (y * c0r1) + (z * c0r2) + (w * c0r3);

    // Multiply the point against each part of the 2nd column, then add together
    let resultY = (x * c1r0) + (y * c1r1) + (z * c1r2) + (w * c1r3);

    // Multiply the point against each part of the 3rd column, then add together
    let resultZ = (x * c2r0) + (y * c2r1) + (z * c2r2) + (w * c2r3);

    // Multiply the point against each part of the 4th column, then add together
    let resultW = (x * c3r0) + (y * c3r1) + (z * c3r2) + (w * c3r3);

    return [resultX, resultY, resultZ, resultW];
}

function multiplyMatrices(matrixA: number[], matrixB: number[]) {
    // Slice the second matrix up into rows
    let row0 = [matrixB[0], matrixB[1], matrixB[2], matrixB[3]];
    let row1 = [matrixB[4], matrixB[5], matrixB[6], matrixB[7]];
    let row2 = [matrixB[8], matrixB[9], matrixB[10], matrixB[11]];
    let row3 = [matrixB[12], matrixB[13], matrixB[14], matrixB[15]];

    // Multiply each row by matrixA
    let result0 = multiplyMatrixAndPoint(matrixA, row0);
    let result1 = multiplyMatrixAndPoint(matrixA, row1);
    let result2 = multiplyMatrixAndPoint(matrixA, row2);
    let result3 = multiplyMatrixAndPoint(matrixA, row3);

    // Turn the result rows back into a single matrix
    return [
        result0[0], result0[1], result0[2], result0[3],
        result1[0], result1[1], result1[2], result1[3],
        result2[0], result2[1], result2[2], result2[3],
        result3[0], result3[1], result3[2], result3[3]
    ];
}

class Camera {
    readonly frameBuffer: WebGLFramebuffer;
    readonly texture: WebGLTexture;
    readonly shader: WebGLProgram;
    readonly width: number;
    readonly height: number;
    private depthRenderBuffer: WebGLRenderbuffer;
    private mvp: Float32Array;
    private position: vec3;
    private rotation: vec3;
    private scale: vec2;
    private postPosition: vec2;

    constructor(width: number, height: number) {
        this.height = height;
        this.width = width;
        this.frameBuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBuffer);

        gl.activeTexture(gl.TEXTURE0);
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4 * this.width * this.height));

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);

        this.depthRenderBuffer = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthRenderBuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this.width, this.height);

        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depthRenderBuffer);

        this.shader = gl.createProgram();
        this.position = { x: 0, y: 0, z: 0 };
        this.rotation = { x: 0, y: 0, z: 0 };
        this.scale = { x: 1, y: 1 };
        this.postPosition = { x: 0, y: 0 };
        this.mvp = this.calcMvp();

        const vertexShader = this.createShader(vertexShaderSource, gl.VERTEX_SHADER);
        const fragmentShader = this.createShader(fragmentShaderSource, gl.FRAGMENT_SHADER);

        gl.attachShader(this.shader, vertexShader);
        gl.attachShader(this.shader, fragmentShader);

        gl.linkProgram(this.shader);

        gl.validateProgram(this.shader);
        if (!gl.getProgramParameter(this.shader, gl.LINK_STATUS)) {
            const info = gl.getProgramInfoLog(this.shader);
            throw new Error(`Could not compile WebGL program.\n\n${info}`);
        }

        gl.useProgram(this.shader);
        gl.bindAttribLocation(this.shader, 0, "a_position");
        gl.bindAttribLocation(this.shader, 1, "a_texcoord");

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.depthFunc(gl.LEQUAL);
        gl.clearDepth(1.0);
    }

    private createShader(sourceCode: string, type: any) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, sourceCode);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const info = gl.getShaderInfoLog(shader);
            throw new Error(`Could not compile WebGL shader.\n\n${info}`);
        }
        return shader;
    }

    render(model: Model, texture: Uint8Array, clearBuffer: boolean = true) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.frameBuffer);
        gl.viewport(0, 0, this.width, this.height);
        gl.bindBuffer(gl.ARRAY_BUFFER, model.vertexBuffer);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.indexBuffer);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 16);
        gl.useProgram(this.shader);

        gl.activeTexture(gl.TEXTURE0 + 0);
        gl.bindTexture(gl.TEXTURE_2D, model.texture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, model.textureWidth, model.textureHeight, gl.RGBA, gl.UNSIGNED_BYTE, texture);

        const textureLocation = gl.getUniformLocation(this.shader, 'u_texture');
        gl.uniform1i(textureLocation, 0);

        const mvpLocation = gl.getUniformLocation(this.shader, 'u_mvp');
        gl.uniformMatrix4fv(mvpLocation, false, this.mvp);

        gl.flush();
        gl.finish();

        if (clearBuffer) {
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        }
        gl.drawElements(gl.TRIANGLES, model.idata.length, gl.UNSIGNED_SHORT, 0);

        gl.flush();
        gl.finish();

        const result: Uint8Array = new Uint8Array(4 * this.width * this.height);
        gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, result);
        gl.finish();

        const error = gl.getError();
        if (error) {
            throw new Error(`ModelRender WebGLError: ${error}`);
        }

        return result;
    }

    private calcMvp(): Float32Array {
        const cx = Math.cos(-this.rotation.x);
        const cy = Math.cos(-this.rotation.y);
        const cz = Math.cos(-this.rotation.z);
        const sx = Math.sin(-this.rotation.x);
        const sy = Math.sin(-this.rotation.y);
        const sz = Math.sin(-this.rotation.z);
        const tx = -this.position.x;
        const ty = -this.position.y;
        const tz = -this.position.z;

        const n = 1;
        const f = 100;
        const angle = 90 / 180 * Math.PI;
        const t = Math.tan(angle / 2);
        const r = t * (this.width / this.height);

        const rotateZ = [
            cz, sz, 0, 0,
            -sz, cz, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ];
        const rotateX = [
            1, 0, 0, 0,
            0, cx, sx, 0,
            0, -sx, cx, 0,
            0, 0, 0, 1
        ];
        const rotateY = [
            cy, 0, -sy, 0,
            0, 1, 0, 0,
            sy, 0, cy, 0,
            0, 0, 0, 1
        ];
        const translate = [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            tx, ty, tz, 1
        ];
        const projection = [
            n / r, 0, 0, 0,
            0, -n / t, 0, 0,
            0, 0, (f + n) / (f - n), 1,
            0, 0, -2 * f * n / (f - n), 0
        ];
        const scale = [
            this.scale.x, 0, 0, 0,
            0, this.scale.y, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ];
        const postTranslate = [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            this.postPosition.x, this.postPosition.y, 0, 1
        ];
        const mvpMatrix = multiplyMatrices(scale,
            multiplyMatrices(postTranslate,
                multiplyMatrices(projection,
                    multiplyMatrices(rotateZ,
                        multiplyMatrices(rotateX,
                            multiplyMatrices(rotateY, translate))))));
        return new Float32Array(mvpMatrix);
    }

    setPosition(position: vec3) {
        this.position = position;
        this.mvp = this.calcMvp();
    }

    setRotation(rotation: vec3) {
        this.rotation = rotation;
        this.mvp = this.calcMvp();
    }

    setScale(scale: vec2) {
        this.scale = scale;
        this.mvp = this.calcMvp();
    }

    setPostPosition(pos: vec2) {
        this.postPosition = pos;
        this.mvp = this.calcMvp();
    }
}

/* CONTEXT */

interface vec4 { x: number, y: number, z: number, w: number }
interface vec3 { x: number, y: number, z: number }
interface vec2 { x: number, y: number }
interface Vertex { position: vec4, texCoord: vec2 }

function getOfArray(array: any[], index: number) {
    return array[(index < 0) ? array.length + index : index - 1]
}

function modelFileToBufferData(filename: string) {
    const file: string = readFileSync(filename, 'utf-8');
    const lines: string[] = file.split(/\r?\n/g);

    const positions: vec4[] = [];
    const texCoords: vec2[] = [];
    // const normals: vec3[] = [];

    const vertexBuffer: Vertex[] = [];
    const indexBuffer: number[] = [];

    for (const line of lines) {
        if (line.startsWith('v ')) {
            const position: string[] = line.substring(2).trim().split(' ');
            let pos: vec4 = { x: 0, y: 0, z: 0, w: 1 };
            pos.x = (position[0] != null && position[0].length) ? parseFloat(position[0]) : 0;
            pos.y = (position[1] != null && position[1].length) ? parseFloat(position[1]) : 0;
            pos.z = (position[2] != null && position[2].length) ? parseFloat(position[2]) : 0;
            pos.w = (position[3] != null && position[3].length) ? parseFloat(position[3]) : 1;
            positions.push(pos);
        }
        // else if (line.startsWith('vn ')) {
        // const normal: string[] = line.substring(3).trim().split(' ');
        // let norm: vec3 = { x: 0, y: 0, z: 0 };
        // norm.x = (normal[0] != null && normal[0].length) ? parseFloat(normal[0]) : 0;
        // norm.y = (normal[1] != null && normal[1].length) ? parseFloat(normal[1]) : 0;
        // norm.z = (normal[2] != null && normal[2].length) ? parseFloat(normal[2]) : 0;
        // normals.push(norm);
        //}
        else if (line.startsWith('vt ')) {
            const texCoord: string[] = line.substring(3).trim().split(' ');
            let tex: vec2 = { x: 0, y: 0 };
            tex.x = (texCoord[0] != null && texCoord[0].length) ? parseFloat(texCoord[0]) : 0;
            tex.y = (texCoord[1] != null && texCoord[1].length) ? parseFloat(texCoord[1]) : 0;
            texCoords.push(tex);
        } else if (line.startsWith('f ')) {
            const face: string[] = line.substring(2).split(' ');
            let point: number = 0;
            const vertices: Vertex[] = [];
            for (const vertex of face) {
                const vertexElements = vertex.split('/');
                let vertexObj: Vertex = { position: { x: 0, y: 0, z: 0, w: 1 }, texCoord: { x: 0, y: 0 } };
                vertexObj.position = getOfArray(positions, parseInt(vertexElements[0]));
                if (vertexElements[1] != null && vertexElements[1].length > 0) {
                    vertexObj.texCoord = getOfArray(texCoords, parseInt(vertexElements[1]))
                }
                vertices.push(vertexObj);
            }
            let vertex0: Vertex | undefined,
                lastVertex: Vertex | undefined;
            for (const vertex of vertices) {
                if (point == 0) {
                    vertex0 = vertex;
                } else if (point == 1) {
                    lastVertex = vertex;
                } else if (point >= 2) {
                    if (!vertex0 || !lastVertex) throw new Error(); // TODO: cleanup - They can't be undefinded but TypeScript doesn't recognize this o.0

                    vertexBuffer.push(vertex0);
                    vertexBuffer.push(lastVertex);
                    vertexBuffer.push(vertex);
                    lastVertex = vertex;
                }

                point++;
            }
        }
    }
    const resultVertexBuffer: number[] = [];
    const vertexSearchList: Vertex[] = [];
    for (let i = 0; i < vertexBuffer.length; i++) {
        let indexOfVertex = vertexSearchList.length;
        for (let index = 0; index < vertexSearchList.length; index++) {
            if (JSON.stringify(vertexBuffer[i]) == JSON.stringify(vertexSearchList[index])) {
                indexOfVertex = index;
                break;
            }
        }
        if (indexOfVertex == vertexSearchList.length) {
            vertexSearchList.push(vertexBuffer[i]);
            resultVertexBuffer.push(vertexBuffer[i].position.x)
            resultVertexBuffer.push(vertexBuffer[i].position.y)
            resultVertexBuffer.push(vertexBuffer[i].position.z)
            resultVertexBuffer.push(vertexBuffer[i].position.w)
            resultVertexBuffer.push(vertexBuffer[i].texCoord.x)
            resultVertexBuffer.push(vertexBuffer[i].texCoord.y)
        }
        indexBuffer.push(indexOfVertex);
    }
    let max = 0;
    indexBuffer.forEach(n => max = Math.max(max, n));
    return { indexBuffer, vertexBuffer: resultVertexBuffer };
}

export function createModel(filename: string, textureWidth: number, textureHeight: number) {
    const data = modelFileToBufferData(filename);
    const vertexData = new Float32Array(data.vertexBuffer);
    const indexData = new Uint16Array(data.indexBuffer);

    return new Model(vertexData, indexData, textureWidth, textureHeight);
}

export function createCamera(width: number, height: number) {
    return new Camera(width, height);
}