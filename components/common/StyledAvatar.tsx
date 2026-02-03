import React, { useMemo, useRef, useEffect } from 'react';
import { Image, View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { avatarBorderStyles } from '../../lib/rewardStyles';
import { RewardTier } from '../../lib/rewardsConfig';

type Props = {
  uri?: string | null;
  name?: string | null;
  size?: number;
  tier?: RewardTier;
  styleTier?: RewardTier;
};

export function StyledAvatar({ uri, name, size = 64, tier = 'default', styleTier }: Props) {
  const initials = useMemo(() => {
    if (!name) return '??';
    const parts = name.split(' ').filter(Boolean);
    if (!parts.length) return name.slice(0, 2).toUpperCase();
    const first = parts[0]?.[0] ?? '';
    const last = parts[parts.length - 1]?.[0] ?? '';
    return (first + last).toUpperCase();
  }, [name]);

  const colorSpec = avatarBorderStyles[tier] ?? avatarBorderStyles.default;
  const styleSpec = styleTier ? avatarBorderStyles[styleTier] ?? colorSpec : colorSpec;
  const border = {
    borderColor: colorSpec.borderColor,
    borderWidth: colorSpec.borderWidth,
    borderStyle: styleSpec.borderStyle,
    overlayGradient: styleSpec.overlayGradient,
    animatedSpin: styleSpec.animatedSpin,
    animatedPulse: styleTier ? styleSpec.animatedPulse : false,
  };

  const shimmer = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!border.overlayGradient) return;
    const anim = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 4000,
        easing: Easing.linear,
        useNativeDriver: false,
      })
    );
    try {
      anim.start();
    } catch {
      // If the animation driver fails, skip shimmer to avoid crashes.
      return;
    }
    return () => {
      try {
        anim.stop();
      } catch {
        // ignore
      }
    };
  }, [border.overlayGradient, shimmer]);

  useEffect(() => {
    if (!border.animatedSpin) return;
    const anim = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 2500,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => {
      try {
        anim.stop();
      } catch {
        // ignore
      }
    };
  }, [border.animatedSpin, spin]);

  useEffect(() => {
    if (!border.animatedPulse) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => {
      try {
        anim.stop();
      } catch {
        // ignore
      }
    };
  }, [border.animatedPulse, pulse]);

  const shimmerColor = border.overlayGradient
    ? shimmer.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: border.overlayGradient.colors,
      })
    : null;

  const rotateStyle = border.animatedSpin
    ? {
        transform: [
          {
            rotate: spin.interpolate({
              inputRange: [0, 1],
              outputRange: ['0deg', '360deg'],
            }),
          },
        ],
      }
    : undefined;

  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0] });

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      {border.animatedPulse ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pulseRing,
            {
              width: size + 10,
              height: size + 10,
              borderRadius: (size + 10) / 2,
              borderColor: shimmerColor ?? border.borderColor,
              opacity: pulseOpacity,
              transform: [{ scale: pulseScale }],
            },
          ]}
        />
      ) : null}
      <Animated.View
        style={[
          styles.container,
          border.overlayGradient && {
            shadowColor: shimmerColor ?? border.borderColor,
            shadowOpacity: 0.6,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 0 },
            elevation: 6,
          },
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: shimmerColor ?? border.borderColor,
            borderWidth: border.borderWidth,
            borderStyle: border.borderStyle as any,
          },
          rotateStyle,
        ]}
      >
        {uri ? (
          <Image source={{ uri }} style={{ width: size - 6, height: size - 6, borderRadius: (size - 6) / 2 }} />
        ) : (
          <Animated.View
            style={[
              styles.fallback,
              {
                width: size - 6,
                height: size - 6,
                borderRadius: (size - 6) / 2,
                borderWidth: border.overlayGradient ? 1 : 0,
                borderColor: shimmerColor ?? border.borderColor,
              },
            ]}
          >
            <Text style={styles.initials}>{initials}</Text>
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0b1220',
  },
  fallback: {
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#e5e7eb',
    fontWeight: '800',
    fontSize: 16,
  },
  pulseRing: {
    position: 'absolute',
    borderWidth: 3,
    opacity: 0.2,
  },
});

export default StyledAvatar;
