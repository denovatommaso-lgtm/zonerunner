import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Camera, FillLayer, LineLayer, MapView, ShapeSource, UserLocation } from '../../lib/maplibre';
import { OSM_STYLE_URL } from '../../lib/maps/osm';
import { featureCollection, hexToRgba, lineStringFeature } from '../../lib/maps/geojson';
import OsmAttribution from './OsmAttribution';

type Props = {
  cameraRef?: React.Ref<any>;
  initialRegion: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
  initialCamera: { center: [number, number]; zoom: number };
  showUserLocation: boolean;
  territoryFeatures: any;
  activeCoords: { latitude: number; longitude: number }[];
  runActive: boolean;
  territoryColor: string;
  onTerritoryPress: (event: any) => void;
  onMapReady: () => void;
};

export default function TerritoryMapNative({
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
  const activeRouteShape = useMemo(() => {
    if (!runActive || activeCoords.length < 2) return null;
    return lineStringFeature(activeCoords);
  }, [activeCoords, runActive]);

  return (
    <View style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFill}
        mapStyle={OSM_STYLE_URL}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        onDidFinishLoadingMap={onMapReady}
      >
        <Camera
          ref={cameraRef as any}
          centerCoordinate={initialCamera.center}
          zoomLevel={initialCamera.zoom}
          animationDuration={300}
          animationMode="easeTo"
        />
        <UserLocation visible={showUserLocation} />
        {territoryFeatures?.features?.length > 0 && (
          <ShapeSource id="territory-polygons" shape={territoryFeatures} onPress={onTerritoryPress}>
            <FillLayer
              id="territory-fill"
              style={{
                fillColor: ['get', 'fillColor'],
                fillOpacity: 1,
              }}
            />
            <LineLayer
              id="territory-line"
              style={{
                lineColor: ['get', 'lineColor'],
                lineWidth: 3,
              }}
            />
          </ShapeSource>
        )}
        {activeRouteShape && (
          <ShapeSource id="active-route" shape={activeRouteShape}>
            <LineLayer
              id="active-route-outer"
              style={{
                lineColor: hexToRgba(territoryColor, 0.25),
                lineWidth: 10,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
            <LineLayer
              id="active-route-inner"
              style={{
                lineColor: territoryColor,
                lineWidth: 5,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </ShapeSource>
        )}
      </MapView>
      <OsmAttribution />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
});
