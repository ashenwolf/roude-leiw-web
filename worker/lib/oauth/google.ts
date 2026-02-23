import type { OAuthUserInfo } from "./types.ts";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

type GoogleConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export const getAuthorizationUrl = (config: GoogleConfig, state: string) => {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_URL}?${params}`;
};

export const exchangeCode = async (config: GoogleConfig, code: string): Promise<OAuthUserInfo> => {
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
      code,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(`Google token exchange failed: ${tokenResponse.status}`);
  }

  const { access_token } = (await tokenResponse.json()) as { access_token: string };

  const userResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (!userResponse.ok) {
    throw new Error(`Google userinfo failed: ${userResponse.status}`);
  }

  const profile = (await userResponse.json()) as {
    id: string;
    email: string;
    name: string;
    picture?: string;
  };

  return {
    provider: "google",
    providerId: profile.id,
    email: profile.email,
    name: profile.name,
    avatarUrl: profile.picture ?? null,
  };
};
