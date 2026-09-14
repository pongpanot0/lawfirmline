'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Script from 'next/script';

const PIXEL_ID = process.env.NEXT_PUBLIC_FB_PIXEL_ID;

type Fbq = (command: 'track' | 'init', event: string, params?: Record<string, unknown>) => void;

/** No-op when the pixel isn't configured or hasn't loaded yet. */
export function fbTrack(event: string, params?: Record<string, unknown>) {
  const fbq = (window as { fbq?: Fbq }).fbq;
  if (typeof fbq === 'function') fbq('track', event, params);
}

export function FacebookPixel() {
  const pathname = usePathname();
  const firstLoad = useRef(true);

  // The base snippet fires the initial PageView; this covers client-side route changes.
  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    fbTrack('PageView');
  }, [pathname]);

  if (!PIXEL_ID) return null;

  return (
    <>
      <Script id="fb-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${PIXEL_ID}');
fbq('track', 'PageView');`}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  );
}
