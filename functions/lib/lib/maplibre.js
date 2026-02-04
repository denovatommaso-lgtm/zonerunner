"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserLocation = exports.FillLayer = exports.LineLayer = exports.ShapeSource = exports.Camera = exports.MapView = void 0;
const react_native_1 = require("react-native");
const expo_constants_1 = __importDefault(require("expo-constants"));
// Avoid loading native modules on web and gracefully handle missing native module (Expo Go).
let MapLibre = null;
const isExpoGo = expo_constants_1.default.appOwnership === 'expo';
if (react_native_1.Platform.OS !== 'web' && !isExpoGo) {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        MapLibre = require('@maplibre/maplibre-react-native');
    }
    catch {
        MapLibre = null;
    }
}
exports.MapView = react_native_1.Platform.OS === 'web' || !MapLibre ? react_native_1.View : MapLibre.MapView;
exports.Camera = react_native_1.Platform.OS === 'web' || !MapLibre ? react_native_1.View : MapLibre.Camera;
exports.ShapeSource = react_native_1.Platform.OS === 'web' || !MapLibre ? react_native_1.View : MapLibre.ShapeSource;
exports.LineLayer = react_native_1.Platform.OS === 'web' || !MapLibre ? react_native_1.View : MapLibre.LineLayer;
exports.FillLayer = react_native_1.Platform.OS === 'web' || !MapLibre ? react_native_1.View : MapLibre.FillLayer;
exports.UserLocation = react_native_1.Platform.OS === 'web' || !MapLibre ? react_native_1.View : MapLibre.UserLocation;
exports.default = MapLibre;
