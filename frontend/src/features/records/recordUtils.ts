export function isImageFile(url: string) {
  return /\.(png|jpe?g|gif|webp)$/i.test(url);
}
