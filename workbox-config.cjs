module.exports = {
  swSrc: 'public/sw-src.js',
  swDest: 'dist/sw.js',
  globDirectory: 'dist',
  globPatterns: [
    '**/*.{js,css,html,ico,png,svg,webmanifest,json,ttf,woff,woff2}'
  ],
  globIgnores: ['**/sw.js'],
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
};
