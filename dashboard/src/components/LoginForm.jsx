import { useState } from 'react';
import { Zap, Eye, EyeOff } from 'lucide-react';

export default function LoginForm({ onSuccess }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'register') {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: username.trim(),
            email: email || `${username.trim()}@retailos.local`,
            password,
            full_name: fullName || username,
            role: 'owner',
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 400 && data.detail?.includes('already')) {
            setMode('login');
            setError('Account exists. Please log in.');
            setLoading(false);
            return;
          }
          throw new Error(data.detail || 'Registration failed');
        }
        localStorage.setItem('retailos_token', data.access_token);
        localStorage.setItem('token', data.access_token);
        onSuccess();
      } else {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.trim(), password }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || 'Login failed');
        }
        localStorage.setItem('retailos_token', data.access_token);
        localStorage.setItem('token', data.access_token);
        onSuccess();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-[400px]">
        {/* Branding */}
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-[var(--surface-high)] text-[var(--primary)]">
            <Zap size={20} />
          </div>
          <h1 className="font-display text-4xl font-light italic tracking-tight text-[var(--primary)]">
            RetailOS
          </h1>
          <div className="atelier-label mt-2 text-[10px] text-[#8d9192]">
            Retail command center
          </div>
        </div>

        {/* Card */}
        <div className="atelier-panel rounded-lg p-8 shadow-[0_40px_80px_rgba(0,0,0,0.18)]">
          <div className="atelier-label text-[10px] text-[#8bd3d4]">
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </div>
          <h2 className="font-display mt-3 text-3xl font-light italic tracking-tight text-[var(--text)]">
            {mode === 'login' ? 'Welcome back' : 'Get started'}
          </h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            {mode === 'login'
              ? 'Sign in to access your store dashboard.'
              : 'Create your account to get started.'}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="atelier-label mb-2 block text-[10px] text-[#8d9192]">
                Username
              </label>
              <input
                type="text"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                className="atelier-input w-full"
              />
            </div>

            {mode === 'register' && (
              <>
                <div>
                  <label className="atelier-label mb-2 block text-[10px] text-[#8d9192]">
                    Email
                  </label>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="atelier-input w-full"
                  />
                </div>
                <div>
                  <label className="atelier-label mb-2 block text-[10px] text-[#8d9192]">
                    Full Name
                  </label>
                  <input
                    type="text"
                    placeholder="Your full name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="atelier-input w-full"
                  />
                </div>
              </>
            )}

            <div>
              <label className="atelier-label mb-2 block text-[10px] text-[#8d9192]">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="atelier-input w-full pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8d9192] transition hover:text-[var(--text)]"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-[rgba(147,0,10,0.3)] bg-[rgba(147,0,10,0.12)] px-4 py-2.5 text-xs font-medium text-[var(--danger)]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary mt-2 w-full disabled:opacity-50"
            >
              {loading
                ? 'Please wait...'
                : mode === 'login'
                  ? 'Sign In'
                  : 'Create Account'}
            </button>
          </form>

          <div className="mt-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--outline)]" />
            <span className="text-[11px] text-[#8d9192]">or</span>
            <div className="h-px flex-1 bg-[var(--outline)]" />
          </div>

          <button
            type="button"
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
            className="mt-4 w-full rounded-md border border-[var(--outline)] bg-[var(--surface-low)] py-3 text-sm font-medium text-[var(--text-muted)] transition hover:bg-[var(--surface-high)] hover:text-[var(--text)]"
          >
            {mode === 'login'
              ? "Don't have an account? Register"
              : 'Already have an account? Sign in'}
          </button>
        </div>

        <p className="mt-6 text-center text-[11px] text-[#8d9192]/50">
          Autonomous Agent Runtime for Retail Operations
        </p>
      </div>
    </div>
  );
}
