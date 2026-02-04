"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasSvg = exports.Path = exports.Svg = void 0;
// Proxy for react-native-svg. If missing, expose nulls so callers can guard.
let SvgModule = null;
try {
    SvgModule = require('react-native-svg');
}
catch {
    SvgModule = null;
}
exports.Svg = SvgModule ? SvgModule.default || SvgModule.Svg || SvgModule : null;
exports.Path = SvgModule ? SvgModule.Path || exports.Svg?.Path : null;
exports.hasSvg = !!exports.Svg && !!exports.Path;
