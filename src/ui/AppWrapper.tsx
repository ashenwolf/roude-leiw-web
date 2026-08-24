import { AuthProvider } from "../context/AuthContext.tsx";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
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
            src="/roude-leiw-app.png"
            alt="Roude Leiw"
            className="w-12 h-12 rounded-lg object-cover"
          />
          <h1
            className="text-2xl leading-none"
            style={{ fontFamily: "'Pacifico', cursive" }}
          >
            <span style={{ color: "#EF3340" }}>Roude</span>
            <br />
            <span className="pl-4" style={{ color: "#00A1D6" }}>
              Leiw
            </span>
          </h1>
          <div className="ml-auto">
            <UserMenu />
          </div>
        </header>
        {/* No bottom padding: a page may pin a bar to the frame's bottom edge
            (AppHome's practice-mode bar). Padding here would sit outside that
            bar's containing block and hold it 1.5rem short of the edge, leaving
            a strip for scrolling content to show through. Pages own their own
            bottom spacing. */}
        <main className="relative flex flex-col flex-1 overflow-auto px-6 pt-6 min-h-0">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </AuthProvider>
    </div>
  </div>
);
