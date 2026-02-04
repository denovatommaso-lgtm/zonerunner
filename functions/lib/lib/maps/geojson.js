"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toLngLat = toLngLat;
exports.closeRing = closeRing;
exports.lineStringFeature = lineStringFeature;
exports.polygonFeature = polygonFeature;
exports.featureCollection = featureCollection;
exports.regionToCenterZoom = regionToCenterZoom;
exports.hexToRgba = hexToRgba;
function toLngLat(coord) {
    return [coord.longitude, coord.latitude];
}
function closeRing(coords) {
    if (!coords.length)
        return coords;
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first.latitude === last.latitude && first.longitude === last.longitude) {
        return coords;
    }
    return [...coords, first];
}
function lineStringFeature(coords, properties) {
    return {
        type: 'Feature',
        properties,
        geometry: {
            type: 'LineString',
            coordinates: coords.map(toLngLat),
        },
    };
}
function polygonFeature(ring, properties) {
    return {
        type: 'Feature',
        properties,
        geometry: {
            type: 'Polygon',
            coordinates: [closeRing(ring).map(toLngLat)],
        },
    };
}
function featureCollection(features) {
    return { type: 'FeatureCollection', features };
}
function regionToCenterZoom(region) {
    const center = [region.longitude, region.latitude];
    const angle = Math.max(0.000001, region.longitudeDelta);
    const zoom = Math.min(20, Math.max(2, Math.log2(360 / angle)));
    return { center, zoom };
}
function hexToRgba(hex, alpha) {
    const cleaned = hex.replace('#', '');
    if (cleaned.length !== 6)
        return hex;
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
