import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

type TabIconName = 'home' | 'map' | 'trophy' | 'person' | 'time' | 'ellipse';

type Props = {
  name: TabIconName;
  size?: number;
  color?: string;
};

export default function TabIcon({ name, size = 22, color = '#ffffff' }: Props) {
  const strokeWidth = 2;

  switch (name) {
    case 'home':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path
            d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-6H10v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9.5Z"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'map':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path
            d="M1 6l7-3 8 3 7-3v15l-7 3-8-3-7 3V6Z"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path d="M8 3v15M16 6v15" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        </Svg>
      );
    case 'trophy':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path
            d="M8 21h8M12 17v4M6 4h12v4a6 6 0 0 1-12 0V4Z"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M6 4H4a2 2 0 0 0-2 2v2a5 5 0 0 0 5 5M18 4h2a2 2 0 0 1 2 2v2a5 5 0 0 1-5 5"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'person':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="8" r="4" stroke={color} strokeWidth={strokeWidth} />
          <Path
            d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'time':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={strokeWidth} />
          <Path d="M12 7v6l4 2" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        </Svg>
      );
    case 'ellipse':
    default:
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="6" stroke={color} strokeWidth={strokeWidth} />
        </Svg>
      );
  }
}
