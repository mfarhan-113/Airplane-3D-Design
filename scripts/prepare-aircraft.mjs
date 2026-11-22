import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const [input, output = 'public/models/aeriform-widebody.glb'] = process.argv.slice(2);
if (!input) throw new Error('Provide the path to Innerscene’s original wide-body GLB.');
const source = await readFile(input);
const jsonLength = source.readUInt32LE(12);
const gltf = JSON.parse(source.subarray(20, 20 + jsonLength));
const binary = source.subarray(28 + jsonLength);
const images = new Map(gltf.images.map((image) => [image.bufferView, image]));
const chunks = [];
let offset = 0;

for (const [index, view] of gltf.bufferViews.entries()) {
  const start = view.byteOffset ?? 0;
  let bytes = binary.subarray(start, start + view.byteLength);
  const image = images.get(index);
  if (image) {
    const width = image.name.includes('_n_') ? 256 : image.name.endsWith('_panels') ? 1024 : 512;
    bytes = await sharp(bytes).resize({ width, height: width, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 83 }).toBuffer();
    image.mimeType = 'image/jpeg';
  }
  view.byteOffset = offset;
  view.byteLength = bytes.length;
  const padding = (4 - bytes.length % 4) % 4;
  chunks.push(bytes, Buffer.alloc(padding));
  offset += bytes.length + padding;
}

gltf.buffers[0].byteLength = offset;
const json = Buffer.from(JSON.stringify(gltf));
const jsonPadding = Buffer.alloc((4 - json.length % 4) % 4, 32);
const header = Buffer.alloc(20);
header.write('glTF');
header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + json.length + jsonPadding.length + offset, 8);
header.writeUInt32LE(json.length + jsonPadding.length, 12);
header.write('JSON', 16);
const binaryHeader = Buffer.alloc(8);
binaryHeader.writeUInt32LE(offset, 0);
binaryHeader.write('BIN', 4);
await writeFile(output, Buffer.concat([header, json, jsonPadding, binaryHeader, ...chunks]));
