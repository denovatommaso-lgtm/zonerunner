export type LatLng = { latitude: number; longitude: number };
export type LngLat = [number, number];

type LineStringGeometry = {
  type: 'LineString';
  coordinates: LngLat[];
};

type PolygonGeometry = {
  type: 'Polygon';
  coordinates: LngLat[][];
};

export type Feature = {
  type: 'Feature';
  geometry: LineStringGeometry | PolygonGeometry;
  properties?: Record<string, any>;
};

export type FeatureCollection = {
  type: 'FeatureCollection';
  features: Feature[];
};

export type RegionLike = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export function toLngLat(coord: LatLng): LngLat {
  return [coord.longitude, coord.latitude];
}

export function closeRing(coords: LatLng[]): LatLng[] {
  if (!coords.length) return coords;
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first.latitude === last.latitude && first.longitude === last.longitude) {
    return coords;
  }
  return [...coords, first];
}

export function lineStringFeature(coords: LatLng[], properties?: Record<string, any>): Feature {
  return {
    type: 'Feature',
    properties,
    geometry: {
      type: 'LineString',
      coordinates: coords.map(toLngLat),
    },
  };
}

export function polygonFeature(ring: LatLng[], properties?: Record<string, any>): Feature {
  return {
    type: 'Feature',
    properties,
    geometry: {
      type: 'Polygon',
      coordinates: [closeRing(ring).map(toLngLat)],
    },
  };
}

export function featureCollection(features: Feature[]): FeatureCollection {
  return { type: 'FeatureCollection', features };
}

export function regionToCenterZoom(region: RegionLike): { center: LngLat; zoom: number } {
  const center: LngLat = [region.longitude, region.latitude];
  const angle = Math.max(0.000001, region.longitudeDelta);
  const zoom = Math.min(20, Math.max(2, Math.log2(360 / angle)));
  return { center, zoom };
}

export function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace('#', '');
  if (cleaned.length !== 6) return hex;
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
