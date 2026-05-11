import { usePostHog } from "@posthog/react";

import { useAuth } from "../context/useAuth.ts";
import { Button } from "./Button.tsx";

export const UserMenu = () => {
  const { auth, login, logout } = useAuth();
  const posthog = usePostHog();

  if (auth.status === "loading") return null;

  if (auth.status === "unauthenticated") {
    const handleLogin = () => {
      posthog?.capture("sign_in_clicked");
      login();
    };
    return (
      <Button size="sm" fullWidth={false} onClick={handleLogin}>
        Sign in
      </Button>
    );
  }

  const handleLogout = () => {
    posthog?.capture("sign_out_clicked");
    logout();
  };

  return (
    <button
      onClick={handleLogout}
      className="flex items-center gap-2 cursor-pointer"
    >
      {auth.user.avatarUrl ? (
        <img
          src={auth.user.avatarUrl}
          alt={auth.user.name}
          className="w-8 h-8 rounded-full"
        />
      ) : (
        <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-sm font-medium text-gray-600">
          {auth.user.name[0]}
        </div>
      )}
    </button>
  );
};
