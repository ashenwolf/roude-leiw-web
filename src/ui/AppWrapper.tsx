interface AppWrapperProps {
  children: React.ReactNode;
}

export function AppWrapper({ children }: AppWrapperProps) {
  return (
    <div className="min-h-screen w-full bg-linear-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-0 md:p-6">
      <div className="w-full h-screen bg-white md:w-[430px] md:h-[932px] md:rounded-[2.5rem] md:border md:border-gray-200 md:shadow-2xl overflow-hidden flex flex-col">
        <header className="flex items-center gap-3 px-6 py-4 border-b border-gray-200 shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-linear-to-br from-red-500 to-yellow-500 flex items-center justify-center">
            <span className="text-white text-xl font-bold">RL</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-800">Roude Leiw</h1>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
