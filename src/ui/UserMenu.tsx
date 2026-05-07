import { usePostHog } from "@posthog/react";

import { useAuth } from "../context/useAuth.ts";

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
      <button
        onClick={handleLogin}
        className="text-sm text-gray-500 hover:text-gray-700 cursor-pointer"
      >
        Sign in
      </button>
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
