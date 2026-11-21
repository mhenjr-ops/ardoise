import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/text';
import { Icon } from '@/components/ndop';
import { colors, fonts } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

/** Bell with the unread count; opens the notifications screen. */
export function HeaderBell() {
  const { session } = useAuth();
  const [unread, setUnread] = useState(0);
  const userId = session?.user.id;

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let alive = true;
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('read_at', null)
        .then(({ count }) => {
          if (alive) setUnread(count ?? 0);
        });
      return () => {
        alive = false;
      };
    }, [userId]),
  );

  return (
    <Pressable onPress={() => router.push('/notifications')} hitSlop={12} style={{ marginRight: 16 }} accessibilityLabel="Notifications">
      <Icon name="bell" color={colors.chalk} size={23} />
      {unread > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: -5,
            right: -7,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: colors.ochre,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 4,
            borderWidth: 2,
            borderColor: colors.board,
          }}
        >
          <Text style={{ fontSize: 10.5, fontFamily: fonts.heavy, color: '#12100C' }}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
