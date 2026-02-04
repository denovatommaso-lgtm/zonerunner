"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BACKGROUND_TASK = exports.BG_RUN_OPT_IN_KEY = exports.BG_GROUP_OPT_IN_KEY = exports.BG_DIST_KEY = exports.BG_COORDS_KEY = void 0;
exports.clearBackgroundBuffer = clearBackgroundBuffer;
exports.readBackgroundBuffer = readBackgroundBuffer;
exports.startBackgroundTracking = startBackgroundTracking;
exports.stopBackgroundTracking = stopBackgroundTracking;
const async_storage_1 = __importDefault(require("@react-native-async-storage/async-storage"));
const Location = __importStar(require("expo-location"));
const react_native_1 = require("react-native");
const geoMetrics_1 = require("./geo/geoMetrics");
exports.BG_COORDS_KEY = 'zonerunner:bg:coords';
exports.BG_DIST_KEY = 'zonerunner:bg:dist';
exports.BG_GROUP_OPT_IN_KEY = 'zonerunner:bg:group-optin';
exports.BG_RUN_OPT_IN_KEY = 'zonerunner:bg:run-optin';
exports.BACKGROUND_TASK = 'run-tracking-task';
let TaskManager = null;
if (react_native_1.Platform.OS !== 'web') {
    TaskManager = require('expo-task-manager');
}
function ensureBackgroundTaskDefined() {
    if (!TaskManager)
        return;
    if (TaskManager.isTaskDefined(exports.BACKGROUND_TASK))
        return;
    TaskManager.defineTask(exports.BACKGROUND_TASK, async ({ data, error }) => {
        if (error) {
            console.log('Background task error', error);
            return;
        }
        const locations = data?.locations;
        if (!locations || !locations.length)
            return;
        const loc = locations[0];
        const coord = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            ts: typeof loc.timestamp === 'number' ? loc.timestamp : Date.now(),
            altitudeM: typeof loc.coords.altitude === 'number' ? loc.coords.altitude : undefined,
            altitudeAccuracyM: typeof loc.coords.altitudeAccuracy === 'number'
                ? loc.coords.altitudeAccuracy
                : undefined,
        };
        try {
            const storedCoords = await async_storage_1.default.getItem(exports.BG_COORDS_KEY);
            const coords = storedCoords ? JSON.parse(storedCoords) : [];
            const last = coords.length ? coords[coords.length - 1] : null;
            let storedDistance = 0;
            const storedDistStr = await async_storage_1.default.getItem(exports.BG_DIST_KEY);
            if (storedDistStr) {
                storedDistance = parseFloat(storedDistStr) || 0;
            }
            if (last) {
                const delta = (0, geoMetrics_1.haversineMeters)(last, coord);
                if (isFinite(delta) && delta > 0) {
                    storedDistance += delta;
                }
            }
            const nextCoords = [...coords, coord].slice(-500); // keep it bounded
            await async_storage_1.default.multiSet([
                [exports.BG_COORDS_KEY, JSON.stringify(nextCoords)],
                [exports.BG_DIST_KEY, storedDistance.toString()],
            ]);
        }
        catch (e) {
            console.log('Failed to persist background location', e);
        }
    });
}
async function clearBackgroundBuffer() {
    await async_storage_1.default.multiRemove([exports.BG_COORDS_KEY, exports.BG_DIST_KEY]);
}
async function readBackgroundBuffer() {
    const bgCoordsStr = await async_storage_1.default.getItem(exports.BG_COORDS_KEY);
    const bgDistStr = await async_storage_1.default.getItem(exports.BG_DIST_KEY);
    const coords = bgCoordsStr ? JSON.parse(bgCoordsStr) : [];
    const distanceMeters = bgDistStr ? parseFloat(bgDistStr) || 0 : 0;
    return { coords, distanceMeters };
}
async function startBackgroundTracking() {
    if (react_native_1.Platform.OS === 'web')
        return;
    ensureBackgroundTaskDefined();
    await Location.startLocationUpdatesAsync(exports.BACKGROUND_TASK, {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 2000,
        distanceInterval: 5,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
            notificationTitle: 'ZoneRunner is tracking your run',
            notificationBody: 'Tracking continues even if the screen locks.',
        },
    });
}
async function stopBackgroundTracking() {
    if (react_native_1.Platform.OS === 'web')
        return;
    ensureBackgroundTaskDefined();
    try {
        await Location.stopLocationUpdatesAsync(exports.BACKGROUND_TASK);
    }
    catch (e) {
        console.log('Failed to stop background tracking', e);
    }
}
