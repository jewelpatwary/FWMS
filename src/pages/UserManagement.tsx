import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { collection, onSnapshot, query, orderBy, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile, UserRole, UserPermissions } from '../types';
import { formatDate } from '../utils/dateUtils';
import { 
  Users, 
  Shield, 
  Mail, 
  Key, 
  Plus, 
  X, 
  CheckCircle2, 
  AlertCircle,
  Lock,
  Eye,
  EyeOff,
  Settings
} from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function UserManagement() {
  const { profile } = useOutletContext<{ profile: UserProfile | null }>();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  const [showPasswordsInTable, setShowPasswordsInTable] = useState<{[key: string]: boolean}>({});

  // Form state
  const [userLoginId, setUserLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRole>('viewer');
  const [showPassword, setShowPassword] = useState(false);
  const [permissions, setPermissions] = useState<UserPermissions>({
    canManageWorkers: true,
    canManageClients: true,
    canManagePermitHolders: true,
    canManageESP: true,
    canManageCOM: true,
    canViewReports: true,
    canApprovePayments: false,
  });

  useEffect(() => {
    if (!profile || profile.role !== 'super_admin') return;

    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile]);

  const handleOpenEdit = (user: UserProfile) => {
    setEditingUser(user);
    // Extract ID from email (remove @fwms.com)
    const loginId = user.email.includes('@fwms.com') ? user.email.split('@fwms.com')[0] : user.email;
    setUserLoginId(loginId);
    setDisplayName(user.displayName);
    setRole(user.role);
    setPassword(user.password || '');
    setPermissions(user.permissions || {
      canManageWorkers: true,
      canManageClients: true,
      canManagePermitHolders: true,
      canManageESP: true,
      canManageCOM: true,
      canViewReports: true,
      canApprovePayments: false,
    });
    setIsModalOpen(true);
  };

  const handleCreateOrUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userLoginId || (!editingUser && !password) || !displayName) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSubmitting(true);

    const email = userLoginId.includes('@') ? userLoginId : `${userLoginId}@fwms.com`;

    if (editingUser) {
      try {
        await setDoc(doc(db, 'users', editingUser.uid), {
          ...editingUser,
          displayName,
          role,
          password,
          permissions,
          updatedAt: new Date().toISOString(),
        });
        toast.success('User profile updated successfully');
        setIsModalOpen(false);
        resetForm();
      } catch (error: any) {
        toast.error(error.message);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Check if user ID already exists in our local list to avoid Auth error
    const exists = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (exists) {
      toast.error('This User ID already exists in the system.');
      setSubmitting(false);
      return;
    }

    let secondaryApp;
    try {
      // Create user using a secondary app instance to avoid logging out current admin
      secondaryApp = initializeApp(firebaseConfig, 'SecondaryApp');
      const secondaryAuth = getAuth(secondaryApp);
      
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      const newUid = userCredential.user.uid;

      // Store user profile in Firestore using the main db instance
      await setDoc(doc(db, 'users', newUid), {
        uid: newUid,
        email,
        displayName,
        role,
        password,
        permissions: permissions || {
          canManageWorkers: true,
          canManageClients: true,
          canManagePermitHolders: true,
          canManageESP: true,
          canManageCOM: true,
          canViewReports: true,
          canApprovePayments: false,
        },
        createdAt: new Date().toISOString(),
      });

      toast.success('User created successfully');
      setIsModalOpen(false);
      resetForm();
    } catch (error: any) {
      console.error("Error creating user:", error);
      const errorCode = error.code || (error.message && error.message.includes('auth/email-already-in-use') ? 'auth/email-already-in-use' : null);
      
      if (errorCode === 'auth/email-already-in-use') {
        toast.error('This User ID is already registered.');
      } else if (errorCode === 'auth/weak-password') {
        toast.error('The password is too weak. Please use at least 6 characters.');
      } else if (errorCode === 'auth/invalid-email') {
        toast.error('The User ID format is not valid.');
      } else {
        toast.error(error.message || 'Failed to create user account');
      }
    } finally {
      if (secondaryApp) {
        try {
          await deleteApp(secondaryApp);
        } catch (e) {
          console.error("Error deleting secondary app:", e);
        }
      }
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setUserLoginId('');
    setPassword('');
    setDisplayName('');
    setRole('viewer');
    setEditingUser(null);
    setPermissions({
      canManageWorkers: true,
      canManageClients: true,
      canManagePermitHolders: true,
      canManageESP: true,
      canManageCOM: true,
      canViewReports: true,
      canApprovePayments: false,
    });
  };

  const togglePermission = (key: keyof UserPermissions) => {
    setPermissions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const filteredUsers = users.filter(u => 
    u.uid !== profile?.uid && (
      u.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.role?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const handleDeleteProfile = async (uid: string) => {
    try {
      await deleteDoc(doc(db, 'users', uid));
      toast.success('User profile deleted successfully');
      setDeletingUid(null);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleSendReset = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
      toast.success('Password reset email sent');
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  if (profile?.role !== 'super_admin') {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-slate-500">
        <Lock className="w-12 h-12 mb-4 opacity-20" />
        <p>Only Super Admins can access this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          <p className="text-slate-500 text-xs">Manage system users and their permissions</p>
        </div>
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search users by name, email or role..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>
          <button
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
            className="flex items-center px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 shadow-md transition-all whitespace-nowrap"
          >
            <Plus className="w-5 h-5 mr-2" />
            Create New User
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">User Name</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">User ID</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">Password</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">Role</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">Created At</th>
                <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredUsers.map((user) => (
                <tr key={user.uid} className="hover:bg-slate-50/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="text-sm font-semibold text-slate-900">{user.displayName}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-mono text-slate-600 bg-slate-100 px-2 py-1 rounded inline-block">
                      {user.email.split('@')[0]}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-mono text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-200 min-w-[100px]">
                        {showPasswordsInTable[user.uid] ? (user.password || '******') : '••••••••'}
                      </div>
                      <button 
                        onClick={() => setShowPasswordsInTable(prev => ({ ...prev, [user.uid]: !prev[user.uid] }))}
                        className="p-1 hover:bg-slate-100 rounded text-slate-400 transition-colors"
                      >
                        {showPasswordsInTable[user.uid] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      user.role === 'super_admin' ? 'bg-rose-100 text-rose-700' :
                      user.role === 'admin' ? 'bg-indigo-100 text-indigo-700' :
                      user.role === 'hr' ? 'bg-emerald-100 text-emerald-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      <Shield className="w-3 h-3 mr-1" />
                      {user.role.replace('_', ' ').toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {user.createdAt ? formatDate(user.createdAt) : '-'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleOpenEdit(user)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        title="Edit User"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeletingUid(user.uid)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                        title="Delete Profile"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deletingUid && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center text-rose-600 mb-4">
              <AlertCircle className="w-6 h-6 mr-2" />
              <h3 className="text-lg font-bold">Delete User Profile?</h3>
            </div>
            <p className="text-slate-600 mb-6">
              This will remove the user's permissions and profile data from the system. 
              <span className="font-bold text-rose-600 block mt-2">Note: Their login account will NOT be deleted. They can still log in, but will have no permissions.</span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeletingUid(null)}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteProfile(deletingUid)}
                className="flex-1 px-4 py-2 bg-rose-600 text-white rounded-xl font-semibold hover:bg-rose-700 shadow-md transition-all"
              >
                Delete Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-lg font-bold text-slate-900">
                {editingUser ? 'Edit User Permissions' : 'Create New System User'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <form onSubmit={handleCreateOrUpdateUser} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Full Name</label>
                  <div className="relative">
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="John Doe"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">User Login ID</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={userLoginId}
                      onChange={(e) => setUserLoginId(e.target.value)}
                      disabled={!!editingUser}
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-slate-50 disabled:text-slate-400"
                      placeholder="e.g. john_doe"
                      required
                    />
                  </div>
                  {editingUser && (
                    <p className="text-[10px] text-amber-600 font-medium">To change Login ID, delete this user and create a new one.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Login Password</label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-12 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="••••••••"
                      required={!editingUser}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4 text-slate-400" /> : <Eye className="w-4 h-4 text-slate-400" />}
                    </button>
                  </div>
                  {editingUser && (
                    <p className="text-[10px] text-indigo-600 font-medium italic">Changes here will update visibility in the table and internal records.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">System Role</label>
                  <div className="relative">
                    <Shield className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as UserRole)}
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none appearance-none"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="hr">HR Staff</option>
                      <option value="admin">Admin</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-bold text-slate-900 border-b border-slate-100 pb-2">Permissions</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(permissions).map(([key, value]) => (
                    <label key={key} className="flex items-center p-3 border border-slate-100 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={value}
                        onChange={() => togglePermission(key as keyof UserPermissions)}
                        className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                      />
                      <span className="ml-3 text-sm font-medium text-slate-700">
                        {key.replace('can', '').replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 shadow-md transition-all disabled:opacity-50 flex items-center justify-center"
                >
                  {submitting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    editingUser ? 'Save Changes' : 'Create User Account'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
