import React, { forwardRef, useMemo } from 'react';
import { Dimensions, ImageBackground, StyleSheet, Text, View } from 'react-native';
import { Path, Svg, hasSvg } from '../../lib/svgProxy';

type Coord = { latitude: number; longitude: number };

type Props = {
  accentColor: string;
  route: Coord[];
  backgroundUri?: string;
  distanceLabel: string;
  timeLabel: string;
  paceLabel: string;
  areaLabel: string;
  levelLabel: string;
};

/**
 * ShareCardMinimal renders a clean share card:
 * - Full photo background
 * - Top translucent pill with stats
 * - Center SVG polygon only (no map tiles)
 * - Bottom translucent pill with area/XP
 * - Subtle branding
 *
 * Tuning knobs (see comments):
 * - polygonPadding: controls how close polygon sits to edges.
 * - polygon strokeWidth/fill opacity
 * - pill opacity in Glass component
 * - font sizes in styles.*
 */
const ShareCardMinimal = forwardRef<View, Props>(
  (
    {
      accentColor,
      route,
      distanceLabel,
      backgroundUri,
      timeLabel,
      paceLabel,
      areaLabel,
      levelLabel,
    },
    ref
  ) => {
    const { pathData, viewBox } = useMemo(() => {
      const padding = 32; // minimum inset to keep shape off edges
      const width = cardWidth - 28; // account for card padding
      const height = 720; // taller for story aspect

      const pts = (route?.length || 0) >= 3 ? route : [
        { latitude: 0, longitude: 0 },
        { latitude: 0.4, longitude: 0.6 },
        { latitude: 0.8, longitude: 0.2 },
      ];

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      pts.forEach((p) => {
        minX = Math.min(minX, p.longitude);
        maxX = Math.max(maxX, p.longitude);
        minY = Math.min(minY, p.latitude);
        maxY = Math.max(maxY, p.latitude);
      });

      const spanX = maxX - minX || 1;
      const spanY = maxY - minY || 1;
      const targetW = width - padding * 2;
      // Keep the polygon in the lower half but above the area pill
      const topBand = height * 0.5;
      const bottomBand = height - 90; // leave room for pill and branding
      const targetH = Math.max(60, bottomBand - topBand - padding * 2);
      const scale = Math.min(targetW / spanX, targetH / spanY);
      const offsetX = (width - spanX * scale) / 2;
      const offsetY = topBand + (targetH - spanY * scale) / 2 + 40;

      const normalized = pts.map((p) => {
        const x = offsetX + (p.longitude - minX) * scale;
        const y = offsetY + (maxY - p.latitude) * scale; // invert y so north is up
        return { x, y };
      });

      const path =
        normalized.length > 0
          ? `M ${normalized.map((pt) => `${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`).join(' L ')} Z`
          : 'M10 10 L100 10 L50 80 Z';

      const vb = `0 0 ${width} ${height}`;
      return { pathData: path, viewBox: vb };
    }, [route]);

    return (
      <View ref={ref} collapsable={false} style={styles.card}>
        <View style={styles.polyContainer}>
          <ImageBackground
            source={
              backgroundUri
                ? { uri: backgroundUri }
                : require('../../assets/icon.png')
            }
            resizeMode="cover"
            style={StyleSheet.absoluteFill}
            imageStyle={{ opacity: backgroundUri ? 1 : 0.18 }}
          />
          {hasSvg ? (
            <Svg
              pointerEvents="none"
              width="100%"
              height="100%"
              viewBox={viewBox}
              style={StyleSheet.absoluteFill}
            >
              <Path
                d={pathData}
                fill={`${accentColor}4D`} // adjust fill opacity
                stroke={accentColor}
                strokeWidth={4} // polygon stroke width
                strokeLinejoin="round"
              />
            </Svg>
          ) : (
            <View style={styles.noSvgFallback}>
              <Text style={styles.noSvgText}>Polygon unavailable</Text>
            </View>
          )}

          <Glass
            style={[
              styles.pill,
              styles.overlayPill,
              styles.topOverlay,
              {
                borderColor: `${accentColor}99`,
              },
            ]}
          >
            <Stat label="Distance" value={distanceLabel} labelColor={accentColor} />
            <Stat label="Pace" value={paceLabel} labelColor={accentColor} />
            <Stat label="Time" value={timeLabel} labelColor={accentColor} />
          </Glass>

          <Glass
            style={[
              styles.pill,
              styles.overlayPill,
              styles.bottomOverlay,
              {
                borderColor: `${accentColor}99`,
              },
            ]}
          >
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={[styles.areaLabel, { color: accentColor }]}>Area Captured</Text>
              <Text style={styles.areaValue}>{areaLabel}</Text>
            </View>
          </Glass>
        </View>

        <View style={styles.brandingOverlay}>
          <Text style={styles.branding}>ZoneRunner</Text>
        </View>
      </View>
    );
  }
);

const Stat = ({ label, value, labelColor }: { label: string; value: string; labelColor?: string }) => (
  <View style={{ flex: 1 }}>
    <Text style={[styles.statLabel, labelColor ? { color: labelColor } : null]}>{label}</Text>
    <Text style={styles.statValue}>{value}</Text>
  </View>
);

const Glass = ({
  children,
  style,
  intensity = 65,
}: {
  children: React.ReactNode;
  style?: any;
  intensity?: number;
}) => {
  const clamped = Math.min(100, Math.max(0, intensity));
  const opacity = clamped / 100; // allow callers to tune translucency

  return (
    <View
      style={[
        style,
        {
          backgroundColor: `rgba(15,23,42,${opacity})`,
        },
      ]}
    >
      {children}
    </View>
  );
};

const cardWidth = Dimensions.get('window').width;

const styles = StyleSheet.create({
  card: {
    width: cardWidth,
    alignSelf: 'center',
    backgroundColor: 'transparent',
    borderRadius: 24,
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    gap: 12,
  },
  pill: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  overlayPill: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    position: 'absolute',
    left: 28,
    right: 28,
    zIndex: 2,
  },
  topOverlay: {
    top: 72,
  },
  bottomOverlay: {
    bottom: 34,
    justifyContent: 'center',
  },
  statLabel: {
    color: '#94a3b8',
    fontSize: 11,
    letterSpacing: 0.3,
    fontWeight: '700',
    textAlign: 'center',
  },
  statValue: {
    color: '#e5e7eb',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  polyContainer: {
    height: 720,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  areaLabel: {
    fontSize: 11,
    letterSpacing: 0.4,
    fontWeight: '800',
    color: '#94a3b8',
    textTransform: 'uppercase',
  },
  areaValue: {
    color: '#e5e7eb',
    fontSize: 18,
    fontWeight: '900',
  },
  branding: {
    alignSelf: 'center',
    color: '#e2e8f0',
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 0.6,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  brandingOverlay: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 3,
  },
  noSvgFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2,6,23,0.6)',
  },
  noSvgText: {
    color: '#e5e7eb',
    fontWeight: '700',
  },
});

ShareCardMinimal.displayName = 'ShareCardMinimal';

export default ShareCardMinimal;
