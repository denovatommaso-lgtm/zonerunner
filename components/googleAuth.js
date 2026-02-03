import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';

WebBrowser.maybeCompleteAuthSession();

export function useGoogleAuth() {
  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: '467992768872-4va6iabt6ne3h0t9jbe8fghqbor3124j.apps.googleusercontent.com',
    webClientId: '467992768872-5ba8pm7vpd550s0n3tu9oot1u4bpt17q.apps.googleusercontent.com',
    scopes: ['profile', 'email'],
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const accessToken =
        response.authentication?.accessToken ||
        response.params?.access_token;

      console.log('TOKEN ✅', accessToken);
    }
  }, [response]);

  return {
    promptAsync,
    request,
  };
}