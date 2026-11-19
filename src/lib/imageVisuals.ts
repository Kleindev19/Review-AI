
export type ImageVisual = {
  fileName: string;
  mimeType: "image/jpeg";
  dataUrl: string;
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
];

export async function extractImageVisual(
  file: File
): Promise<ImageVisual> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error(
      "Only JPG, JPEG, and PNG images are supported."
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(
      "Image must be smaller than 10 MB."
    );
  }

  if (file.size === 0) {
    throw new Error("Image file is empty.");
  }

  const bitmap = await createImageBitmap(file);

  try {
    const scale = Math.min(
      1,
      MAX_DIMENSION / Math.max(
        bitmap.width,
        bitmap.height
      )
    );

    const canvas = document.createElement("canvas");

    canvas.width = Math.max(
      1,
      Math.round(bitmap.width * scale)
    );

    canvas.height = Math.max(
      1,
      Math.round(bitmap.height * scale)
    );

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error(
        "Unable to process image."
      );
    }

    // White background for transparent PNG images
    context.fillStyle = "#ffffff";
    context.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    context.drawImage(
      bitmap,
      0,
      0,
      canvas.width,
      canvas.height
    );

    const dataUrl = canvas.toDataURL(
      "image/jpeg",
      JPEG_QUALITY
    );

    canvas.width = 0;
    canvas.height = 0;

    return {
      fileName: file.name,
      mimeType: "image/jpeg",
      dataUrl,
    };
  } finally {
    bitmap.close();
  }
}
