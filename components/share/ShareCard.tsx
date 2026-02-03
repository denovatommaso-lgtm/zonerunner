import React, { useEffect, useRef, forwardRef } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { Camera, FillLayer, LineLayer, MapView, ShapeSource } from '../../lib/maplibre';
import { OSM_STYLE_URL } from '../../lib/maps/osm';
import { featureCollection, hexToRgba, polygonFeature, regionToCenterZoom } from '../../lib/maps/geojson';
import OsmAttribution from '../maps/OsmAttribution';

type Coord = { latitude: number; longitude: number };

type Props = {
  accentColor: string;
  route: Coord[];
  distanceLabel: string;
  timeLabel: string;
  paceLabel: string;
  areaLabel: string;
  xpLabel: string;
  levelLabel: string;
  dateLabel: string;
};

function boundsFromCoords(coords: Coord[]) {
  if (!coords.length) return null;
  let minLat = coords[0].latitude;
  let maxLat = coords[0].latitude;
  let minLng = coords[0].longitude;
  let maxLng = coords[0].longitude;
  for (const p of coords) {
    if (p.latitude < minLat) minLat = p.latitude;
    if (p.latitude > maxLat) maxLat = p.latitude;
    if (p.longitude < minLng) minLng = p.longitude;
    if (p.longitude > maxLng) maxLng = p.longitude;
  }
  return { minLat, maxLat, minLng, maxLng };
}

function ShareCardInner(
  {
    accentColor,
    route,
    distanceLabel,
    timeLabel,
    paceLabel,
    areaLabel,
    xpLabel,
    levelLabel,
    dateLabel,
  }: Props,
  ref: any
) {
  const cameraRef = useRef<any>(null);

  useEffect(() => {
    if (!cameraRef.current || !route?.length) return;
    requestAnimationFrame(() => {
      const bounds = boundsFromCoords(route);
      if (!bounds) return;
      cameraRef.current?.fitBounds(
        [bounds.maxLng, bounds.maxLat],
        [bounds.minLng, bounds.minLat],
        80,
        0
      );
    });
  }, [route]);

  const region =
    route && route.length
      ? {
          latitude: route[0].latitude,
          longitude: route[0].longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }
      : {
          latitude: 37.78825,
          longitude: -122.4324,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        };
  const initialCamera = regionToCenterZoom(region);
  const routeFeatures = route.length >= 3
    ? featureCollection([
        polygonFeature(route, {
          lineColor: accentColor,
          fillColor: hexToRgba(accentColor, 0.35),
        }),
      ])
    : featureCollection([]);

  return (
    <View style={styles.card} ref={ref} collapsable={false}>
      <View style={styles.mapWrapper}>
        <MapView
          style={styles.map}
          mapStyle={OSM_STYLE_URL}
          logoEnabled={false}
          attributionEnabled={false}
          compassEnabled={false}
          pitchEnabled={false}
          rotateEnabled={false}
          zoomEnabled={false}
          scrollEnabled={false}
        >
          <Camera
            ref={cameraRef}
            centerCoordinate={initialCamera.center}
            zoomLevel={initialCamera.zoom}
            animationDuration={0}
          />
          {routeFeatures.features.length > 0 && (
            <ShapeSource id="share-route" shape={routeFeatures}>
              <FillLayer
                id="share-route-fill"
                style={{
                  fillColor: ['get', 'fillColor'],
                  fillOpacity: 1,
                }}
              />
              <LineLayer
                id="share-route-line"
                style={{
                  lineColor: ['get', 'lineColor'],
                  lineWidth: 4,
                }}
              />
            </ShapeSource>
          )}
        </MapView>
        <OsmAttribution style={styles.attribution} />
        <View style={styles.brandBadge}>
          <Text style={styles.brandText}>ZoneRunner</Text>
        </View>
      </View>
      <View style={styles.statsBlock}>
        <View style={styles.row}>
          <Stat label="Distance" value={distanceLabel} accent={accentColor} />
          <Stat label="Time" value={timeLabel} accent={accentColor} />
        </View>
        <View style={styles.row}>
          <Stat label="Pace" value={paceLabel} accent={accentColor} />
          <Stat label="Area" value={areaLabel} accent={accentColor} />
        </View>
        <View style={styles.row}>
          <Stat label="XP" value={xpLabel} accent={accentColor} />
          <Stat label="Level" value={levelLabel} accent={accentColor} />
        </View>
        <Text style={styles.date}>{dateLabel}</Text>
      </View>
    </View>
  );
}

const Stat = ({ label, value, accent }: { label: string; value: string; accent: string }) => (
  <View style={{ flex: 1 }}>
    <Text style={[styles.statLabel, { color: accent }]}>{label}</Text>
    <Text style={styles.statValue}>{value}</Text>
  </View>
);

const cardWidth = Math.min(Dimensions.get('window').width - 32, 420);

const styles = StyleSheet.create({
  card: {
    width: cardWidth,
    alignSelf: 'center',
    backgroundColor: '#0b1220',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#111827',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  mapWrapper: {
    height: 260,
    backgroundColor: '#020617',
  },
  map: {
    flex: 1,
  },
  brandBadge: {
    position: 'absolute',
    right: 12,
    top: 12,
    backgroundColor: 'rgba(2,6,23,0.75)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  brandText: {
    color: '#e5e7eb',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.4,
  },
  attribution: {
    right: 10,
    bottom: 8,
  },
  statsBlock: {
    padding: 16,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#f8fafc',
  },
  date: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
  },
});

export default forwardRef(ShareCardInner);
