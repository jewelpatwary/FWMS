import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { 
  collection, 
  onSnapshot, 
  addDoc,
  query,
  orderBy,
  deleteDoc,
  doc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { PermitHolder, UserProfile } from '../types';
import { 
  Plus, 
  Search,
  ShieldCheck,
  Trash2,
  X
} from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function PermitHolderManagement() {
  const { profile } = useOutletContext<{ profile: UserProfile | null }>();
  const [permitHolders, setPermitHolders] = useState<PermitHolder[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;

    const q = query(collection(db, 'permit_holders'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      setPermitHolders(snap.docs.map(d => ({ id: d.id, ...d.data() } as PermitHolder)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'permit_holders');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile]);

  const filteredHolders = permitHolders.filter(h => 
    h.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddHolder = async (data: Partial<PermitHolder>) => {
    try {
      await addDoc(collection(db, 'permit_holders'), {
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      toast.success('Permit Holder added successfully');
      setIsModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'permit_holders');
      toast.error('Failed to add permit holder');
    }
  };

  const handleDeleteHolder = async () => {
    if (!deleteId) return;
    try {
      await deleteDoc(doc(db, 'permit_holders', deleteId));
      toast.success('Permit Holder deleted');
      setDeleteId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `permit_holders/${deleteId}`);
      toast.error('Failed to delete permit holder');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Permit Holder Management</h1>
          <p className="text-slate-500 text-xs">Manage entities that hold worker permits</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Permit Holder
        </button>
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search permit holders..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-xs"
          />
        </div>
      </div>

      {/* Holder List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse border border-slate-200">
            <thead>
              <tr className="bg-indigo-600 border-b border-indigo-700">
                <th className="px-6 py-3 text-xs font-bold text-white uppercase tracking-wider border border-indigo-500 text-center whitespace-nowrap">Holder Name</th>
                <th className="px-6 py-3 text-xs font-bold text-white uppercase tracking-wider border border-indigo-500 text-center whitespace-nowrap">REG. Num</th>
                <th className="px-6 py-3 text-xs font-bold text-white uppercase tracking-wider border border-indigo-500 text-center whitespace-nowrap">Contact</th>
                <th className="px-6 py-3 text-xs font-bold text-white uppercase tracking-wider border border-indigo-500 text-center whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredHolders.map((holder) => (
                <tr key={holder.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-3 text-[13px] font-medium text-slate-900 border border-slate-200 text-center whitespace-nowrap">{holder.name}</td>
                  <td className="px-6 py-3 text-[13px] text-slate-600 border border-slate-200 text-center whitespace-nowrap">{holder.regNum || '-'}</td>
                  <td className="px-6 py-3 text-[13px] text-slate-600 border border-slate-200 text-center whitespace-nowrap">
                    {holder.contactPerson && <div className="font-medium">{holder.contactPerson}</div>}
                    {holder.contactPhone && <div className="text-xs">{holder.contactPhone}</div>}
                  </td>
                  <td className="px-6 py-3 text-right border border-slate-200 whitespace-nowrap">
                    <div className="flex justify-center">
                      <button 
                        onClick={() => setDeleteId(holder.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredHolders.length === 0 && !loading && (
          <div className="p-12 text-center">
            <ShieldCheck className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500">No permit holders found.</p>
          </div>
        )}
      </div>

      {isModalOpen && (
        <AddPermitHolderModal 
          onClose={() => setIsModalOpen(false)} 
          onAdd={handleAddHolder}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[80] p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center gap-4 mb-6 text-red-600">
              <div className="p-3 bg-red-50 rounded-full">
                <Trash2 className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold">Confirm Deletion</h2>
            </div>
            <p className="text-slate-600 mb-8">
              Are you sure you want to delete this permit holder? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setDeleteId(null)}
                className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl font-medium text-slate-600 hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleDeleteHolder}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AddPermitHolderModal({ onClose, onAdd }: { onClose: () => void, onAdd: (data: Partial<PermitHolder>) => void }) {
  const [formData, setFormData] = useState({
    name: '',
    regNum: '',
    contactPerson: '',
    contactEmail: '',
    contactPhone: '',
    address: ''
  });

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-bold text-slate-900">Add New Permit Holder</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        
        <form onSubmit={(e) => {
          e.preventDefault();
          onAdd(formData);
        }} className="space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-slate-700 mb-1">Holder Name *</label>
            <input 
              type="text" required
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-[13px]"
              placeholder="Enter holder name"
            />
          </div>
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
              placeholder="Address"
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
              Add Holder
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
