export const OSM_STYLE_URL =
  process.env.EXPO_PUBLIC_OSM_STYLE_URL ||
  'https://basemaps.cartocdn.com/gl/voyager-nolabels-gl-style/style.json';

export const OSM_TILE_URL =
  process.env.EXPO_PUBLIC_OSM_TILE_URL ||
  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png';

export const OSM_ATTRIBUTION =
  process.env.EXPO_PUBLIC_OSM_ATTRIBUTION || '© OpenStreetMap contributors © CARTO';
