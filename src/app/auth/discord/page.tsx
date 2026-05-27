'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function DiscordAuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const callbackUrl = searchParams.get('callbackUrl');

  // Check if user is already authenticated
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    async function checkSession() {
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' });
        const data = await response.json();

        // Simple check: if authenticated, redirect
        if (data.isAuthenticated && data.volunteerId) {
          console.log('[Auth] User already authenticated, redirecting...');
          
          if (callbackUrl && callbackUrl.startsWith('/')) {
            // Redirect to callback URL if provided and valid
            router.push(callbackUrl);
          } else {
            // Go to volunteer tasks page
            router.push(`/volunteer/tasks?id=${data.volunteerId}`);
          }
        } else {
          // Not authenticated, show login button
          setIsCheckingSession(false);
        }
      } catch (err) {
        console.error('Failed to check session:', err);
        setIsCheckingSession(false);
      }
    }
    
    // Set timeout to prevent infinite loading (max 5 seconds)
    timeoutId = setTimeout(() => {
      console.warn('Session check timeout, showing login button');
      setIsCheckingSession(false);
    }, 5000);
    
    checkSession().finally(() => {
      clearTimeout(timeoutId);
    });
  }, [router, callbackUrl]);

  const handleLogin = async () => {
    try {
      // Store redirect URL for after authentication
      const redirectUrl = callbackUrl || '/volunteer/tasks';
      sessionStorage.setItem('oauth_redirect_url', redirectUrl);
      
      const redirectUri = `${window.location.origin}/api/auth/discord`;
      console.log('[Auth] Redirecting to Discord OAuth:', redirectUri);
      
      // Redirect to Discord
      window.location.href = redirectUri;
    } catch (error) {
      console.error('Failed to initiate Discord OAuth:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to start authentication: ${errorMsg}`);
    }
  };

  // Show loading state while checking session
  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-900 via-secondary-900 to-secondary-900 flex items-center justify-center">
        <div className="text-white text-xl">Checking session...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-secondary-900 to-secondary-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white/10 backdrop-blur-md rounded-3xl p-8 shadow-2xl">
        <div className="text-center space-y-6">
          <div className="text-6xl">🔐</div>
          <h1 className="text-3xl font-bold text-white">Volunteer Login</h1>
          <p className="text-white/80">
            Sign in with Discord to access your volunteer dashboard
          </p>

          <button
            onClick={handleLogin}
            className="w-full bg-gradient-to-r from-secondary-600 via-brand-600 to-accent-600 hover:from-indigo-700 hover:via-purple-700 hover:to-pink-700 text-white font-bold py-4 px-6 rounded-xl transition-all duration-300 transform hover:scale-105 flex items-center justify-center gap-3"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            <span>Login with Discord</span>
          </button>

          <p className="text-white/60 text-sm">
            New volunteer? Login to create your profile!
          </p>
        </div>
      </div>
    </div>
  );
}

export default function DiscordAuthPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-brand-900 via-secondary-900 to-secondary-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    }>
      <DiscordAuthContent />
    </Suspense>
  );
}
