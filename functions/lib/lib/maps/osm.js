"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OSM_ATTRIBUTION = exports.OSM_TILE_URL = exports.OSM_STYLE_URL = void 0;
exports.OSM_STYLE_URL = process.env.EXPO_PUBLIC_OSM_STYLE_URL ||
    'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json';
exports.OSM_TILE_URL = process.env.EXPO_PUBLIC_OSM_TILE_URL ||
    'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png';
exports.OSM_ATTRIBUTION = process.env.EXPO_PUBLIC_OSM_ATTRIBUTION || '© OpenStreetMap contributors © CARTO';
