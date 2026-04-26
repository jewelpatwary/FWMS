import { useState, FormEvent } from 'react';
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { auth } from '../firebase';
import { toast } from 'react-hot-toast';
import { LogIn, Sparkles } from 'lucide-react';

export default function Login() {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showInit, setShowInit] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Convert User ID to email if it's not already an email
    const email = userId.includes('@') ? userId : `${userId}@fwms.com`;

    try {
      await signInWithEmailAndPassword(auth, email, password);
      toast.success('Logged in successfully');
    } catch (error: any) {
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        toast.error('Invalid User ID or password.');
        // Show init option if it's potentially the first time setup
        if (userId === 'superadmin' || userId === 'superadmin@fwms.com') {
          setShowInit(true);
        }
      } else if (error.code === 'auth/invalid-email') {
        toast.error('The User ID format is not valid.');
      } else {
        console.error('Auth error:', error);
        toast.error(error.message || 'Authentication failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const initializeSuperAdmin = async () => {
    if (userId !== 'superadmin' && userId !== 'superadmin@fwms.com') {
      toast.error('Only the superadmin ID can be initialized as the primary account.');
      return;
    }
    
    if (password !== 'superadmin123') {
      toast.error('Please use the default password for initialization: superadmin123');
      return;
    }

    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, 'superadmin@fwms.com', 'superadmin123');
      toast.success('Super Admin account initialized! You can now sign in.');
      setShowInit(false);
    } catch (error: any) {
      if (error.code === 'auth/email-already-in-use') {
        toast.error('Super Admin already exists. Try logging in normally.');
        setShowInit(false);
      } else {
        toast.error(error.message || 'Failed to initialize account');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-indigo-600 mb-2">FWMS Malaysia</h1>
          <p className="text-slate-500">Foreign Worker Management System</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">User ID</label>
            <input
              type="text"
              required
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
              placeholder="e.g. admin or superadmin"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-2 rounded-lg font-medium hover:bg-indigo-700 focus:ring-4 focus:ring-indigo-100 transition-all flex items-center justify-center disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <LogIn className="w-5 h-5 mr-2" />
                Sign In
              </>
            )}
          </button>

          {showInit && (
            <div className="mt-4 p-4 bg-indigo-50 border border-indigo-100 rounded-xl space-y-3">
              <p className="text-xs text-indigo-700 font-medium">
                If this is the first time setting up the system, you may need to initialize the main Super Admin account in the authentication database.
              </p>
              <button
                type="button"
                onClick={initializeSuperAdmin}
                disabled={loading}
                className="w-full bg-white text-indigo-600 border border-indigo-200 py-2 rounded-lg text-sm font-bold hover:bg-indigo-100 transition-all flex items-center justify-center shadow-sm"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Initialize Super Admin Account
              </button>
            </div>
          )}
        </form>


        <div className="mt-8 pt-8 border-t border-slate-100 text-center">
          <div className="mb-4 text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100">
            <p className="font-bold mb-1">Default Credentials:</p>
            <p>Super Admin ID: <span className="font-mono text-indigo-600">superadmin</span> / <span className="font-mono text-indigo-600">superadmin123</span></p>
          </div>
          <p className="text-xs text-slate-400">
            Secure access to Malaysia's premier foreign worker management platform.
          </p>
        </div>
      </div>
    </div>
  );
}
