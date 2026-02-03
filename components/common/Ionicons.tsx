import React from 'react';
import { Platform } from 'react-native';

let ExpoIonicons: any = null;
if (Platform.OS !== 'web' || typeof document !== 'undefined') {
  try {
    ExpoIonicons = require('@expo/vector-icons').Ionicons;
  } catch {
    ExpoIonicons = null;
  }
}

type Props = ExpoIonicons extends null ? Record<string, unknown> : React.ComponentProps<typeof ExpoIonicons>;

function Ionicons(props: Props) {
  if (!ExpoIonicons) return null;
  return <ExpoIonicons {...(props as any)} />;
}

(Ionicons as any).glyphMap = (ExpoIonicons as any)?.glyphMap || {};

export default Ionicons;
