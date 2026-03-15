import { AuthGate } from '@/components/auth-gate';
import { Sidebar } from '@/components/sidebar';
import { FilterProvider } from '@/contexts/filters';
import { DemoModeProvider } from '@/contexts/demo-mode';
import { ClientProvider } from '@/contexts/client';
import { DemoBanner } from '@/components/demo-banner';
import { MeshGradientBg } from '@/components/ui/mesh-gradient-bg';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <MeshGradientBg />
      <AuthGate>
        <DemoModeProvider>
          <ClientProvider>
          <FilterProvider>
            <Sidebar />
            <main className="flex-1 lg:ml-64 p-4 pt-16 lg:pt-8 lg:p-8 overflow-auto">
              <DemoBanner />
              {children}
            </main>
          </FilterProvider>
          </ClientProvider>
        </DemoModeProvider>
      </AuthGate>
    </div>
  );
}
