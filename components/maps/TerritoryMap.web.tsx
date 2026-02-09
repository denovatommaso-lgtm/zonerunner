import React, { useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { MapContainer, TileLayer, GeoJSON, Polyline, useMapEvents } from 'react-leaflet';
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
  const [zoomLevel, setZoomLevel] = useState(initialCamera.zoom ?? 3);
  const leafletCenter = useMemo(
    () => [initialRegion.latitude, initialRegion.longitude] as [number, number],
    [initialRegion]
  );
  const sphereMode = zoomLevel <= 2.2;

  function ZoomListener() {
    useMapEvents({
      zoomend: (evt) => {
        const z = evt.target.getZoom?.();
        if (typeof z === 'number') setZoomLevel(z);
      },
    });
    return null;
  }

  if (isSSR) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <MapContainer
        center={leafletCenter}
        zoom={initialCamera.zoom}
        style={StyleSheet.flatten([styles.map, sphereMode ? styles.sphereMap : null])}
        zoomControl={false}
        minZoom={1}
        worldCopyJump={true}
        whenReady={onMapReady}
      >
        <ZoomListener />
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
  sphereMap: {
    borderRadius: 9999,
    overflow: 'hidden',
    width: '92%',
    height: '92%',
    marginLeft: '4%',
    marginTop: '4%',
    backgroundColor: '#00122a',
    borderWidth: 2,
    borderColor: 'rgba(156,205,255,0.45)',
    shadowColor: '#9ec8ff',
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
  },
});
