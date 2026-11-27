import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { BOT_CHECK_ON, checkOrigin, checkUrl, createTokenBox, parseCheckMessage, type BotCheckHandle } from '@/lib/bot-check';
import { useI18n } from '@/lib/i18n';

/** The app's web preview: the same check page in an iframe (it only answers its own site). */
export function BotCheck({ ref }: { ref: Ref<BotCheckHandle> }) {
  const { locale } = useI18n();
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(0);
  const origin = checkOrigin();
  const [box] = useState(createTokenBox);
  useEffect(() => box.setReset(() => frame.current?.contentWindow?.postMessage({ source: 'ardoise-app', type: 'reset' }, origin)), [box, origin]);
  useImperativeHandle(ref, () => ({ take: () => box.take() }), [box]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== origin || e.source !== frame.current?.contentWindow) return;
      const msg = parseCheckMessage(e.data);
      if (!msg) return;
      if (msg.type === 'size') setHeight(Math.min(120, Math.max(0, msg.height)));
      else box.receive(msg);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [box, origin]);

  if (!BOT_CHECK_ON) return null;
  return (
    <iframe
      ref={frame}
      key={locale}
      src={checkUrl(locale)}
      title="Cloudflare"
      onError={() => box.fail()}
      style={{ border: 0, width: '100%', height: Math.max(1, height), background: 'transparent', display: 'block' }}
    />
  );
}
