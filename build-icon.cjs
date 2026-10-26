// Rasterize the original SVG into a Windows multi-resolution icon.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require(process.env.FIELD_SHARP_PATH || 'sharp');
(async () => {
  const source = path.join(__dirname, 'assets', 'field-notes.svg');
  const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
  const images = await Promise.all(
    sizes.map((size) => sharp(source, { density: 384 }).resize(size, size).png().toBuffer()),
  );
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  images.forEach((data, i) => {
    const at = 6 + 16 * i;
    header[at] = sizes[i] === 256 ? 0 : sizes[i];
    header[at + 1] = header[at];
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  fs.writeFileSync(
    path.join(__dirname, 'assets', 'field-notes.ico'),
    Buffer.concat([header, ...images]),
  );
  await sharp(source, { density: 384 })
    .resize(256, 256)
    .png()
    .toFile(path.join(__dirname, 'assets', 'field-notes.png'));
  console.log('Generated 9 icon sizes from the SVG source.');
})();
