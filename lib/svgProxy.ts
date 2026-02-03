// Proxy for react-native-svg. If missing, expose nulls so callers can guard.
let SvgModule: any = null;
try {
  SvgModule = require('react-native-svg');
} catch {
  SvgModule = null;
}

export const Svg = SvgModule ? SvgModule.default || SvgModule.Svg || SvgModule : null;
export const Path = SvgModule ? SvgModule.Path || (Svg as any)?.Path : null;
export const hasSvg = !!Svg && !!Path;
