import { findNodeHandle, NativeModules } from 'react-native';

let viewShotCapture: any = null;
try {
  // Prefer the package API if available
  viewShotCapture = require('react-native-view-shot').captureRef;
} catch (e) {
  viewShotCapture = null;
}

type CaptureOptions = {
  format?: 'png' | 'jpg';
  quality?: number;
  result?: 'tmpfile' | 'base64' | 'data-uri';
  width?: number;
  height?: number;
};

/**
 * Minimal captureRef helper using the native view-shot module bundled in Expo.
 * This avoids adding an extra dependency while keeping share export working.
 */
export async function captureRef(
  view: any,
  options: CaptureOptions = {}
): Promise<string> {
  if (viewShotCapture) {
    return viewShotCapture(view, options);
  }
  const handle = findNodeHandle(view);
  if (!handle || !NativeModules?.RNViewShot?.capture) {
    throw new Error('View capture not available');
  }
  return NativeModules.RNViewShot.capture(handle, options);
}
