'use client';
import { siteConfig } from '@/lib/site-config';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

export default function AdminLoginPage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    // Redirect to dashboard if already authenticated as admin
    if (status === 'authenticated' && session) {
      const isAdmin = (session.user as any)?.isAdmin;
      if (isAdmin) {
        router.push('/admin/dashboard');
      }
    }
  }, [status, session, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-brand-900 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20">
        <h1 className="text-3xl font-bold text-white mb-6 text-center">
          🔐 Admin Access
        </h1>

        <div className="space-y-4">
          <p className="text-white/80 text-center">
            Admin access requires Discord authentication with Zone Leader role.
          </p>

          <a
            href="/auth/discord"
            className="block w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 px-6 rounded-lg transition-colors text-center"
          >
            Login with Discord
          </a>

          <p className="text-white/60 text-sm text-center">
            Only users with Zone Leader role can access the admin dashboard.
          </p>
        </div>

        <p className="text-white/60 text-sm text-center mt-6">
          {siteConfig.name} Volunteer Dashboard
        </p>
      </div>
    </div>
  );
}
