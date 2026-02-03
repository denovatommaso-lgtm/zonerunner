import React from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

const themeColor = '#020617';

type RootHTMLProps = {
  children: React.ReactNode;
};

export default function RootHTML({ children }: RootHTMLProps) {
  const isProd = process.env.NODE_ENV === 'production';
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content={themeColor} />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="ZoneRunner" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <ScrollViewStyleReset />
      </head>
      <body>
        {children}
        {isProd ? (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                if ('serviceWorker' in navigator) {
                  window.addEventListener('load', () => {
                    navigator.serviceWorker.register('/sw.js').catch(() => {});
                  });
                }
              `,
            }}
          />
        ) : null}
      </body>
    </html>
  );
}
