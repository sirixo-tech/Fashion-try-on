// Asset preparation only. This script never builds an APK or application.
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const root = path.resolve(__dirname, "../..");
const markPath = path.join(root, "frontend/web/public/brand/selfx-mark.png");
const background = { r: 250, g: 247, b: 242, alpha: 1 };
const androidDensities = {
  mdpi: 1,
  hdpi: 1.5,
  xhdpi: 2,
  xxhdpi: 3,
  xxxhdpi: 4,
};

async function icon(mark, size, maskable = false) {
  const extent = Math.round(size * (maskable ? 0.58 : 0.66));
  const artwork = await sharp(mark)
    .resize(extent, extent, { fit: "inside" })
    .png()
    .toBuffer();
  const composed = await sharp({
    create: { width: size, height: size, channels: 4, background },
  })
    .composite([{ input: artwork, gravity: "centre" }])
    .png()
    .toBuffer();
  // Flatten after composition so iOS icons have no alpha channel at all.
  return sharp(composed).flatten({ background }).png().toBuffer();
}

async function write(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
}

function ico(frames) {
  const header = Buffer.alloc(6 + 16 * frames.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  let offset = header.length;
  frames.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16;
    header[entry] = header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...frames.map(({ png }) => png)]);
}

async function generateAppIcons() {
  // This is the exact user-supplied X artwork, not a crop of the wordmark.
  const mark = fs.readFileSync(markPath);
  const customer = path.join(root, "mobile/customer-app");
  const publicDirectory = path.join(root, "frontend/web/public");
  const wordmark = path.join(publicDirectory, "brand/selfx-logo.png");
  await write(path.join(customer, "assets/branding/selfx-mark.png"), mark);
  await write(
    path.join(customer, "assets/branding/selfx-logo.png"),
    fs.readFileSync(wordmark),
  );

  for (const app of [customer, path.join(root, "mobile/kiosk")]) {
    for (const [density, factor] of Object.entries(androidDensities)) {
      await write(
        path.join(
          app,
          `android/app/src/main/res/mipmap-${density}/ic_launcher.png`,
        ),
        await icon(mark, 48 * factor),
      );
    }
  }

  const ios = path.join(customer, "ios/Runner/Assets.xcassets");
  const iconDirectory = path.join(ios, "AppIcon.appiconset");
  for (const image of JSON.parse(
    fs.readFileSync(path.join(iconDirectory, "Contents.json"), "utf8"),
  ).images) {
    const size = Math.round(
      Number(image.size.split("x")[0]) * Number(image.scale.replace("x", "")),
    );
    await write(
      path.join(iconDirectory, image.filename),
      await icon(mark, size),
    );
  }

  const windowsFrames = [];
  for (const size of [16, 24, 32, 48, 64, 128, 256])
    windowsFrames.push({
      size,
      png: await sharp(await icon(mark, size))
        .ensureAlpha()
        .png()
        .toBuffer(),
    });
  await write(
    path.join(root, "mobile/kiosk/windows/runner/resources/app_icon.ico"),
    ico(windowsFrames),
  );
  await write(
    path.join(publicDirectory, "favicon.ico"),
    ico(windowsFrames.filter(({ size }) => [16, 32, 48].includes(size))),
  );

  for (const size of [192, 512]) {
    await write(
      path.join(publicDirectory, `brand/selfx-icon-${size}.png`),
      await icon(mark, size),
    );
    await write(
      path.join(publicDirectory, `brand/selfx-maskable-${size}.png`),
      await icon(mark, size, true),
    );
  }
  await write(
    path.join(publicDirectory, "brand/selfx-apple-touch-icon.png"),
    await icon(mark, 180),
  );
  await write(
    path.join(publicDirectory, "brand/selfx-favicon-32.png"),
    await icon(mark, 32),
  );
  // Preserve the old installed-PWA URL while replacing its generic kiosk artwork.
  const legacy = (await icon(mark, 512)).toString("base64");
  await write(
    path.join(publicDirectory, "kiosk/icon.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-labelledby="title"><title id="title">SelfX</title><image width="512" height="512" href="data:image/png;base64,${legacy}"/></svg>\n`,
  );

  // Customer launch screens retain the full wordmark. Android 12+'s masked
  // system splash uses the supplied X, with padding for the system safe area.
  for (const [density, factor] of Object.entries(androidDensities)) {
    const directory = path.join(
      customer,
      `android/app/src/main/res/drawable-${density}`,
    );
    await write(
      path.join(directory, "selfx_splash.png"),
      await sharp(wordmark)
        .resize(Math.round(200 * factor), null)
        .png()
        .toBuffer(),
    );
    const artwork = await sharp(mark)
      .resize(Math.round(160 * factor), Math.round(160 * factor), {
        fit: "inside",
      })
      .png()
      .toBuffer();
    const splash = await sharp({
      create: {
        width: 288 * factor,
        height: 288 * factor,
        channels: 4,
        background: "#00000000",
      },
    })
      .composite([{ input: artwork, gravity: "centre" }])
      .png()
      .toBuffer();
    await write(path.join(directory, "selfx_splash_icon.png"), splash);
  }
  for (const [file, factor] of [
    ["LaunchImage.png", 1],
    ["LaunchImage@2x.png", 2],
    ["LaunchImage@3x.png", 3],
  ]) {
    await write(
      path.join(ios, "LaunchImage.imageset", file),
      await sharp(wordmark)
        .resize(220 * factor, null)
        .png()
        .toBuffer(),
    );
  }
  console.log(
    "Prepared SelfX customer/kiosk launcher, splash, Windows and PWA icons. No application packages were built.",
  );
}

module.exports = { generateAppIcons };
if (require.main === module)
  generateAppIcons().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
