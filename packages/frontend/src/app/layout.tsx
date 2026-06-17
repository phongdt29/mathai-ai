import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'MathAI - Học Toán Online với AI',
  description: 'Nền tảng học toán online cá nhân hóa bằng trí tuệ nhân tạo',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className="min-h-screen bg-gray-50">{children}</body>
    </html>
  );
}
