import type { Metadata } from 'next';
import './globals.css';
import { ClerkProviderWrapper } from '@/components/clerk-provider-wrapper';

export const metadata: Metadata = {
  title: 'Growth OS — Automated CMO for Ecommerce',
  description: 'AI-powered Meta Ads autopilot that diagnoses problems, generates copy variants, and executes approved changes.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <ClerkProviderWrapper>
          {children}
        </ClerkProviderWrapper>
      </body>
    </html>
  );
}
