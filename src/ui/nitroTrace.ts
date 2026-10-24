// ssh2 requires cpu-features inside try/catch. The addon is absent in the image
// (no compiler), and @vercel/nft still records the path. Nitro realpath then throws ENOENT.
export function ignoreUnbuiltCpuFeatures(file: string) {
  return file.replaceAll('\\', '/').includes('/cpu-features')
}
