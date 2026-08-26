import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Clocker',
  description: 'Personal project and time tracking workspace',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
