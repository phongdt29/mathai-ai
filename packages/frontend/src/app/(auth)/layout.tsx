import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Branding panel - hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center items-center bg-gradient-to-br from-indigo-600 to-purple-700 text-white p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 text-8xl font-bold">π</div>
          <div className="absolute top-40 right-20 text-6xl font-bold">∑</div>
          <div className="absolute bottom-32 left-20 text-7xl font-bold">∞</div>
          <div className="absolute bottom-20 right-10 text-5xl font-bold">√</div>
          <div className="absolute top-1/2 left-1/3 text-9xl font-bold">∫</div>
        </div>
        <div className="relative z-10 text-center">
          <span className="text-6xl mb-6 block">🧮</span>
          <h1 className="text-4xl font-extrabold mb-4">MathAI</h1>
          <p className="text-xl text-indigo-100 max-w-sm">
            Nền tảng học toán online cá nhân hóa bằng trí tuệ nhân tạo
          </p>
        </div>
      </div>
      {/* Form area */}
      <div className="flex w-full lg:w-1/2 items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-6">
        {children}
      </div>
    </div>
  );
}
