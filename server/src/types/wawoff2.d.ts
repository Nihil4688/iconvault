declare module "wawoff2" {
  type FontData = Uint8Array;

  const wawoff2: {
    compress(buffer: FontData): Promise<FontData>;
    decompress(buffer: FontData): Promise<FontData>;
  };

  export default wawoff2;
}