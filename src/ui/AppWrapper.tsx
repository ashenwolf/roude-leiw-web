import { AuthProvider } from "../context/AuthContext.tsx";
import { UserMenu } from "./UserMenu.tsx";

type AppWrapperProps = {
  children: React.ReactNode;
};

export const AppWrapper = ({ children }: AppWrapperProps) => (
  <div className="min-h-dvh w-full bg-linear-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-0 md:p-6">
    <div className="w-full h-dvh bg-white md:w-[430px] md:h-[932px] md:rounded-[2.5rem] md:border md:border-gray-200 md:shadow-2xl overflow-hidden flex flex-col">
      <AuthProvider>
        <header
          className="flex items-center gap-3 px-6 pb-4 border-b border-gray-200 shadow-sm shrink-0"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 1rem)" }}
        >
          <img
            src="/image.png"
            alt="Roude Leiw"
            className="w-10 h-10 rounded-lg object-cover"
          />
          <h1 className="text-2xl font-semibold text-gray-800">Roude Leiw</h1>
          <div className="ml-auto">
            <UserMenu />
          </div>
        </header>
        <main className="relative flex-1 overflow-auto p-6 min-h-0">
          {children}
        </main>
      </AuthProvider>
    </div>
  </div>
);
