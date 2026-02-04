"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.captureRef = captureRef;
const react_native_1 = require("react-native");
let viewShotCapture = null;
try {
    // Prefer the package API if available
    viewShotCapture = require('react-native-view-shot').captureRef;
}
catch (e) {
    viewShotCapture = null;
}
/**
 * Minimal captureRef helper using the native view-shot module bundled in Expo.
 * This avoids adding an extra dependency while keeping share export working.
 */
async function captureRef(view, options = {}) {
    if (viewShotCapture) {
        return viewShotCapture(view, options);
    }
    const handle = (0, react_native_1.findNodeHandle)(view);
    if (!handle || !react_native_1.NativeModules?.RNViewShot?.capture) {
        throw new Error('View capture not available');
    }
    return react_native_1.NativeModules.RNViewShot.capture(handle, options);
}
