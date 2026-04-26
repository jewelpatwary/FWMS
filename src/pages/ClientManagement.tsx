import { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { 
  collection, 
  onSnapshot, 
  addDoc,
  query,
  orderBy
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Client, UserProfile } from '../types';
import { 
  Plus, 
  Search,
  Building2,
  Eye,
  X
} from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function ClientManagement() {
  const { profile } = useOutletContext<{ profile: UserProfile | null }>();
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (!profile) return;

    const q = query(collection(db, 'clients'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() } as Client)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'clients');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile]);

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddClient = async (data: Partial<Client>) => {
    try {
      await addDoc(collection(db, 'clients'), {
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      toast.success('Client added successfully');
      setIsModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'clients');
      toast.error('Failed to add client');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Client Management</h1>
          <p className="text-slate-500 text-xs">Manage your client companies and their details</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Client
        </button>
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search clients..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-xs"
          />
        </div>
      </div>

      {/* Client List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-280px)]">
        <div className="overflow-auto flex-1 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100">
          <table className="w-full text-left border-collapse border border-slate-200 min-w-max">
            <thead className="sticky top-0 z-20 shadow-sm">
              <tr className="bg-indigo-600 border-b border-indigo-700">
                <th className="px-6 py-3 text-xs font-bold text-white uppercase tracking-wider border border-indigo-500 text-center whitespace-nowrap">Client Name</th>
                <th className="px-6 py-3 text-xs font-bold text-white uppercase tracking-wider border border-indigo-500 text-center whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredClients.map((client) => (
                <tr key={client.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-3 text-[13px] font-medium text-slate-900 border border-slate-200 text-center whitespace-nowrap">{client.name}</td>
                  <td className="px-6 py-3 text-right border border-slate-200 whitespace-nowrap">
                    <div className="flex justify-center">
                      <button 
                        onClick={() => navigate(`/clients/${client.id}`)}
                        className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1.5" />
                        Show
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredClients.length === 0 && !loading && (
          <div className="p-12 text-center">
            <Building2 className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500">No clients found.</p>
          </div>
        )}
      </div>

      {isModalOpen && (
        <AddClientModal 
          onClose={() => setIsModalOpen(false)} 
          onAdd={handleAddClient}
        />
      )}
    </div>
  );
}

function AddClientModal({ onClose, onAdd }: { onClose: () => void, onAdd: (data: Partial<Client>) => void }) {
  const [formData, setFormData] = useState({
    name: '',
    regNum: '',
    picName: '',
    contactPerson: '',
    contactEmail: '',
    contactPhone: '',
    address: ''
  });

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-bold text-slate-900">Add New Client</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        
        <form onSubmit={(e) => {
          e.preventDefault();
          onAdd(formData);
        }} className="space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-slate-700 mb-1">Company Name *</label>
            <input 
              type="text" required
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-[13px]"
              placeholder="Enter company name"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-medium text-slate-700 mb-1">REG. Num</label>
              <input 
                type="text"
                value={formData.regNum}
                onChange={e => setFormData({...formData, regNum: e.target.value})}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-[13px]"
                placeholder="Registration number"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-slate-700 mb-1">PIC Name</label>
              <input 
                type="text"
                value={formData.picName}
                onChange={e => setFormData({...formData, picName: e.target.value})}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-[13px]"
                placeholder="PIC name"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-medium text-slate-700 mb-1">Contact Person</label>
              <input 
                type="text"
                value={formData.contactPerson}
                onChange={e => setFormData({...formData, contactPerson: e.target.value})}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-[13px]"
                placeholder="Contact person"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-slate-700 mb-1">Contact Phone</label>
              <input 
                type="text"
                value={formData.contactPhone}
                onChange={e => setFormData({...formData, contactPhone: e.target.value})}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-[13px]"
                placeholder="Contact phone"
              />
            </div>
          </div>
          <div>
            <label className="block text-[13px] font-medium text-slate-700 mb-1">Contact Email</label>
            <input 
              type="email"
              value={formData.contactEmail}
              onChange={e => setFormData({...formData, contactEmail: e.target.value})}
              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-[13px]"
              placeholder="Contact email"
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-slate-700 mb-1">Address</label>
            <textarea 
              value={formData.address}
              onChange={e => setFormData({...formData, address: e.target.value})}
              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-[13px]"
              placeholder="Company address"
              rows={3}
            />
          </div>
          
          <div className="flex gap-3 pt-4">
            <button 
              type="button" onClick={onClose}
              className="flex-1 px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-xl transition-colors text-[13px]"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors text-[13px]"
            >
              Add Client
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
