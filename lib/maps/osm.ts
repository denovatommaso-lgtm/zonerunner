export const OSM_STYLE_URL =
  process.env.EXPO_PUBLIC_OSM_STYLE_URL ||
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export const OSM_TILE_URL =
  process.env.EXPO_PUBLIC_OSM_TILE_URL ||
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

export const OSM_ATTRIBUTION =
  process.env.EXPO_PUBLIC_OSM_ATTRIBUTION || 'Tiles © Esri';
