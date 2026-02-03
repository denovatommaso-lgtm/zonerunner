import { Platform, View } from 'react-native';
import Constants from 'expo-constants';

// Avoid loading native modules on web and gracefully handle missing native module (Expo Go).
let MapLibre: any = null;
const isExpoGo = Constants.appOwnership === 'expo';
if (Platform.OS !== 'web' && !isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    MapLibre = require('@maplibre/maplibre-react-native');
  } catch {
    MapLibre = null;
  }
}

export const MapView: any = Platform.OS === 'web' || !MapLibre ? View : MapLibre.MapView;
export const Camera: any = Platform.OS === 'web' || !MapLibre ? View : MapLibre.Camera;
export const ShapeSource: any = Platform.OS === 'web' || !MapLibre ? View : MapLibre.ShapeSource;
export const LineLayer: any = Platform.OS === 'web' || !MapLibre ? View : MapLibre.LineLayer;
export const FillLayer: any = Platform.OS === 'web' || !MapLibre ? View : MapLibre.FillLayer;
export const UserLocation: any = Platform.OS === 'web' || !MapLibre ? View : MapLibre.UserLocation;

export default MapLibre;
