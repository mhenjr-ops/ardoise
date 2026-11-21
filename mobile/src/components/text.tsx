import { StyleSheet, Text as RNText, type TextProps } from 'react-native';
import { fonts } from './ui';

const byWeight: Record<string, string> = {
  normal: fonts.body,
  '100': fonts.body,
  '200': fonts.body,
  '300': fonts.body,
  '400': fonts.body,
  '500': fonts.medium,
  '600': fonts.bold,
  '700': fonts.bold,
  bold: fonts.bold,
  '800': fonts.heavy,
  '900': fonts.heavy,
};

/** Text in Alegreya Sans; fontWeight picks the matching cut of the font. */
export function Text({ style, ...rest }: TextProps) {
  const flat = StyleSheet.flatten(style) ?? {};
  const family = flat.fontFamily ?? byWeight[String(flat.fontWeight ?? '400')] ?? fonts.body;
  return <RNText {...rest} style={[style, { fontFamily: family, fontWeight: 'normal' }]} />;
}
