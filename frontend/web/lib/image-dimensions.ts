export type ImageDimensions = {
  width: number;
  height: number;
};

export function readImageDimensions(
  source: File | string,
): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const isObjectUrl = typeof source !== "string";
    const imageUrl = isObjectUrl ? URL.createObjectURL(source) : source;
    const image = new Image();
    image.onload = () => {
      if (isObjectUrl) {
        URL.revokeObjectURL(imageUrl);
      }
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      if (isObjectUrl) {
        URL.revokeObjectURL(imageUrl);
      }
      reject(new Error("Image dimensions could not be read."));
    };
    image.src = imageUrl;
  });
}
