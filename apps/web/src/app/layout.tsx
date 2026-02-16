import type { Metadata } from 'next';
import './globals.css';
import { AuthGate } from '@/components/auth-gate';
import { Sidebar } from '@/components/sidebar';
import { FilterProvider } from '@/contexts/filters';

export const metadata: Metadata = {
  title: 'Growth OS — Executive Dashboard',
  description: 'Unified analytics for DTC growth teams',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen">
        <AuthGate>
          <FilterProvider>
            <Sidebar />
            <main className="flex-1 lg:ml-64 p-4 pt-16 lg:pt-8 lg:p-8 overflow-auto">{children}</main>
          </FilterProvider>
        </AuthGate>
      </body>
    </html>
  );
}
