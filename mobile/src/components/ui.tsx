import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { NdopPattern } from './ndop';

/** Terroir: slate is the board, chalk is what we write, ochre marks what matters now. */
export const colors = {
  board: '#1F3B36',
  boardDeep: '#162B27',
  brand: '#1F3B36',
  brandDark: '#162B27',
  brandSoft: '#EEF4F1',
  chalk: '#F8F3EA',
  ochre: '#D98E04',
  ochreSoft: '#FDF6E6',
  ochreText: '#8D5B07',
  chalkYellow: '#EBB340',
  bg: '#F4EDE1',
  card: '#FFFCF6',
  border: '#E5D9C6',
  text: '#1D1A15',
  muted: '#7A6C58',
  danger: '#B4532A',
  dangerSoft: '#FBEFE9',
  info: '#283669',
  infoSoft: '#EEF0F8',
  warn: '#8D5B07',
  warnSoft: '#FDF6E6',
  leaf: '#2F7340',
  leafSoft: '#ECF5EC',
};

export const fonts = {
  body: 'AlegreyaSans_400Regular',
  medium: 'AlegreyaSans_500Medium',
  bold: 'AlegreyaSans_700Bold',
  heavy: 'AlegreyaSans_800ExtraBold',
  display: 'Alegreya_600SemiBold',
  displayBold: 'Alegreya_700Bold',
};

export function Screen({
  children,
  refreshing,
  onRefresh,
  padded = true,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  padded?: boolean;
}) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: padded ? 16 : 0, paddingBottom: 48, gap: 16 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.ochre} /> : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** A slate panel with chalk Ndop texture. */
export function Slate({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.slate, style]}>
      <NdopPattern opacity={0.12} />
      {children}
    </View>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 }}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {action}
    </View>
  );
}

export function Muted({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'accent' | 'secondary' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
}) {
  const fg = variant === 'primary' ? colors.chalk : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && { backgroundColor: pressed ? '#2A4D45' : colors.board },
        variant === 'accent' && { backgroundColor: pressed ? '#E39E17' : colors.ochre },
        variant === 'secondary' && { backgroundColor: pressed ? '#FAF6EF' : colors.card, borderWidth: 1, borderColor: '#D2C3AB' },
        variant === 'ghost' && { backgroundColor: pressed ? 'rgba(0,0,0,0.04)' : 'transparent' },
        (disabled || loading) && { opacity: 0.5 },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} style={{ marginRight: 8 }} /> : null}
      <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Input(props: TextInputProps & { label: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor="#A8977D" style={[styles.input, rest.multiline && styles.multiline, style]} {...rest} />
    </View>
  );
}

const badgeTones = {
  neutral: { bg: '#F1E9DC', fg: '#453D33' },
  brand: { bg: colors.brandSoft, fg: colors.board },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  info: { bg: colors.infoSoft, fg: colors.info },
  warn: { bg: colors.warnSoft, fg: colors.warn },
  success: { bg: colors.leafSoft, fg: colors.leaf },
};

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: keyof typeof badgeTones }) {
  const c = badgeTones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <NdopPattern color={colors.board} opacity={0.06} />
      <Text style={[styles.muted, { textAlign: 'center' }]}>{text}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 32 }}>
      <ActivityIndicator color={colors.ochre} size="large" />
    </View>
  );
}

export function Row({ children, onPress, style }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, style, pressed && onPress ? { backgroundColor: '#FAF6EF' } : null]}
    >
      {children}
    </Pressable>
  );
}

const avatarColors = ['#1F3B36', '#B4532A', '#283669', '#8D5B07', '#3D685E', '#74341B'];

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const initials =
    name
      .split(/[\s@.]+/)
      .filter(Boolean)
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?';
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: avatarColors[hash % avatarColors.length],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: colors.chalk, fontFamily: fonts.bold, fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
}

export function Lozenge({ color = colors.ochre, size = 8 }: { color?: string; size?: number }) {
  return <View style={{ width: size, height: size, backgroundColor: color, borderRadius: 2, transform: [{ rotate: '45deg' }] }} />;
}

export const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  slate: {
    backgroundColor: colors.board,
    borderRadius: 22,
    overflow: 'hidden',
    padding: 20,
  },
  sectionTitle: { fontSize: 22, fontFamily: fonts.display, color: colors.text },
  muted: { fontSize: 15, color: colors.muted, lineHeight: 21, fontFamily: fonts.body },
  body: { fontSize: 16, color: colors.text, lineHeight: 24, fontFamily: fonts.body },
  title: { fontSize: 16.5, fontFamily: fonts.bold, color: colors.text },
  display: { fontFamily: fonts.display, color: colors.text },
  button: {
    minHeight: 50,
    borderRadius: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  buttonText: { fontSize: 16.5, fontFamily: fonts.bold },
  label: { fontSize: 15, fontFamily: fonts.bold, color: '#453D33' },
  input: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D2C3AB',
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    fontSize: 17,
    fontFamily: fonts.body,
    color: colors.text,
  },
  multiline: { minHeight: 120, paddingTop: 12, textAlignVertical: 'top' },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 13, fontFamily: fonts.bold },
  empty: {
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D2C3AB',
    padding: 28,
    alignItems: 'center',
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 4,
  },
});
