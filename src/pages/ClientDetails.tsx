import { useState, useEffect, FormEvent } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { 
  doc, 
  onSnapshot, 
  updateDoc,
  deleteDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Client, UserProfile } from '../types';
import { 
  ChevronLeft,
  Save,
  Building2,
  Trash2,
  Mail,
  Phone,
  MapPin,
  Hash,
  User
} from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function ClientDetails() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useOutletContext<{ profile: UserProfile | null }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<Client>>({});

  useEffect(() => {
    if (!id || !profile) return;

    const unsubscribe = onSnapshot(doc(db, 'clients', id), (snap) => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as Client;
        setClient(data);
        setFormData(data);
      } else {
        toast.error('Client not found');
        navigate('/clients');
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `clients/${id}`);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [id, profile, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!id) return;
    
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'clients', id), formData);
      toast.success('Client updated successfully');
    } catch (error) {
      toast.error('Failed to update client');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !window.confirm('Are you sure you want to delete this client?')) return;
    
    try {
      await deleteDoc(doc(db, 'clients', id));
      toast.success('Client deleted successfully');
      navigate('/clients');
    } catch (error) {
      toast.error('Failed to delete client');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <button 
          onClick={() => navigate('/clients')}
          className="flex items-center text-slate-600 hover:text-slate-900 transition-colors text-sm font-medium"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Clients
        </button>
        <div className="flex gap-3">
          <button 
            onClick={handleDelete}
            className="flex items-center px-4 py-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </button>
          <button 
            onClick={handleSubmit}
            disabled={isSaving}
            className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium disabled:opacity-50"
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-slate-50 bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100">
              <Building2 className="w-8 h-8 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{client?.name}</h1>
              <p className="text-slate-500 text-sm">Client Details & Configuration</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="flex items-center text-[13px] font-medium text-slate-700 mb-1">
                <Building2 className="w-3.5 h-3.5 mr-2 text-slate-400" />
                Company Name
              </label>
              <input 
                type="text"
                value={formData.name || ''}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-[13px]"
              />
            </div>
            <div className="space-y-1">
              <label className="flex items-center text-[13px] font-medium text-slate-700 mb-1">
                <Hash className="w-3.5 h-3.5 mr-2 text-slate-400" />
                REG. Num
              </label>
              <input 
                type="text"
                value={formData.regNum || ''}
                onChange={(e) => setFormData({...formData, regNum: e.target.value})}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-[13px]"
              />
            </div>
            <div className="space-y-1">
              <label className="flex items-center text-[13px] font-medium text-slate-700 mb-1">
                <User className="w-3.5 h-3.5 mr-2 text-slate-400" />
                PIC Name
              </label>
              <input 
                type="text"
                value={formData.picName || ''}
                onChange={(e) => setFormData({...formData, picName: e.target.value})}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-[13px]"
              />
            </div>
            <div className="space-y-1">
              <label className="flex items-center text-[13px] font-medium text-slate-700 mb-1">
                <User className="w-3.5 h-3.5 mr-2 text-slate-400" />
                Contact Person
              </label>
              <input 
                type="text"
                value={formData.contactPerson || ''}
                onChange={(e) => setFormData({...formData, contactPerson: e.target.value})}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-[13px]"
              />
            </div>
            <div className="space-y-1">
              <label className="flex items-center text-[13px] font-medium text-slate-700 mb-1">
                <Mail className="w-3.5 h-3.5 mr-2 text-slate-400" />
                Contact Email
              </label>
              <input 
                type="email"
                value={formData.contactEmail || ''}
                onChange={(e) => setFormData({...formData, contactEmail: e.target.value})}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-[13px]"
              />
            </div>
            <div className="space-y-1">
              <label className="flex items-center text-[13px] font-medium text-slate-700 mb-1">
                <Phone className="w-3.5 h-3.5 mr-2 text-slate-400" />
                Contact Phone
              </label>
              <input 
                type="text"
                value={formData.contactPhone || ''}
                onChange={(e) => setFormData({...formData, contactPhone: e.target.value})}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-[13px]"
              />
            </div>
            <div className="md:col-span-2 space-y-1">
              <label className="flex items-center text-[13px] font-medium text-slate-700 mb-1">
                <MapPin className="w-3.5 h-3.5 mr-2 text-slate-400" />
                Address
              </label>
              <textarea 
                rows={3}
                value={formData.address || ''}
                onChange={(e) => setFormData({...formData, address: e.target.value})}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-[13px] resize-none"
              />
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
