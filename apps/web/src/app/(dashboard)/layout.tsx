import { AuthGate } from '@/components/auth-gate';
import { Sidebar } from '@/components/sidebar';
import { FilterProvider } from '@/contexts/filters';
import { DemoModeProvider } from '@/contexts/demo-mode';
import { DemoBanner } from '@/components/demo-banner';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AuthGate>
        <DemoModeProvider>
          <FilterProvider>
            <Sidebar />
            <main className="flex-1 lg:ml-64 p-4 pt-16 lg:pt-8 lg:p-8 overflow-auto">
              <DemoBanner />
              {children}
            </main>
          </FilterProvider>
        </DemoModeProvider>
      </AuthGate>
    </div>
  );
}
