import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Camera, LineLayer, MapView, ShapeSource, UserLocation } from '../../lib/maplibre';
import { OSM_STYLE_URL } from '../../lib/maps/osm';
import { lineStringFeature, type LatLng } from '../../lib/maps/geojson';
import OsmAttribution from './OsmAttribution';

type Props = {
  cameraRef?: React.Ref<any>;
  initialRegion: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
  initialCamera: { center: [number, number]; zoom: number };
  showUserLocation: boolean;
  routeCoords: LatLng[];
  runActive: boolean;
  routeColor: string;
  allowInteraction: boolean;
  onMapReady: () => void;
};

export default function RunMapNative({
  cameraRef,
  initialCamera,
  showUserLocation,
  routeCoords,
  runActive,
  routeColor,
  allowInteraction,
  onMapReady,
}: Props) {
  const routeLineShape = useMemo(() => {
    if (!runActive || routeCoords.length < 2) return null;
    return lineStringFeature(routeCoords);
  }, [routeCoords, runActive]);

  return (
    <View style={styles.container}>
      <MapView
        style={StyleSheet.absoluteFillObject}
        mapStyle={OSM_STYLE_URL}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
        pitchEnabled={allowInteraction}
        rotateEnabled={allowInteraction}
        scrollEnabled={allowInteraction}
        zoomEnabled={allowInteraction}
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
        {routeLineShape && (
          <ShapeSource id="run-route" shape={routeLineShape}>
            <LineLayer
              id="run-route-line"
              style={{
                lineColor: routeColor,
                lineWidth: 4,
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
