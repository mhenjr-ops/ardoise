import { useId } from 'react';
import { StyleSheet, View, type ColorValue, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, Path, Pattern, Rect } from 'react-native-svg';

/**
 * The Ardoise Ndop-style tile (same drawing as the web app): nested lozenges,
 * moons, river zigzags and crossings, separated by stitched seams.
 */
function Tile({ color, opacity, width }: { color: string; opacity: number; width: number }) {
  return (
    <G fill="none" stroke={color} strokeOpacity={opacity} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M24 5 L43 24 L24 43 L5 24 Z" />
      <Path d="M24 13 L35 24 L24 35 L13 24 Z" />
      <Circle cx={24} cy={24} r={1.6} fill={color} fillOpacity={opacity} stroke="none" />
      <Circle cx={72} cy={24} r={16} />
      <Circle cx={72} cy={24} r={9.5} />
      <Circle cx={72} cy={24} r={3} fill={color} fillOpacity={opacity} stroke="none" />
      <Path d="M6 58 l6 6 l6 -6 l6 6 l6 -6 l6 6 l6 -6" />
      <Path d="M6 70 l6 6 l6 -6 l6 6 l6 -6 l6 6 l6 -6" />
      <Path d="M6 82 l6 6 l6 -6 l6 6 l6 -6 l6 6 l6 -6" />
      <Path d="M72 53 V91 M53 72 H91 M60 60 L84 84 M84 60 L60 84" />
      <Circle cx={72} cy={72} r={5} />
      <Path d="M48 0 V96 M0 48 H96" strokeDasharray="2 4" />
    </G>
  );
}

/** Fills its parent with the pattern. Put it first inside a relatively positioned view. */
export function NdopPattern({
  color = '#F8F3EA',
  opacity = 0.14,
  size = 84,
  strokeWidth = 1.3,
  style,
}: {
  color?: string;
  opacity?: number;
  size?: number;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const id = `ndop${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id={id} patternUnits="userSpaceOnUse" width={size} height={size} viewBox="0 0 96 96">
            <Tile color={color} opacity={opacity} width={strokeWidth} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** The Ardoise mark: a slate with a chalk A and an ochre lozenge. */
export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Rect width={40} height={40} rx={10} fill="#1F3B36" />
      <Rect x={1} y={1} width={38} height={38} rx={9} fill="none" stroke="#F8F3EA" strokeOpacity={0.2} />
      <Path d="M11.5 30 L20 9.5 L28.5 30" fill="none" stroke="#F8F3EA" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M15 22.5 H25" stroke="#F8F3EA" strokeWidth={2.2} strokeLinecap="round" />
      <Rect x={27.2} y={7.2} width={5.6} height={5.6} rx={1} fill="#D98E04" transform="rotate(45 30 10)" />
    </Svg>
  );
}

export type IconName = 'home' | 'calendar' | 'inbox' | 'cap' | 'bell' | 'send' | 'pin' | 'lock' | 'chat' | 'phone' | 'check';

const ICONS: Record<IconName, string> = {
  home: 'M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z',
  calendar: 'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2',
  inbox: 'M4 13l2.5-7h11L20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 13h4.5l1.5 2.5h4L15.5 13H20',
  cap: 'M2 9.5 12 5l10 4.5-10 4.5zM6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5M21 10v5',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0',
  send: 'M4 12 20 4l-4 16-4-6.5zM12 13.5 20 4',
  pin: 'M9 4h6l-1 5 3 3v2H7v-2l3-3zM12 14v6',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  chat: 'M4 6h12v8H9l-4 3v-3H4zM16 9h4v8h-1v3l-4-3h-4v-3',
  phone: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2',
  check: 'M5 12.5 10 17l9-10',
};

export function Icon({ name, size = 22, color = '#1F3B36', strokeWidth = 1.9 }: { name: IconName; size?: number; color?: ColorValue; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={ICONS[name]} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Circular progress, 0..1. */
export function Ring({ value, size = 44, stroke = 4, color = '#D98E04', track = '#E5D9C6' }: { value: number; size?: number; stroke?: number; color?: string; track?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${c * v} ${c}`} />
    </Svg>
  );
}
