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
  type ViewStyle,
} from 'react-native';

export const colors = {
  board: '#16202C',
  brand: '#0E7C66',
  brandDark: '#0B6352',
  brandSoft: '#E8F5F1',
  chalk: '#F7F3E8',
  chalkYellow: '#F2C14E',
  bg: '#F6F7F9',
  card: '#FFFFFF',
  border: '#E2E8F0',
  text: '#0F172A',
  muted: '#64748B',
  danger: '#B91C1C',
  dangerSoft: '#FEF2F2',
  info: '#0369A1',
  infoSoft: '#F0F9FF',
  warn: '#92400E',
  warnSoft: '#FFFBEB',
};

export function Screen({
  children,
  refreshing,
  onRefresh,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 16 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.brand} /> : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
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
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
}) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        isPrimary ? { backgroundColor: pressed ? colors.brandDark : colors.brand } : null,
        variant === 'secondary' ? { backgroundColor: pressed ? '#F1F5F9' : '#fff', borderWidth: 1, borderColor: '#CBD5E1' } : null,
        variant === 'ghost' ? { backgroundColor: pressed ? '#F1F5F9' : 'transparent' } : null,
        (disabled || loading) && { opacity: 0.55 },
      ]}
    >
      {loading ? <ActivityIndicator color={isPrimary ? '#fff' : colors.brand} style={{ marginRight: 8 }} /> : null}
      <Text style={[styles.buttonText, { color: isPrimary ? '#fff' : colors.text }]}>{title}</Text>
    </Pressable>
  );
}

export function Input(props: TextInputProps & { label: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor="#94A3B8" style={[styles.input, rest.multiline && styles.multiline, style]} {...rest} />
    </View>
  );
}

const badgeTones = {
  neutral: { bg: '#F1F5F9', fg: '#334155' },
  brand: { bg: colors.brandSoft, fg: colors.brandDark },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  info: { bg: colors.infoSoft, fg: colors.info },
  warn: { bg: colors.warnSoft, fg: colors.warn },
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
      <Text style={styles.muted}>{text}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 32 }}>
      <ActivityIndicator color={colors.brand} size="large" />
    </View>
  );
}

export function Row({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, pressed && onPress ? { backgroundColor: '#F8FAFC' } : null]}
    >
      {children}
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  muted: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  body: { fontSize: 15, color: colors.text, lineHeight: 22 },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  button: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '600', color: '#334155' },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.text,
  },
  multiline: { minHeight: 120, paddingTop: 12, textAlignVertical: 'top' },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  empty: {
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 4,
  },
});
