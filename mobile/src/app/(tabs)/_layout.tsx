import { Redirect } from 'expo-router';
import { Platform } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';
import { Icon } from '@/components/ndop';
import { HeaderBell } from '@/components/header-bell';
import { Loading, colors, fonts } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

export default function TabsLayout() {
  const { session, loading } = useAuth();
  const { t } = useI18n();
  if (loading) return <Loading />;
  if (!session) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.board },
        headerTintColor: colors.chalk,
        headerTitleStyle: { fontFamily: fonts.display, fontSize: 21 },
        headerShadowVisible: false,
        headerRight: () => <HeaderBell />,
        tabBarActiveTintColor: colors.board,
        tabBarInactiveTintColor: '#A8977D',
        tabBarLabelStyle: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16 },
        // Native tab bars size themselves around the safe area; the browser preview needs room for the labels.
        tabBarStyle: Platform.select({
          web: { backgroundColor: colors.card, borderTopColor: colors.border, height: 62, paddingTop: 6, paddingBottom: 8 },
          default: { backgroundColor: colors.card, borderTopColor: colors.border },
        }),
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Ardoise',
          tabBarLabel: t.tabHome,
          tabBarIcon: ({ color }) => <Icon name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="agenda"
        options={{ title: t.tabAgenda, tabBarIcon: ({ color }) => <Icon name="calendar" color={color} /> }}
      />
      <Tabs.Screen
        name="inbox"
        options={{ title: t.tabInbox, tabBarIcon: ({ color }) => <Icon name="inbox" color={color} /> }}
      />
      <Tabs.Screen
        name="results"
        options={{ title: t.tabResults, tabBarIcon: ({ color }) => <Icon name="cap" color={color} /> }}
      />
    </Tabs>
  );
}
