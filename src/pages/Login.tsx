import React, { useState } from 'react';
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { LogIn, Mail, Lock, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const trimmedEmail = email.trim();
      const trimmedPassword = password.trim();
      await signInWithEmailAndPassword(auth, trimmedEmail, trimmedPassword);
      navigate('/');
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Identifiants incorrects. Veuillez réessayer.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('La connexion par Email/Mot de passe n\'est pas activée dans votre console Firebase. Veuillez l\'activer dans Authentification > Sign-in method.');
      } else {
        setError(err.message || 'Une erreur est survenue lors de la connexion.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      navigate('/');
    } catch (err: any) {
      setError('Erreur lors de la connexion avec Google.');
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-main)] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Subtle Background Pattern */}
      <div className="absolute inset-0 opacity-[0.05] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #20426B 1px, transparent 0)', backgroundSize: '40px 40px' }}></div>
      
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-[400px] space-y-8 relative z-10"
      >
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="flex items-center font-black text-5xl tracking-tighter text-brand">
            NSC<div className="w-10 h-10 border-4 border-brand mx-1 flex items-center justify-center">
              <div className="w-2 h-5 bg-[#8dbd4a]"></div>
            </div>M
          </div>
          <div className="space-y-1">
            <p className="text-slate-500 text-sm font-medium">Portail de Pointage & Gestion</p>
          </div>
        </div>

        <div className="bg-white border border-[var(--color-border)] p-8 rounded-xl shadow-xl">
          {error && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-md flex items-center gap-3 text-red-400 text-xs font-medium"
            >
              <AlertCircle size={16} />
              <span>{error}</span>
            </motion.div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500 ml-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white border border-[var(--color-border)] rounded-md py-2.5 pl-10 pr-4 text-slate-900 text-sm focus:outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/20 transition-all placeholder:text-slate-400"
                  placeholder="nom@agence.fr"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between ml-1">
                <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Mot de passe</label>
                <button type="button" className="text-[10px] font-bold text-brand hover:underline">Oublié ?</button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white border border-[var(--color-border)] rounded-md py-2.5 pl-10 pr-4 text-slate-900 text-sm focus:outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/20 transition-all placeholder:text-slate-400"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand hover:bg-brand/90 text-white font-bold py-2.5 rounded-md shadow-sm transition-all active:scale-[0.99] disabled:opacity-50 text-sm"
            >
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--color-border)]"></div>
            </div>
            <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-widest">
              <span className="bg-[var(--color-bg-sidebar)] px-3 text-slate-500">Ou continuer avec</span>
            </div>
          </div>

          <button
            onClick={handleGoogleLogin}
            className="w-full bg-white border border-[var(--color-border)] text-slate-700 font-bold py-2.5 rounded-md flex items-center justify-center gap-3 hover:bg-slate-50 transition-all active:scale-[0.99] text-sm"
          >
            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-4 h-4" />
            Google
          </button>
        </div>

        <p className="text-center text-xs text-slate-500">
          En vous connectant, vous acceptez nos <button className="text-brand hover:underline">Conditions d'utilisation</button>.
        </p>
      </motion.div>
    </div>
  );
}
