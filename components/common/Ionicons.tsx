import React, { useEffect, useState } from 'react';
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
  const [ready, setReady] = useState(Platform.OS !== 'web' || typeof document !== 'undefined');

  useEffect(() => {
    if (!ExpoIonicons || Platform.OS !== 'web') return;
    let mounted = true;
    const load = ExpoIonicons.loadFont?.();
    if (load && typeof load.then === 'function') {
      load
        .then(() => {
          if (mounted) setReady(true);
        })
        .catch(() => {});
    } else {
      setReady(true);
    }
    return () => {
      mounted = false;
    };
  }, []);

  if (!ExpoIonicons) return null;
  // On web, render even if font load is still in-flight to avoid missing icons.
  if (Platform.OS === 'web' && !ready) {
    return <ExpoIonicons {...(props as any)} />;
  }
  return <ExpoIonicons {...(props as any)} />;
}

(Ionicons as any).glyphMap = (ExpoIonicons as any)?.glyphMap || {};

export default Ionicons;
