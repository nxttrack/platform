declare module "sharp" {
  type ResizeOptions = {
    fit?: "inside";
    height?: number;
    width?: number;
    withoutEnlargement?: boolean;
  };

  type SharpInstance = {
    jpeg(options?: { mozjpeg?: boolean; quality?: number }): SharpInstance;
    png(options?: { compressionLevel?: number }): SharpInstance;
    resize(options: ResizeOptions): SharpInstance;
    rotate(): SharpInstance;
    toBuffer(): Promise<Buffer>;
  };

  export default function sharp(
    input: Buffer | Uint8Array,
    options?: { failOn?: "warning"; limitInputPixels?: number }
  ): SharpInstance;
}
