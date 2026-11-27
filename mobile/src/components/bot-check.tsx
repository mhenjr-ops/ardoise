import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import { BOT_CHECK_ON, checkOrigin, checkUrl, createTokenBox, parseCheckMessage, type BotCheckHandle } from '@/lib/bot-check';
import { useI18n } from '@/lib/i18n';

/**
 * Cloudflare's bot check for sign-in, sign-up and demo. Invisible unless Cloudflare wants the
 * person to tick a box; then the box appears here. Read the token with ref.take().
 */
export function BotCheck({ ref }: { ref: Ref<BotCheckHandle> }) {
  const { locale } = useI18n();
  // The package's default type argument (undefined) collapses its props to never under TS 6.
  const view = useRef<WebView<object>>(null);
  const [height, setHeight] = useState(0);
  const [box] = useState(createTokenBox);
  useEffect(() => box.setReset(() => view.current?.injectJavaScript('window.ardoiseReset && window.ardoiseReset(); true;')), [box]);
  useImperativeHandle(ref, () => ({ take: () => box.take() }), [box]);

  if (!BOT_CHECK_ON) return null;
  const origin = checkOrigin();

  return (
    <View style={{ height: Math.max(1, height), overflow: 'hidden' }} pointerEvents={height > 0 ? 'auto' : 'none'}>
      <WebView<object>
        ref={view}
        key={locale}
        source={{ uri: checkUrl(locale) }}
        style={{ backgroundColor: 'transparent' }}
        containerStyle={{ backgroundColor: 'transparent' }}
        originWhitelist={[origin, 'https://challenges.cloudflare.com']}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        setSupportMultipleWindows={false}
        scrollEnabled={false}
        overScrollMode="never"
        // Stay on the check page; Cloudflare's own frame may load inside it.
        onShouldStartLoadWithRequest={(req: ShouldStartLoadRequest) => req.isTopFrame === false || req.url.startsWith(`${origin}/app-check`)}
        onMessage={(e: WebViewMessageEvent) => {
          const msg = parseCheckMessage(e.nativeEvent.data);
          if (!msg) return;
          if (msg.type === 'size') setHeight(Math.min(120, Math.max(0, msg.height)));
          else box.receive(msg);
        }}
        onError={() => box.fail()}
        onHttpError={() => box.fail()}
      />
    </View>
  );
}
