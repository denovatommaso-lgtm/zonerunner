export const OSM_STYLE_URL =
  process.env.EXPO_PUBLIC_OSM_STYLE_URL ||
  'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

export const OSM_TILE_URL =
  process.env.EXPO_PUBLIC_OSM_TILE_URL ||
  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

export const OSM_ATTRIBUTION =
  process.env.EXPO_PUBLIC_OSM_ATTRIBUTION || '© OpenStreetMap contributors © CARTO';
