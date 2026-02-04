import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { MapContainer, TileLayer, Polyline } from 'react-leaflet';
import type { LatLng } from '../../lib/maps/geojson';

type Props = {
  cameraRef?: React.Ref<any>;
  initialRegion: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
  initialCamera: { center: [number, number]; zoom: number };
  showUserLocation: boolean;
  routeCoords: LatLng[];
  runActive: boolean;
  routeColor: string;
  allowInteraction: boolean;
  onMapReady?: () => void;
};

const tileUrl =
  process.env.EXPO_PUBLIC_OSM_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const attribution =
  process.env.EXPO_PUBLIC_OSM_ATTRIBUTION || '© OpenStreetMap contributors';

export default function RunMapWeb({
  initialRegion,
  initialCamera,
  routeCoords,
  runActive,
  routeColor,
  allowInteraction,
  onMapReady,
}: Props) {
  const isSSR = typeof window === 'undefined';
  const leafletCenter = useMemo(
    () => [initialRegion.latitude, initialRegion.longitude] as [number, number],
    [initialRegion]
  );

  if (isSSR) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <MapContainer
        center={leafletCenter}
        zoom={initialCamera.zoom}
        style={styles.map}
        zoomControl={false}
        whenReady={onMapReady}
        dragging={allowInteraction}
        scrollWheelZoom={allowInteraction}
        doubleClickZoom={allowInteraction}
        boxZoom={allowInteraction}
        keyboard={allowInteraction}
      >
        <TileLayer url={tileUrl} attribution={attribution} />
        {runActive && routeCoords.length > 1 ? (
          <Polyline
            positions={routeCoords.map((p) => [p.latitude, p.longitude]) as any}
            pathOptions={{ color: routeColor, weight: 4 }}
          />
        ) : null}
      </MapContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: '100%', height: '100%' },
});
