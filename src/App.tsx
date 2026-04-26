import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, getDocFromServer, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile } from './types';
import ErrorBoundary from './components/ErrorBoundary';

// Pages (to be implemented)
import Dashboard from './pages/Dashboard';
import WorkerManagement from './pages/WorkerManagement';
import WorkerProfile from './pages/WorkerProfile';
import ClientManagement from './pages/ClientManagement';
import ClientDetails from './pages/ClientDetails';
import PermitHolderManagement from './pages/PermitHolderManagement';
import Reports from './pages/Reports';
import PermitRenewalList from './pages/PermitRenewalList';
import COMManagement from './pages/COMManagement';
import PlacementHistory from './pages/PlacementHistory';
import WorkerHistory from './pages/WorkerHistory';
import ESPManagement from './pages/ESPManagement';
import ESPHistoryPage from './pages/ESPHistoryPage';
import Letters from './pages/Letters';
import UserManagement from './pages/UserManagement';
import PaymentApprovals from './pages/PaymentApprovals';
import PaymentHistory from './pages/PaymentHistory';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Layout from './components/Layout';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    // Test connection to Firestore as per instructions
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();

    let unsubProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      // Clean up previous profile listener if it exists
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      try {
        if (firebaseUser) {
          setUser(firebaseUser);
          const docRef = doc(db, 'users', firebaseUser.uid);
          
          // Use onSnapshot for real-time profile updates (sync appearance, settings, etc)
          unsubProfile = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
              setProfile(docSnap.data() as UserProfile);
            } else {
              // Create default profile if it doesn't exist
              const email = firebaseUser.email || '';
              const isSuperAdmin = email === 'jewelpatwary1994@gmail.com' || email === 'superadmin@fwms.com';
              
              const newProfile: UserProfile = {
                uid: firebaseUser.uid,
                email: email,
                displayName: firebaseUser.displayName || (isSuperAdmin ? 'Super Admin' : 'User'),
                role: isSuperAdmin ? 'super_admin' : 'viewer',
                createdAt: new Date().toISOString(),
              };

              if (isSuperAdmin) {
                newProfile.permissions = {
                  canManageWorkers: true,
                  canManageClients: true,
                  canManagePermitHolders: true,
                  canManageESP: true,
                  canManageCOM: true,
                  canViewReports: true,
                  canApprovePayments: true,
                };
              }

              setDoc(docRef, newProfile).catch(e => console.error('Error creating profile:', e));
              setProfile(newProfile);
            }
            setIsAuthReady(true);
            setLoading(false);
          }, (error) => {
            console.error('Profile snapshot error:', error);
            setIsAuthReady(true);
            setLoading(false);
          });
        } else {
          setUser(null);
          setProfile(null);
          setIsAuthReady(true);
          setLoading(false);
        }
      } catch (error) {
        console.error('Auth state change error:', error);
        setIsAuthReady(true);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  if (loading || !isAuthReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Router>
        <Toaster position="top-right" />
        <Routes>
          <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
          
          <Route element={user ? <Layout profile={profile} /> : <Navigate to="/login" />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/workers" element={<WorkerManagement />} />
            <Route path="/workers/:id" element={<WorkerProfile />} />
            <Route path="/permit-renewal" element={<PermitRenewalList />} />
            <Route path="/com" element={<COMManagement />} />
            <Route path="/placement-history" element={<PlacementHistory />} />
            <Route path="/placement-history/:workerId" element={<WorkerHistory />} />
            <Route path="/clients" element={<ClientManagement />} />
            <Route path="/clients/:id" element={<ClientDetails />} />
            <Route path="/permit-holders" element={<PermitHolderManagement />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/esp" element={<ESPManagement />} />
            <Route path="/esp/history/:workerId" element={<ESPHistoryPage />} />
            <Route path="/letters" element={<Letters />} />
            <Route path="/user-management" element={<UserManagement />} />
            <Route path="/payment-approvals" element={<PaymentApprovals />} />
            <Route path="/payment-history" element={<PaymentHistory />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/signature" element={<Settings view="signature" />} />
            <Route path="/settings/appearance" element={<Settings view="appearance" />} />
            <Route path="/settings/global" element={<Settings view="global" />} />
            <Route path="/settings/backup" element={<Settings view="backup" />} />
          </Route>
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}
