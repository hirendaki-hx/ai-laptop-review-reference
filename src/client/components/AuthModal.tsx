import React, { useState } from 'react';
import { Modal } from './ui/Modal.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { LogIn, UserPlus, LogOut, Shield, User, AlertCircle, Check } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'register';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'login',
}) => {
  const { user, profile, isAuthenticated, login, register, logout, role } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      if (mode === 'login') {
        await login(email, password);
        setSuccess('Logged in successfully!');
        setTimeout(() => {
          onClose();
        }, 600);
      } else {
        await register(email, password);
        setSuccess('Account created! Logged in as viewer.');
        setTimeout(() => {
          onClose();
        }, 600);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isAuthenticated ? 'User Account' : mode === 'login' ? 'Sign In' : 'Create Account'}
      maxWidth="max-w-md"
    >
      {isAuthenticated ? (
        <div className="space-y-4 font-mono text-sm">
          <div className="p-4 bg-[#F9F8F6] border border-[#141414] space-y-2">
            <div className="flex items-center space-x-2">
              <User className="w-4 h-4 text-neutral-600" />
              <span className="text-xs text-neutral-500 uppercase">Authenticated As</span>
            </div>
            <div className="font-bold text-[#141414]">{user?.email}</div>
            <div className="flex items-center space-x-2 pt-2 border-t border-neutral-200">
              <Shield className="w-4 h-4 text-[#F27D26]" />
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-700">
                Assigned Role:
              </span>
              <span
                className={`px-2 py-0.5 text-xs font-bold uppercase border ${
                  role === 'admin'
                    ? 'bg-purple-100 text-purple-900 border-purple-400'
                    : role === 'reviewer'
                    ? 'bg-amber-100 text-amber-900 border-amber-400'
                    : 'bg-neutral-100 text-neutral-800 border-neutral-300'
                }`}
              >
                {role}
              </span>
            </div>
          </div>

          <div className="text-xs text-neutral-600 space-y-1">
            {role === 'admin' && (
              <p>• Full administrative access: manage scoring profiles, users, models, and jobs.</p>
            )}
            {role === 'reviewer' && (
              <p>• Reviewer access: extract YouTube reviews, verify specifications, and commit data.</p>
            )}
            {role === 'viewer' && (
              <p>• Read-only access: browse verified laptop database, inspect scores, and compare models.</p>
            )}
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={handleLogout}
              className="flex items-center space-x-2 px-4 py-2 border-2 border-[#141414] bg-white hover:bg-red-50 hover:text-red-700 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 font-mono text-sm">
          {error && (
            <div className="p-3 bg-red-50 border border-red-300 text-red-700 text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs flex items-center space-x-2">
              <Check className="w-4 h-4" />
              <span>{success}</span>
            </div>
          )}

          <div>
            <label className="block text-xs uppercase font-bold text-neutral-600 mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="reviewer@domain.com"
              className="w-full px-3 py-2 border-2 border-[#141414] bg-white text-xs font-mono focus:outline-none focus:bg-[#FFFBEB]"
            />
          </div>

          <div>
            <label className="block text-xs uppercase font-bold text-neutral-600 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 border-2 border-[#141414] bg-white text-xs font-mono focus:outline-none focus:bg-[#FFFBEB]"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError(null);
                setSuccess(null);
              }}
              className="text-xs text-neutral-600 underline hover:text-[#141414] cursor-pointer"
            >
              {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign In'}
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="flex items-center space-x-2 px-5 py-2.5 bg-[#141414] text-white border-2 border-[#141414] hover:bg-[#F27D26] hover:border-[#F27D26] text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer"
            >
              {mode === 'login' ? (
                <>
                  <LogIn className="w-3.5 h-3.5" />
                  <span>{submitting ? 'Authenticating...' : 'Sign In'}</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{submitting ? 'Creating...' : 'Register'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};
