import { useState, useEffect } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { 
  doc, 
  onSnapshot, 
  updateDoc, 
  collection, 
  query, 
  where, 
  addDoc,
  setDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Worker, Permit, Passport, CustomField, WorkerCustomValue, UserProfile, Client, PermitHolder, ESPHistory } from '../types';
import { 
  User, 
  FileText, 
  CreditCard, 
  MapPin, 
  Settings, 
  ChevronLeft,
  Save,
  Plus,
  Calendar,
  AlertCircle,
  History,
  Clock,
  X,
  Building2
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { AuditLog, PlacementHistory as IPlacementHistory } from '../types';
import { formatDate, formatDateTime, parseDate } from '../utils/dateUtils';

export default function WorkerProfile() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useOutletContext<{ profile: UserProfile | null }>();
  const navigate = useNavigate();
  const [worker, setWorker] = useState<Worker | null>(null);
  const [permits, setPermits] = useState<Permit[]>([]);
  const [passports, setPassports] = useState<Passport[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [permitHolders, setPermitHolders] = useState<PermitHolder[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customValues, setCustomValues] = useState<WorkerCustomValue[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [placementHistory, setPlacementHistory] = useState<IPlacementHistory[]>([]);
  const [espHistory, setEspHistory] = useState<ESPHistory[]>([]);
  const [activeTab, setActiveTab] = useState('personal');
  const [editData, setEditData] = useState<Partial<Worker>>({});
  const [isSaving, setIsSaving] = useState(false);

  const calculateAge = (dob: string | undefined) => {
    const date = parseDate(dob);
    if (!date) return '-';
    const today = new Date();
    let age = today.getFullYear() - date.getFullYear();
    const m = today.getMonth() - date.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < date.getDate())) {
      age--;
    }
    return age;
  };

  const calculateValidity = (expiry: string | undefined) => {
    const date = parseDate(expiry);
    if (!date) return '-';
    const today = new Date();
    const diffTime = date.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'Expired';
    if (diffDays < 30) return `${diffDays} days`;
    const months = Math.floor(diffDays / 30);
    return `${months} months`;
  };

  useEffect(() => {
    if (worker) {
      setEditData(worker);
    }
  }, [worker]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !profile) return;

    const unsubWorker = onSnapshot(doc(db, 'workers', id), (snap) => {
      if (snap.exists()) {
        setWorker({ id: snap.id, ...snap.data() } as Worker);
      } else {
        toast.error('Worker not found');
        navigate('/workers');
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `workers/${id}`);
      setLoading(false);
    });

    const unsubPermits = onSnapshot(query(collection(db, 'permits'), where('workerId', '==', id)), (snap) => {
      setPermits(snap.docs.map(d => ({ id: d.id, ...d.data() } as Permit)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'permits');
    });

    const unsubPassports = onSnapshot(query(collection(db, 'passports'), where('workerId', '==', id)), (snap) => {
      setPassports(snap.docs.map(d => ({ id: d.id, ...d.data() } as Passport)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'passports');
    });

    const unsubFields = onSnapshot(collection(db, 'custom_fields'), (snap) => {
      setCustomFields(snap.docs.map(d => ({ id: d.id, ...d.data() } as CustomField)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'custom_fields');
    });

    const unsubValues = onSnapshot(query(collection(db, 'worker_custom_values'), where('workerId', '==', id)), (snap) => {
      setCustomValues(snap.docs.map(d => ({ id: d.id, ...d.data() } as WorkerCustomValue)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'worker_custom_values');
    });

    const unsubLogs = onSnapshot(query(collection(db, 'audit_logs'), where('workerId', '==', id)), (snap) => {
      const logs = snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog));
      setAuditLogs(logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'audit_logs');
    });

    const unsubClients = onSnapshot(collection(db, 'clients'), (snap) => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() } as Client)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'clients');
    });

    const unsubHolders = onSnapshot(collection(db, 'permit_holders'), (snap) => {
      setPermitHolders(snap.docs.map(d => ({ id: d.id, ...d.data() } as PermitHolder)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'permit_holders');
    });

    const unsubPlacement = onSnapshot(query(collection(db, 'placement_history'), where('workerId', '==', id)), (snap) => {
      setPlacementHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as IPlacementHistory)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'placement_history');
    });

    const unsubEspHistory = onSnapshot(query(collection(db, 'esp_history'), where('workerId', '==', id)), (snap) => {
      setEspHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as ESPHistory)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'esp_history');
    });

    return () => {
      unsubWorker();
      unsubPermits();
      unsubPassports();
      unsubFields();
      unsubValues();
      unsubLogs();
      unsubClients();
      unsubHolders();
      unsubPlacement();
      unsubEspHistory();
    };
  }, [id, profile]);

  const handleUpdateWorker = async () => {
    if (!id || !worker || !profile) return;
    setIsSaving(true);

    try {
      const updates: any = {};
      const logPromises: Promise<any>[] = [];

      // Check for changes and create audit logs
      Object.entries(editData).forEach(([key, value]) => {
        const fieldKey = key as keyof Worker;
        if (worker[fieldKey] !== value) {
          updates[fieldKey] = value;

          // Auto-deactivate if Request COM is selected
          if (fieldKey === 'acknowledgement' && value === 'Request COM') {
            updates.status = 'Inactive';
          }

          logPromises.push(addDoc(collection(db, 'audit_logs'), {
            workerId: id,
            changedBy: profile.uid,
            changedByName: profile.displayName,
            changeType: key === 'status' ? 'status' : 'personal',
            fieldName: fieldKey,
            oldValue: String(worker[fieldKey] || ''),
            newValue: String(value || ''),
            timestamp: new Date().toISOString()
          }));

          // Add to esp_history if espExpiry changed
          if (fieldKey === 'espExpiry') {
            logPromises.push(addDoc(collection(db, 'esp_history'), {
              workerId: id,
              workerName: worker.fullName,
              expiryDate: value,
              updatedBy: profile.uid,
              updatedByName: profile.displayName,
              createdAt: new Date().toISOString()
            }));
          }
        }
      });

      const placementChanged = ['clientId', 'currentClientJoinDate', 'currentClientTerminationDate'].some(key => key in updates);
      if (placementChanged) {
        const client = clients.find(c => c.id === (updates.clientId || worker.clientId));
        logPromises.push(addDoc(collection(db, 'placement_history'), {
          workerId: id,
          workerName: worker.fullName,
          clientId: updates.clientId || worker.clientId,
          clientName: client?.name || 'No Client',
          joinDate: updates.currentClientJoinDate || worker.currentClientJoinDate || '',
          terminationDate: updates.currentClientTerminationDate || worker.currentClientTerminationDate || '',
          remark: 'Updated from profile',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));
      }

      if (Object.keys(updates).length > 0) {
        await Promise.all([
          updateDoc(doc(db, 'workers', id), {
            ...updates,
            updatedAt: new Date().toISOString()
          }),
          ...logPromises
        ]);
        toast.success('Worker updated successfully');
      } else {
        toast('No changes detected');
      }
    } catch (error) {
      console.error('Update error:', error);
      handleFirestoreError(error, OperationType.UPDATE, `workers/${id}`);
      toast.error('Failed to update worker');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateCustomValue = async (fieldId: string, value: string) => {
    if (!id || !profile) return;
    const existing = customValues.find(v => v.fieldId === fieldId);
    const field = customFields.find(f => f.id === fieldId);
    
    if (existing?.value === value) return;

    try {
      const logPromise = addDoc(collection(db, 'audit_logs'), {
        workerId: id,
        changedBy: profile.uid,
        changedByName: profile.displayName,
        changeType: 'custom_field',
        fieldName: field?.name || 'Unknown Field',
        oldValue: existing?.value || '',
        newValue: value,
        timestamp: new Date().toISOString()
      });

      if (existing) {
        await Promise.all([
          updateDoc(doc(db, 'worker_custom_values', existing.id), { value }),
          logPromise
        ]);
      } else {
        await Promise.all([
          addDoc(collection(db, 'worker_custom_values'), {
            workerId: id,
            fieldId,
            value
          }),
          logPromise
        ]);
      }
      toast.success('Saved');
    } catch (error) {
      toast.error('Failed to save');
    }
  };

  if (loading) return <div className="animate-pulse space-y-4">
    <div className="h-40 bg-slate-200 rounded-2xl" />
    <div className="h-96 bg-slate-200 rounded-2xl" />
  </div>;

  if (!worker) return null;

  const tabs = [
    { id: 'personal', name: 'Personal Info', icon: User },
    { id: 'history', name: 'History', icon: History },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header Profile Card - Simplified */}
      <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row items-center gap-8 relative">
        <button 
          onClick={() => navigate('/workers')}
          className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-full transition-colors"
          title="Close"
        >
          <X className="w-6 h-6 text-slate-400" />
        </button>
        <div className="flex-1 text-center md:text-left">
          <h1 className="text-3xl font-bold text-slate-900 mb-1">{worker.fullName}</h1>
          <p className="text-slate-500 text-sm">Worker Profile & Information Management</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleUpdateWorker}
            disabled={isSaving}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-all flex items-center disabled:opacity-50"
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex bg-white p-1 rounded-xl border border-slate-100 shadow-sm overflow-x-auto">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center px-6 py-3 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                activeTab === tab.id 
                  ? 'bg-indigo-50 text-indigo-600 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4 mr-2" />
              {tab.name}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm">
        {activeTab === 'personal' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Input label="Worker Name" value={editData.fullName || ''} onChange={(v: string) => setEditData({...editData, fullName: v})} />
              <Input label="Worker ID" value={editData.workerId || ''} onChange={(v: string) => setEditData({...editData, workerId: v})} />
              <Input 
                label="Current Client" 
                value={editData.clientId || ''} 
                type="select" 
                options={[{label: 'Select Client', value: ''}, ...clients.map(c => ({label: c.name, value: c.id}))]} 
                onChange={(v: string) => setEditData({...editData, clientId: v})} 
              />
              <Input label="Client Join Date" value={editData.currentClientJoinDate || ''} type="date" onChange={(v: string) => setEditData({...editData, currentClientJoinDate: v})} />
              <Input 
                label="Client Termination Date" 
                value={editData.currentClientTerminationDate || ''} 
                type="date" 
                showCurrentClientIfEmpty={true}
                onChange={(v: string) => setEditData({...editData, currentClientTerminationDate: v})} 
              />
              <Input label="Nationality" value={editData.nationality || ''} onChange={(v: string) => setEditData({...editData, nationality: v})} />
              <Input label="Status" value={editData.status || 'Active'} type="select" options={['Active', 'Inactive', 'Holiday']} onChange={(v: string) => setEditData({...editData, status: v as any})} />
              <Input 
                label="Acknowledgement" 
                value={editData.acknowledgement || ''} 
                type="select" 
                options={['', 'Agree', 'Request COM', 'OverStay']} 
                onChange={(v: string) => setEditData({...editData, acknowledgement: v as any})} 
              />
              <Input label="DOB" value={editData.dob || ''} type="date" onChange={(v: string) => setEditData({...editData, dob: v})} />
              <Input label="SOCSO NO" value={editData.socsoNo || ''} onChange={(v: string) => setEditData({...editData, socsoNo: v})} />
              <Input label="EPF No." value={editData.epfNo || ''} onChange={(v: string) => setEditData({...editData, epfNo: v})} />
              <Input label="Old Passport" value={editData.oldPassport || ''} onChange={(v: string) => setEditData({...editData, oldPassport: v})} />
              <Input label="New Passport" value={editData.newPassport || ''} onChange={(v: string) => setEditData({...editData, newPassport: v})} />
              <Input label="Passport Exp." value={editData.passportExpiry || ''} type="date" onChange={(v: string) => setEditData({...editData, passportExpiry: v})} />
              <Input label="Passport Validity" value={calculateValidity(editData.passportExpiry)} readOnly />
              <Input label="Permit Ex." value={editData.permitExpiry || ''} type="date" onChange={(v: string) => setEditData({...editData, permitExpiry: v})} />
              <Input label="eSP Expiry" value={editData.espExpiry || ''} type="date" onChange={(v: string) => setEditData({...editData, espExpiry: v})} />
              <Input label="Permit Year" value={editData.permitYear || ''} onChange={(v: string) => setEditData({...editData, permitYear: v})} />
              <Input label="Managed By" value={editData.managedBy || ''} onChange={(v: string) => setEditData({...editData, managedBy: v})} />
            </div>
            
            {/* Additional Details Section */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <h3 className="text-lg font-semibold text-slate-900">Additional Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Input 
                  label="Gender" 
                  value={editData.gender || 'Male'} 
                  type="select" 
                  options={['Male', 'Female']} 
                  onChange={(v: string) => setEditData({...editData, gender: v})} 
                />
                <Input label="Age" value={calculateAge(editData.dob)} readOnly />
                <Input 
                  label="Permit Holder" 
                  value={editData.permitHolder || ''} 
                  type="select" 
                  options={[{label: 'Select Holder', value: ''}, ...permitHolders.map(h => ({label: h.name, value: h.id}))]} 
                  onChange={(v: string) => setEditData({...editData, permitHolder: v})} 
                />
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-slate-100">
              <h3 className="text-lg font-semibold text-slate-900">Additional Notes</h3>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-700">Remark</label>
                <textarea 
                  value={editData.remark || ''}
                  onChange={e => setEditData({...editData, remark: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none min-h-[100px]"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-12">
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center">
                <Building2 className="w-5 h-5 mr-2 text-indigo-600" />
                Placement History
              </h3>
              <div className="relative border-l-2 border-slate-100 ml-4 space-y-8 pb-4">
                {placementHistory.length === 0 ? (
                  <div className="ml-8">
                    <EmptyState message="No placement history records yet." />
                  </div>
                ) : (
                  placementHistory.map((item) => (
                    <div key={item.id} className="relative ml-8">
                      <div className="absolute -left-[41px] top-1 w-4 h-4 rounded-full bg-white border-2 border-indigo-500 z-10" />
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-slate-900">
                            {item.clientName}
                          </span>
                          <span className="flex items-center text-xs text-slate-400 whitespace-nowrap">
                            <Clock className="w-3 h-3 mr-1" />
                            {formatDateTime(item.createdAt)}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="whitespace-nowrap">
                            <span className="text-slate-500">Join Date:</span>
                            <span className="ml-2 font-medium text-slate-700">{item.joinDate ? formatDate(item.joinDate) : '-'}</span>
                          </div>
                          <div className="whitespace-nowrap">
                            <span className="text-slate-500">Termination Date:</span>
                            <span className="ml-2 font-medium text-slate-700">{item.terminationDate ? formatDate(item.terminationDate) : 'Current Client'}</span>
                          </div>
                        </div>
                        {item.remark && (
                          <p className="mt-2 text-xs text-slate-500 italic">
                            Note: {item.remark}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center">
                <Calendar className="w-5 h-5 mr-2 text-indigo-600" />
                eSP History
              </h3>
              <div className="relative border-l-2 border-slate-100 ml-4 space-y-8 pb-4">
                {espHistory.length === 0 ? (
                  <div className="ml-8">
                    <EmptyState message="No eSP history records yet." />
                  </div>
                ) : (
                  espHistory.map((item) => (
                    <div key={item.id} className="relative ml-8">
                      <div className="absolute -left-[41px] top-1 w-4 h-4 rounded-full bg-white border-2 border-indigo-500 z-10" />
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-slate-900">
                            eSP Expiry Updated
                          </span>
                          <span className="flex items-center text-xs text-slate-400 whitespace-nowrap">
                            <Clock className="w-3 h-3 mr-1" />
                            {formatDateTime(item.createdAt)}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 gap-4 text-sm">
                          <div className="whitespace-nowrap">
                            <span className="text-slate-500">New eSP Expiry:</span>
                            <span className="ml-2 font-medium text-slate-700">{item.expiryDate ? formatDate(item.expiryDate) : '-'}</span>
                          </div>
                          <div className="flex items-center text-xs text-slate-500">
                            <User className="w-3 h-3 mr-1" />
                            Updated by: <span className="font-medium ml-1">{item.updatedByName}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-slate-900 flex items-center">
                <History className="w-5 h-5 mr-2 text-indigo-600" />
                Audit History
              </h3>
              <div className="relative border-l-2 border-slate-100 ml-4 space-y-8 pb-4">
          {auditLogs.length === 0 ? (
            <div className="ml-8">
              <EmptyState message="No history records yet." />
            </div>
          ) : (
            auditLogs.map((log) => (
            <div key={log.id} className="relative ml-8">
              <div className="absolute -left-[41px] top-1 w-4 h-4 rounded-full bg-white border-2 border-indigo-500 z-10" />
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-slate-900">
                    {log.changeType === 'custom_field' ? 'Custom Field Update' : 'Personal Info Update'}
                  </span>
                  <span className="flex items-center text-xs text-slate-400 whitespace-nowrap">
                    <Clock className="w-3 h-3 mr-1" />
                    {formatDateTime(log.timestamp)}
                  </span>
                </div>
                <p className="text-sm text-slate-600 mb-2">
                  <span className="font-medium text-slate-900">{log.fieldName}</span> changed from{' '}
                  <span className="text-slate-400 line-through">"{log.fieldName.toLowerCase().includes('expiry') || log.fieldName.toLowerCase().includes('date') || log.fieldName === 'dob' ? formatDate(log.oldValue) : (log.oldValue || 'empty')}"</span> to{' '}
                  <span className="text-indigo-600 font-medium">"{log.fieldName.toLowerCase().includes('expiry') || log.fieldName.toLowerCase().includes('date') || log.fieldName === 'dob' ? formatDate(log.newValue) : (log.newValue)}"</span>
                </p>
                <div className="flex items-center text-xs text-slate-500">
                  <User className="w-3 h-3 mr-1" />
                  Changed by: <span className="font-medium ml-1">{log.changedByName}</span>
                </div>
              </div>
            </div>
          ))
        )}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = 'text', options, readOnly, showCurrentClientIfEmpty }: any) {
  return (
    <div className="space-y-1">
      <label className="block text-[13px] font-medium text-slate-700">{label}</label>
      <div className="relative">
        {type === 'select' ? (
          <select 
            value={value}
            disabled={readOnly}
            onChange={e => onChange && onChange(e.target.value)}
            className={`w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-[13px] ${readOnly ? 'bg-slate-50 cursor-not-allowed' : ''}`}
          >
            {options.map((o: any) => {
              const optLabel = typeof o === 'string' ? o : o.label;
              const optValue = typeof o === 'string' ? o : o.value;
              return <option key={optValue} value={optValue}>{optLabel}</option>;
            })}
          </select>
        ) : (
          <>
            <input 
              type={type}
              value={value}
              readOnly={readOnly}
              onChange={e => onChange && onChange(e.target.value)}
              className={`w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-[13px] ${readOnly ? 'bg-slate-50 cursor-not-allowed' : ''}`}
            />
            {showCurrentClientIfEmpty && !value && (
              <div className="absolute inset-0 flex items-center px-4 pointer-events-none bg-white rounded-lg border border-slate-200">
                <span className="text-indigo-600 font-medium text-[13px]">Current Client</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="p-12 text-center border-2 border-dashed border-slate-100 rounded-2xl">
      <AlertCircle className="w-10 h-10 text-slate-200 mx-auto mb-3" />
      <p className="text-slate-400 text-[13px]">{message}</p>
    </div>
  );
}
