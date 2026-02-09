import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { MapContainer, TileLayer, GeoJSON, Polyline } from 'react-leaflet';
import type { FeatureCollection } from '../../lib/maps/geojson';
import { OSM_ATTRIBUTION, OSM_TILE_URL } from '../../lib/maps/osm';

type Props = {
  cameraRef?: React.Ref<any>;
  initialRegion: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
  initialCamera: { center: [number, number]; zoom: number };
  showUserLocation: boolean;
  territoryFeatures: FeatureCollection;
  activeCoords: { latitude: number; longitude: number }[];
  runActive: boolean;
  territoryColor: string;
  onTerritoryPress?: (payload: any) => void;
  onMapReady?: () => void;
};

export default function TerritoryMapWeb({
  cameraRef,
  initialRegion,
  initialCamera,
  showUserLocation,
  territoryFeatures,
  activeCoords,
  runActive,
  territoryColor,
  onTerritoryPress,
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
        minZoom={1}
        worldCopyJump={true}
        whenReady={onMapReady}
      >
        <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />
        {territoryFeatures.features.length > 0 && (
          <GeoJSON
            data={territoryFeatures as any}
            style={(feature: any) => ({
              color: feature?.properties?.lineColor || '#6b7280',
              weight: 3,
              fillColor: feature?.properties?.fillColor || 'rgba(107,114,128,0.3)',
              fillOpacity: 1,
            })}
            onEachFeature={(feature: any, layer: any) => {
              layer.on('click', () => onTerritoryPress?.(feature?.properties ?? feature));
            }}
          />
        )}
        {runActive && activeCoords.length > 0 ? (
          <Polyline positions={activeCoords.map((p) => [p.latitude, p.longitude]) as any} />
        ) : null}
      </MapContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: '100%', height: '100%' },
});
