import { useState, useEffect, useMemo, FormEvent } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { 
  collection, 
  query, 
  onSnapshot, 
  orderBy,
  deleteDoc,
  doc,
  addDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { PlacementHistory as IPlacementHistory, UserProfile, Worker, Client } from '../types';
import { 
  Search, 
  Trash2,
  History,
  Calendar,
  Building2,
  User,
  Plus,
  X,
  MessageSquare,
  Eye,
  Clock
} from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function PlacementHistory() {
  const { profile } = useOutletContext<{ profile: UserProfile | null }>();
  const navigate = useNavigate();
  const [history, setHistory] = useState<IPlacementHistory[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  useEffect(() => {
    if (!profile) return;

    const unsubHistory = onSnapshot(query(collection(db, 'placement_history'), orderBy('createdAt', 'desc')), (snap) => {
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as IPlacementHistory)));
    });

    const unsubWorkers = onSnapshot(collection(db, 'workers'), (snap) => {
      setWorkers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Worker)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'workers');
      setLoading(false);
    });

    const unsubClients = onSnapshot(collection(db, 'clients'), (snap) => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() } as Client)));
    });

    return () => {
      unsubHistory();
      unsubWorkers();
      unsubClients();
    };
  }, [profile]);

  const filteredWorkers = useMemo(() => {
    return workers.filter(w => 
      w.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.workerId.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [workers, searchTerm]);

  const getClientName = (clientId: string) => {
    return clients.find(c => c.id === clientId)?.name || 'No Client';
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this record?')) return;
    try {
      await deleteDoc(doc(db, 'placement_history', id));
      toast.success('Record deleted');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `placement_history/${id}`);
      toast.error('Failed to delete record');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Placement History</h1>
          <p className="text-slate-500 text-sm">Track worker working place records and updates</p>
        </div>
        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center justify-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Manual Record
        </button>
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search by worker name or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
          />
        </div>
      </div>

      {/* Workers Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-indigo-600 border-b border-indigo-700">
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center">Worker ID</th>
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-left">Worker Name</th>
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center">Current Client & History</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredWorkers.map((worker) => (
                <tr key={worker.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">
                    {worker.workerId}
                  </td>
                  <td className="px-4 py-3 text-[13px] font-medium text-slate-900 whitespace-nowrap border border-slate-200 text-left">
                    <div className="flex items-center justify-start gap-2">
                      <User className="w-4 h-4 text-slate-400" />
                      {worker.fullName}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">
                    <div className="flex items-center justify-center gap-4">
                      <div className="flex items-center gap-2 min-w-[150px] justify-center">
                        <Building2 className="w-4 h-4 text-slate-400" />
                        <span className={worker.clientId ? 'text-indigo-600 font-medium whitespace-nowrap' : 'text-slate-400 whitespace-nowrap'}>
                          {getClientName(worker.clientId || '')}
                        </span>
                      </div>
                      <button 
                        onClick={() => navigate(`/placement-history/${worker.id}`)}
                        className="inline-flex items-center px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors text-xs font-medium whitespace-nowrap"
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        View History
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredWorkers.length === 0 && !loading && (
          <div className="p-12 text-center">
            <History className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500">No workers found.</p>
          </div>
        )}
      </div>

      <AddHistoryModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        workers={workers}
        clients={clients}
      />
    </div>
  );
}

function AddHistoryModal({ isOpen, onClose, workers, clients }: { isOpen: boolean, onClose: () => void, workers: Worker[], clients: Client[] }) {
  const [formData, setFormData] = useState({
    workerId: '',
    clientId: '',
    joinDate: '',
    terminationDate: '',
    remark: ''
  });
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!formData.workerId || !formData.clientId) {
      toast.error('Please select worker and client');
      return;
    }

    setIsSaving(true);
    try {
      const worker = workers.find(w => w.id === formData.workerId);
      const client = clients.find(c => c.id === formData.clientId);

      await addDoc(collection(db, 'placement_history'), {
        workerId: formData.workerId,
        workerName: worker?.fullName || 'Unknown',
        clientId: formData.clientId,
        clientName: client?.name || 'Unknown',
        joinDate: formData.joinDate,
        terminationDate: formData.terminationDate,
        remark: formData.remark,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      toast.success('History record added');
      onClose();
      setFormData({ workerId: '', clientId: '', joinDate: '', terminationDate: '', remark: '' });
    } catch (error) {
      toast.error('Failed to add record');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Add Manual History</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">Worker</label>
            <select 
              value={formData.workerId}
              onChange={e => setFormData({...formData, workerId: e.target.value})}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              required
            >
              <option value="">Select Worker</option>
              {workers.map(w => (
                <option key={w.id} value={w.id}>{w.fullName} ({w.workerId})</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">Client</label>
            <select 
              value={formData.clientId}
              onChange={e => setFormData({...formData, clientId: e.target.value})}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              required
            >
              <option value="">Select Client</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">Join Date</label>
              <input 
                type="date"
                value={formData.joinDate}
                onChange={e => setFormData({...formData, joinDate: e.target.value})}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">Termination Date</label>
              <input 
                type="date"
                value={formData.terminationDate}
                onChange={e => setFormData({...formData, terminationDate: e.target.value})}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">Remark</label>
            <textarea 
              value={formData.remark}
              onChange={e => setFormData({...formData, remark: e.target.value})}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm min-h-[80px]"
              placeholder="Optional notes..."
            />
          </div>
          <div className="pt-4 flex gap-3">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={isSaving}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Add Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
