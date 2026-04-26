import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Worker, UserProfile } from '../types';
import { 
  Users, 
  UserCheck, 
  UserX, 
  AlertCircle, 
  Building2,
  Globe
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer
} from 'recharts';
import { differenceInDays } from 'date-fns';
import { formatDate, parseDate } from '../utils/dateUtils';

export default function Dashboard() {
  const { profile } = useOutletContext<{ profile: UserProfile | null }>();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;

    const q = query(collection(db, 'workers'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const workerData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Worker));
      setWorkers(workerData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'workers');
      setLoading(false);
    });
    return () => unsubscribe();
  }, [profile]);

  const stats = {
    total: workers.length,
    active: workers.filter(w => w.status === 'Active').length,
    inactive: workers.filter(w => w.status === 'Inactive').length,
    expiringPermits: workers.filter(w => {
      if (!w.permitExpiry) return false;
      const expiry = parseDate(w.permitExpiry);
      if (!expiry) return false;
      const days = differenceInDays(expiry, new Date());
      return days > 0 && days <= 60;
    }).length,
  };

  const nationalityData = Object.entries(
    workers.reduce((acc, w) => {
      acc[w.nationality] = (acc[w.nationality] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value }));

  const COLORS = ['#4f46e5', '#ef4444', '#f59e0b', '#10b981', '#6366f1'];

  if (loading) {
    return <div className="animate-pulse space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-slate-200 rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="h-80 bg-slate-200 rounded-2xl" />
        <div className="h-80 bg-slate-200 rounded-2xl" />
      </div>
    </div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard Overview</h1>
        <p className="text-slate-500 text-xs">Real-time statistics for Foreign Worker Management</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Workers" 
          value={stats.total} 
          icon={Users} 
          color="bg-indigo-500" 
        />
        <StatCard 
          title="Active Workers" 
          value={stats.active} 
          icon={UserCheck} 
          color="bg-emerald-500" 
        />
        <StatCard 
          title="Inactive Workers" 
          value={stats.inactive} 
          icon={UserX} 
          color="bg-slate-400" 
        />
        <StatCard 
          title="Expiring Permits" 
          value={stats.expiringPermits} 
          icon={AlertCircle} 
          color="bg-amber-500" 
          subtitle="Within 60 days"
        />
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Nationality Distribution */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-slate-900 flex items-center">
              <Globe className="w-5 h-5 mr-2 text-indigo-500" />
              Workers by Nationality
            </h3>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={nationalityData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, subtitle }: any) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center">
      <div className={`${color} p-4 rounded-xl text-white mr-4`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <h2 className="text-2xl font-bold text-slate-900">{value}</h2>
        {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}
