import { useState, useEffect, useMemo, FormEvent, ChangeEvent } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  deleteDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Worker, CustomField, WorkerCustomValue, UserProfile, Client, PermitHolder } from '../types';
import { 
  Plus, 
  Search, 
  Settings, 
  Upload, 
  Download, 
  MoreHorizontal, 
  Edit2, 
  Trash2,
  Filter,
  ChevronDown,
  X,
  Users,
  DownloadCloud,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDate, parseDate } from '../utils/dateUtils';

const calculateAge = (dob: string) => {
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

const calculateValidity = (expiry: string) => {
  const date = parseDate(expiry);
  if (!date) return '-';
  const today = new Date();
  const diffTime = date.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return 'Expired';
  const years = Math.floor(diffDays / 365);
  const months = Math.floor((diffDays % 365) / 30);
  return `${years}y ${months}m`;
};

const getPermitHighlight = (expiry: string) => {
  const date = parseDate(expiry);
  if (!date) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const diffTime = date.getTime() - today.getTime();
  const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  let classes = '';
  if (days < 10) {
    classes += ' animate-blink';
  }

  if (days <= 30) {
    classes += ' text-red-700 font-bold';
  } else if (days <= 60) {
    classes += ' text-red-500 font-medium';
  } else if (days <= 90) {
    classes += ' text-red-400';
  }
  
  return classes.trim();
};

const getESPHighlight = (expiry: string) => {
  const date = parseDate(expiry);
  if (!date) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const diffTime = date.getTime() - today.getTime();
  const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  let classes = '';
  // "below 25 even after expired" blinks
  if (days < 25) {
    classes += ' animate-blink';
  }

  // "25-29 full red"
  if (days >= 25 && days <= 29) {
    classes += ' text-red-700 font-bold';
  } 
  // "below 20-25 light red" (interpreted as 20 to 24)
  else if (days >= 20 && days < 25) {
    classes += ' text-red-400';
  }
  // "after expire the SP expire date will show same highlite" -> assuming more intense or same red as below 30
  // If < 20 (including expired), likely full red
  else if (days < 20) {
    classes += ' text-red-700 font-bold';
  }

  return classes.trim();
};

const getPassportHighlight = (expiry: string) => {
  const date = parseDate(expiry);
  if (!date) return '';
  const today = new Date();
  
  // Calculate difference in months
  let months = (date.getFullYear() - today.getFullYear()) * 12;
  months -= today.getMonth();
  months += date.getMonth();
  
  // Adjust for the day of the month
  if (date.getDate() < today.getDate()) {
    months--;
  }

  let classes = '';
  
  // 13-0 months: full red and blinking
  if (months <= 13) {
    classes += ' animate-blink text-red-700 font-bold';
  } 
  // 14-18 months: light red
  else if (months >= 14 && months <= 18) {
    classes += ' text-red-400';
  }

  return classes.trim();
};

export default function WorkerManagement() {
  const { profile } = useOutletContext<{ profile: UserProfile | null }>();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [permitHolders, setPermitHolders] = useState<PermitHolder[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({ key: 'fullName', direction: 'asc' });
  const navigate = useNavigate();

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const exportToExcel = () => {
    setShowExportMenu(false);
    const exportData = filteredWorkers.map(w => ({
      'Worker ID': w.workerId,
      'Full Name': w.fullName,
      'Permit Expiry': formatDate(w.permitExpiry),
      'eSP Expiry': formatDate(w.espExpiry),
      'Permit Year': w.permitYear,
      'Permit Holder': permitHolders.find(h => h.id === w.permitHolder)?.name || '-',
      'Current Client': clients.find(c => c.id === w.clientId)?.name || '-',
      'Nationality': w.nationality,
      'Status': w.status
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Add signature rows at the bottom
    XLSX.utils.sheet_add_aoa(ws, [
      [],
      ['Prepared By:', '', 'Checked By:', '', 'Verified By:', '', 'Approved By:'],
      [profile?.signature?.useSignature ? profile.signature.text : '________________', '', '________________', '', '________________', '', '________________']
    ], { origin: -1 });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Workers');
    XLSX.writeFile(wb, `Workers_Export_${formatDate(new Date()).replace(/\//g, '-')}.xlsx`);
  };

  const exportToPDF = () => {
    setShowExportMenu(false);
    const doc = new jsPDF('landscape');
    doc.text('Worker Management Report', 14, 15);

    const tableData = filteredWorkers.map(w => [
      w.workerId,
      w.fullName,
      w.permitExpiry ? formatDate(w.permitExpiry, 'dd/MMM/yy') : '-',
      w.espExpiry ? formatDate(w.espExpiry, 'dd/MMM/yy') : '-',
      w.permitYear,
      permitHolders.find(h => h.id === w.permitHolder)?.name || '-',
      clients.find(c => c.id === w.clientId)?.name || '-',
      w.nationality
    ]);

    autoTable(doc, {
      head: [['ID', 'Name', 'Permit Exp.', 'eSP Exp.', 'Year', 'Permit Holder', 'Client', 'Nationality']],
      body: tableData,
      startY: 20,
      theme: 'grid',
      styles: { fontSize: 7, cellWidth: 'wrap' },
      didDrawPage: (data) => {
        const pageSize = doc.internal.pageSize;
        const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
        
        doc.setFontSize(9);
        const y = pageHeight - 40;
        
        const cols = [
          { label: 'Prepared By:', x: 14 },
          { label: 'Checked By:', x: 80 },
          { label: 'Verified By:', x: 150 },
          { label: 'Approved By:', x: 220 }
        ];

        cols.forEach(col => {
          doc.text(col.label, col.x, y);
          doc.text('________________', col.x, y + 15);
        });

        if (profile?.signature?.useSignature) {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const signatureText = profile.signature.text || profile.displayName;
            const font = profile.signature.fontFamily;
            ctx.font = `40px "${font}"`;
            const metrics = ctx.measureText(signatureText);
            canvas.width = metrics.width + 20;
            canvas.height = 60;
            ctx.font = `40px "${font}"`;
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#111827';
            ctx.fillText(signatureText, 10, canvas.height / 2);
            const sigImg = canvas.toDataURL();
            doc.addImage(sigImg, 'PNG', 14, y + 2, 40, 10);
          }
        }
      }
    });

    doc.save(`Workers_Export_${formatDate(new Date()).replace(/\//g, '-')}.pdf`);
  };

  const uniqueMetadata = useMemo(() => {
    const keys = [
      'workerId', 'fullName', 'oldPassport', 'newPassport', 'passportExpiry', 
      'validity', 'permitExpiry', 'espExpiry', 'permitYear', 'permitHolder', 
      'managedBy', 'clientId', 'currentClientJoinDate', 'currentClientTerminationDate', 
      'dob', 'gender', 'age', 'nationality', 'socsoNo', 'epfNo', 'remark'
    ];
    
    const meta: Record<string, string[]> = {};
    keys.forEach(key => {
      const values = workers.map(w => {
        let val = '';
        if (key === 'permitHolder') val = permitHolders.find(h => h.id === w.permitHolder)?.name || '';
        else if (key === 'clientId') val = clients.find(c => c.id === w.clientId)?.name || '';
        else if (key === 'age') val = calculateAge(w.dob).toString();
        else if (key === 'validity') val = calculateValidity(w.passportExpiry);
        else if (key === 'currentClientTerminationDate' && !w.currentClientTerminationDate) val = 'current client';
        else if (key.toLowerCase().includes('expiry') || key.toLowerCase().includes('date') || key === 'dob') val = formatDate(w[key as keyof Worker] as string);
        else val = (w[key as keyof Worker] || '').toString();
        return val;
      }).filter(v => v && v !== '-');
      meta[key] = Array.from(new Set(values)).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
    });
    return meta;
  }, [workers, permitHolders, clients]);

  const downloadSampleFile = () => {
    const sampleData = [
      {
        'Worker ID': 'W-1001',
        'Full Name': 'John Doe',
        'Old Passport': 'A1234567',
        'New Passport': 'B7654321',
        'Passport Expiry': '2028-12-31',
        'Permit Expiry': '2025-06-30',
        'eSP Expiry': '2025-07-30',
        'Permit Year': '2nd Year',
        'Managed By': 'FWMS Admin',
        'DOB': '1990-01-01',
        'Gender': 'Male',
        'Nationality': 'Bangladesh',
        'SOCSO No': '1234567890',
        'EPF No': 'EPF-98765',
        'Remark': 'Good worker',
        'Join Date': '2024-01-15',
        'Work Location': 'Kuala Lumpur'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sample');
    XLSX.writeFile(wb, 'worker_bulk_upload_sample.xlsx');
  };

  useEffect(() => {
    if (!profile) return;

    const unsubWorkers = onSnapshot(collection(db, 'workers'), (snap) => {
      setWorkers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Worker)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'workers');
      setLoading(false);
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

    return () => {
      unsubWorkers();
      unsubClients();
      unsubHolders();
    };
  }, [profile]);

  const filteredWorkers = useMemo(() => {
    let result = workers.filter(w => {
      // Global search across all displayable fields
      const searchStr = searchTerm.toLowerCase();
      const matchesGlobal = !searchTerm || [
        w.workerId,
        w.fullName,
        w.oldPassport,
        w.newPassport,
        w.nationality,
        w.managedBy,
        w.permitYear,
        w.socsoNo,
        w.epfNo,
        w.remark,
        w.workLocation,
        clients.find(c => c.id === w.clientId)?.name || '',
        permitHolders.find(h => h.id === w.permitHolder)?.name || '',
      ].some(val => (val || '').toString().toLowerCase().includes(searchStr));

      if (!matchesGlobal) return false;

      // Column-specific filters
      return Object.entries(columnFilters).every(([key, filterValue]) => {
        if (!filterValue) return true;
        const fVal = filterValue.toLowerCase();
        
        let targetValue = '';
        if (key === 'permitHolder') {
          targetValue = permitHolders.find(h => h.id === w.permitHolder)?.name || '';
        } else if (key === 'clientId') {
          targetValue = clients.find(c => c.id === w.clientId)?.name || '';
        } else if (key === 'age') {
          targetValue = calculateAge(w.dob).toString();
        } else if (key === 'validity') {
          targetValue = calculateValidity(w.passportExpiry);
        } else if (key === 'currentClientTerminationDate' && !w.currentClientTerminationDate) {
          targetValue = 'current client';
        } else if (key.toLowerCase().includes('expiry') || key.toLowerCase().includes('date') || key === 'dob') {
          targetValue = formatDate(w[key as keyof Worker] as string);
        } else {
          targetValue = (w[key as keyof Worker] || '').toString();
        }

        return targetValue.toLowerCase().includes(fVal);
      });
    });

    if (sortConfig) {
      result.sort((a, b) => {
        let aVal: any = '';
        let bVal: any = '';

        const key = sortConfig.key;
        if (key === 'permitHolder') {
          aVal = permitHolders.find(h => h.id === a.permitHolder)?.name || '';
          bVal = permitHolders.find(h => h.id === b.permitHolder)?.name || '';
        } else if (key === 'clientId') {
          aVal = clients.find(c => c.id === a.clientId)?.name || '';
          bVal = clients.find(c => c.id === b.clientId)?.name || '';
        } else if (key === 'age') {
          aVal = calculateAge(a.dob);
          bVal = calculateAge(b.dob);
        } else if (key === 'validity') {
          // Sort by expiry date instead of the validity string
          aVal = a.passportExpiry || '';
          bVal = b.passportExpiry || '';
        } else {
          aVal = (a[key as keyof Worker] || '').toString();
          bVal = (b[key as keyof Worker] || '').toString();
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [workers, searchTerm, columnFilters, clients, permitHolders, sortConfig]);

  const handleBulkUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws);

      const processDate = (val: any) => {
        const d = parseDate(val);
        return d ? d.toISOString().split('T')[0] : '';
      };

      try {
        for (const row of data as any[]) {
          await addDoc(collection(db, 'workers'), {
            workerId: row['Worker ID'] || row.WorkerID || `W-${Math.floor(Math.random() * 10000)}`,
            fullName: row['Full Name'] || row.FullName || 'Unknown',
            oldPassport: row['Old Passport'] || row.OldPassport || '',
            newPassport: row['New Passport'] || row.NewPassport || '',
            passportExpiry: processDate(row['Passport Expiry'] || row.PassportExpiry),
            permitExpiry: processDate(row['Permit Expiry'] || row.PermitExpiry),
            espExpiry: processDate(row['eSP Expiry'] || row.eSPExpiry),
            permitYear: row['Permit Year'] || row.PermitYear || '',
            managedBy: row['Managed By'] || row.ManagedBy || '',
            dob: processDate(row['DOB'] || row.DOB),
            gender: row['Gender'] || row.Gender || '',
            nationality: row['Nationality'] || row.Nationality || '',
            socsoNo: row['SOCSO No'] || row.SOCSONo || '',
            epfNo: row['EPF No'] || row.EPFNo || '',
            remark: row['Remark'] || row.Remark || '',
            clientId: '',
            workLocation: row['Work Location'] || row.Location || '',
            joinDate: processDate(row['Join Date'] || row.JoinDate) || new Date().toISOString().split('T')[0],
            status: 'Active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
        toast.success(`Successfully imported ${data.length} workers`);
      } catch (error) {
        toast.error('Failed to import workers');
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDeleteWorker = async () => {
    if (!deleteId) return;
    try {
      await deleteDoc(doc(db, 'workers', deleteId));
      toast.success('Worker deleted');
      setDeleteId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `workers/${deleteId}`);
      toast.error('Failed to delete worker');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Worker Management</h1>
          <p className="text-slate-500 text-sm">Manage worker records and custom data</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-all flex items-center">
            <Upload className="w-4 h-4 mr-2" />
            Bulk Upload
            <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={handleBulkUpload} />
          </label>
          <button 
            onClick={downloadSampleFile}
            className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-all flex items-center"
          >
            <Download className="w-4 h-4 mr-2" />
            Sample File
          </button>
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-sm transition-all flex items-center"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Worker
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search by name, ID, or passport..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
          />
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center px-4 py-2 text-sm font-medium rounded-lg border transition-all ${
              showFilters 
                ? 'bg-indigo-50 border-indigo-200 text-indigo-600' 
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Filter className="w-4 h-4 mr-2" />
            {showFilters ? 'Hide Filters' : 'Filters'}
          </button>
          <div className="relative">
            <button 
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center px-4 py-2 text-sm font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-all"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </button>
            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-20">
                  <button 
                    onClick={exportToExcel}
                    className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                  >
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    Excel Report
                  </button>
                  <button 
                    onClick={exportToPDF}
                    className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors"
                  >
                    <div className="w-2 h-2 rounded-full bg-rose-500" />
                    PDF Report
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Worker Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-indigo-600 border-b border-indigo-700">
                {[
                  { label: 'Worker ID', key: 'workerId' },
                  { label: 'Worker Name', key: 'fullName' },
                  { label: 'Old Passport', key: 'oldPassport' },
                  { label: 'New Passport', key: 'newPassport' },
                  { label: 'Passport Exp.', key: 'passportExpiry' },
                  { label: 'Validity Remaining', key: 'validity' },
                  { label: 'Permit Ex.', key: 'permitExpiry' },
                  { label: 'eSP Expiry', key: 'espExpiry' },
                  { label: 'Permit Year', key: 'permitYear' },
                  { label: 'Permit Holder', key: 'permitHolder' },
                  { label: 'Managed By', key: 'managedBy' },
                  { label: 'Current Client', key: 'clientId' },
                  { label: 'Join Date', key: 'currentClientJoinDate' },
                  { label: 'Termination Date', key: 'currentClientTerminationDate' },
                  { label: 'DOB', key: 'dob' },
                  { label: 'Gender', key: 'gender' },
                  { label: 'Age', key: 'age' },
                  { label: 'Nationality', key: 'nationality' },
                  { label: 'SOCSO NO', key: 'socsoNo' },
                  { label: 'EPF No.', key: 'epfNo' },
                  { label: 'Remark', key: 'remark' }
                ].map((col) => (
                  <th 
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 cursor-pointer hover:bg-indigo-700 transition-colors ${col.key === 'fullName' ? 'text-left' : 'text-center'}`}
                  >
                    <div className={`flex items-center gap-1 ${col.key === 'fullName' ? 'justify-start' : 'justify-center'}`}>
                      {col.label}
                      {sortConfig?.key === col.key ? (
                        sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-indigo-300" />
                      )}
                    </div>
                  </th>
                ))}
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center">Actions</th>
              </tr>
              {showFilters && (
                <tr className="bg-slate-50 border-b border-slate-200">
                  <td className="p-2 border border-slate-200">
                    <select 
                      className="w-full px-2 py-1 text-[10px] border rounded outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                      value={columnFilters.workerId || ''}
                      onChange={(e) => setColumnFilters(prev => ({ ...prev, workerId: e.target.value }))}
                    >
                      <option value="">All</option>
                      {uniqueMetadata.workerId?.map(val => <option key={val} value={val}>{val}</option>)}
                    </select>
                  </td>
                  <td className="p-2 border border-slate-200">
                    <select 
                      className="w-full px-2 py-1 text-[10px] border rounded outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                      value={columnFilters.fullName || ''}
                      onChange={(e) => setColumnFilters(prev => ({ ...prev, fullName: e.target.value }))}
                    >
                      <option value="">All</option>
                      {uniqueMetadata.fullName?.map(val => <option key={val} value={val}>{val}</option>)}
                    </select>
                  </td>
                  <td className="p-2 border border-slate-200">
                    <select 
                      className="w-full px-2 py-1 text-[10px] border rounded outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                      value={columnFilters.oldPassport || ''}
                      onChange={(e) => setColumnFilters(prev => ({ ...prev, oldPassport: e.target.value }))}
                    >
                      <option value="">All</option>
                      {uniqueMetadata.oldPassport?.map(val => <option key={val} value={val}>{val}</option>)}
                    </select>
                  </td>
                  <td className="p-2 border border-slate-200">
                    <select 
                      className="w-full px-2 py-1 text-[10px] border rounded outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                      value={columnFilters.newPassport || ''}
                      onChange={(e) => setColumnFilters(prev => ({ ...prev, newPassport: e.target.value }))}
                    >
                      <option value="">All</option>
                      {uniqueMetadata.newPassport?.map(val => <option key={val} value={val}>{val}</option>)}
                    </select>
                  </td>
                  <td className="p-2 border border-slate-200">
                    <select 
                      className="w-full px-2 py-1 text-[10px] border rounded outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                      value={columnFilters.passportExpiry || ''}
                      onChange={(e) => setColumnFilters(prev => ({ ...prev, passportExpiry: e.target.value }))}
                    >
                      <option value="">All</option>
                      {uniqueMetadata.passportExpiry?.map(val => <option key={val} value={val}>{val}</option>)}
                    </select>
                  </td>
                  <td className="p-2 border border-slate-200">
                    <select 
                      className="w-full px-2 py-1 text-[10px] border rounded outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                      value={columnFilters.validity || ''}
                      onChange={(e) => setColumnFilters(prev => ({ ...prev, validity: e.target.value }))}
                    >
                      <option value="">All</option>
                      {uniqueMetadata.validity?.map(val => <option key={val} value={val}>{val}</option>)}
                    </select>
                  </td>
                  <td className="p-2 border border-slate-200">
                    <select 
                      className="w-full px-2 py-1 text-[10px] border rounded outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                      value={columnFilters.permitExpiry || ''}
                      onChange={(e) => setColumnFilters(prev => ({ ...prev, permitExpiry: e.target.value }))}
                    >
                      <option value="">All</option>
                      {uniqueMetadata.permitExpiry?.map(val => <option key={val} value={val}>{val}</option>)}
                    </select>
                  </td>
                  <td className="p-2 border border-slate-200">
                    <select 
                      className="w-full px-2 py-1 text-[10px] border rounded outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                      value={columnFilters.espExpiry || ''}
                      onChange={(e) => setColumnFilters(prev => ({ ...prev, espExpiry: e.target.value }))}
                    >
                      <option value="">All</option>
                      {uniqueMetadata.espExpiry?.map(val => <option key={val} value={val}>{val}</option>)}
                    </select>
                  </td>
                  <td className="p-2 border border-slate-200">
                    <select 
                      className="w-full px-2 py-1 text-[10px] border rounded outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                      value={columnFilters.permitYear || ''}
                      onChange={(e) => setColumnFilters(prev => ({ ...prev, permitYear: e.target.value }))}
                    >
                      <option value="">All</option>
                      {uniqueMetadata.permitYear?.map(val => <option key={val} value={val}>{val}</option>)}
                    </select>
                  </td>
                  <td className="p-2 border border-slate-200">
                    <select 
                      className="w-full px-2 py-1 text-[10px] border rounded outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                      value={columnFilters.permitHolder || ''}
                      onChange={(e) => setColumnFilters(prev => ({ ...prev, permitHolder: e.target.value }))}
                    >
                      <option value="">All</option>
                      {uniqueMetadata.permitHolder?.map(val => <option key={val} value={val}>{val}</option>)}
                    </select>
                  </td>
                  <td className="p-2 border border-slate-200">
                    <select 
                      className="w-full px-2 py-1 text-[10px] border rounded outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                      value={columnFilters.managedBy || ''}
                      onChange={(e) => setColumnFilters(prev => ({ ...prev, managedBy: e.target.value }))}
                    >
                      <option value="">All</option>
                      {uniqueMetadata.managedBy?.map(val => <option key={val} value={val}>{val}</option>)}
                    </select>
                  </td>
                  <td className="p-2 border border-slate-200">
                    <select 
                      className="w-full px-2 py-1 text-[10px] border rounded outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                      value={columnFilters.clientId || ''}
                      onChange={(e) => setColumnFilters(prev => ({ ...prev, clientId: e.target.value }))}
                    >
                      <option value="">All</option>
                      {uniqueMetadata.clientId?.map(val => <option key={val} value={val}>{val}</option>)}
                    </select>
                  </td>
                  <td className="p-2 border border-slate-200">
                    <select 
                      className="w-full px-2 py-1 text-[10px] border rounded outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                      value={columnFilters.currentClientJoinDate || ''}
                      onChange={(e) => setColumnFilters(prev => ({ ...prev, currentClientJoinDate: e.target.value }))}
                    >
                      <option value="">All</option>
                      {uniqueMetadata.currentClientJoinDate?.map(val => <option key={val} value={val}>{val}</option>)}
                    </select>
                  </td>
                  <td className="p-2 border border-slate-200">
                    <select 
                      className="w-full px-2 py-1 text-[10px] border rounded outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                      value={columnFilters.currentClientTerminationDate || ''}
                      onChange={(e) => setColumnFilters(prev => ({ ...prev, currentClientTerminationDate: e.target.value }))}
                    >
                      <option value="">All</option>
                      {uniqueMetadata.currentClientTerminationDate?.map(val => <option key={val} value={val}>{val}</option>)}
                    </select>
                  </td>
                  <td className="p-2 border border-slate-200">
                    <select 
                      className="w-full px-2 py-1 text-[10px] border rounded outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                      value={columnFilters.dob || ''}
                      onChange={(e) => setColumnFilters(prev => ({ ...prev, dob: e.target.value }))}
                    >
                      <option value="">All</option>
                      {uniqueMetadata.dob?.map(val => <option key={val} value={val}>{val}</option>)}
                    </select>
                  </td>
                  <td className="p-2 border border-slate-200">
                    <select 
                      className="w-full px-2 py-1 text-[10px] border rounded outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                      value={columnFilters.gender || ''}
                      onChange={(e) => setColumnFilters(prev => ({ ...prev, gender: e.target.value }))}
                    >
                      <option value="">All</option>
                      {uniqueMetadata.gender?.map(val => <option key={val} value={val}>{val}</option>)}
                    </select>
                  </td>
                  <td className="p-2 border border-slate-200">
                    <select 
                      className="w-full px-2 py-1 text-[10px] border rounded outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                      value={columnFilters.age || ''}
                      onChange={(e) => setColumnFilters(prev => ({ ...prev, age: e.target.value }))}
                    >
                      <option value="">All</option>
                      {uniqueMetadata.age?.map(val => <option key={val} value={val}>{val}</option>)}
                    </select>
                  </td>
                  <td className="p-2 border border-slate-200">
                    <select 
                      className="w-full px-2 py-1 text-[10px] border rounded outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                      value={columnFilters.nationality || ''}
                      onChange={(e) => setColumnFilters(prev => ({ ...prev, nationality: e.target.value }))}
                    >
                      <option value="">All</option>
                      {uniqueMetadata.nationality?.map(val => <option key={val} value={val}>{val}</option>)}
                    </select>
                  </td>
                  <td className="p-2 border border-slate-200">
                    <select 
                      className="w-full px-2 py-1 text-[10px] border rounded outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                      value={columnFilters.socsoNo || ''}
                      onChange={(e) => setColumnFilters(prev => ({ ...prev, socsoNo: e.target.value }))}
                    >
                      <option value="">All</option>
                      {uniqueMetadata.socsoNo?.map(val => <option key={val} value={val}>{val}</option>)}
                    </select>
                  </td>
                  <td className="p-2 border border-slate-200">
                    <select 
                      className="w-full px-2 py-1 text-[10px] border rounded outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                      value={columnFilters.epfNo || ''}
                      onChange={(e) => setColumnFilters(prev => ({ ...prev, epfNo: e.target.value }))}
                    >
                      <option value="">All</option>
                      {uniqueMetadata.epfNo?.map(val => <option key={val} value={val}>{val}</option>)}
                    </select>
                  </td>
                  <td className="p-2 border border-slate-200">
                    <select 
                      className="w-full px-2 py-1 text-[10px] border rounded outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                      value={columnFilters.remark || ''}
                      onChange={(e) => setColumnFilters(prev => ({ ...prev, remark: e.target.value }))}
                    >
                      <option value="">All</option>
                      {uniqueMetadata.remark?.map(val => <option key={val} value={val}>{val}</option>)}
                    </select>
                  </td>
                  <td className="p-2 border border-slate-200 bg-slate-100 flex items-center justify-center">
                    <button 
                      onClick={() => setColumnFilters({})}
                      className="text-[10px] font-bold text-rose-600 hover:text-rose-700"
                    >
                      CLEAR
                    </button>
                  </td>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredWorkers.map((worker) => (
                <tr 
                  key={worker.id} 
                  className="hover:bg-slate-50 transition-colors group"
                >
                  <td className="px-4 py-3 text-[13px] font-medium text-slate-900 whitespace-nowrap border border-slate-200 text-center">{worker.workerId}</td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-left">{worker.fullName}</td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">{worker.oldPassport || '-'}</td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">{worker.newPassport || '-'}</td>
                  <td className={`px-4 py-3 text-[13px] whitespace-nowrap border border-slate-200 text-center ${getPassportHighlight(worker.passportExpiry) || 'text-slate-600'}`}>{formatDate(worker.passportExpiry)}</td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">{calculateValidity(worker.passportExpiry)}</td>
                  <td className={`px-4 py-3 text-[13px] whitespace-nowrap border border-slate-200 text-center ${getPermitHighlight(worker.permitExpiry) || 'text-slate-600'}`}>{formatDate(worker.permitExpiry)}</td>
                  <td className={`px-4 py-3 text-[13px] whitespace-nowrap border border-slate-200 text-center ${getESPHighlight(worker.espExpiry) || 'text-slate-600'}`}>{formatDate(worker.espExpiry)}</td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">{worker.permitYear || '-'}</td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">
                    {permitHolders.find(h => h.id === worker.permitHolder)?.name || '-'}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">{worker.managedBy || '-'}</td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">
                    {clients.find(c => c.id === worker.clientId)?.name || '-'}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">
                    {formatDate(worker.currentClientJoinDate)}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">
                    {worker.currentClientTerminationDate ? formatDate(worker.currentClientTerminationDate) : (
                      <span className="text-indigo-600 font-medium text-[13px] whitespace-nowrap">Current Client</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">{formatDate(worker.dob)}</td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">{worker.gender || '-'}</td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">{calculateAge(worker.dob)}</td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">{worker.nationality}</td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">{worker.socsoNo || '-'}</td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">{worker.epfNo || '-'}</td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">{worker.remark || '-'}</td>
                  <td className="px-4 py-3 text-right border border-slate-200 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => navigate(`/workers/${worker.id}`)}
                        className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setDeleteId(worker.id)}
                        className="p-1 text-slate-400 hover:text-red-600 transition-colors"
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
        {filteredWorkers.length === 0 && !loading && (
          <div className="p-12 text-center">
            <Users className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500">No workers found matching your search.</p>
          </div>
        )}
      </div>

      {/* Modals (Simplified for brevity, would be full components) */}
      {isAddModalOpen && <AddWorkerModal clients={clients} permitHolders={permitHolders} onClose={() => setIsAddModalOpen(false)} />}
      
      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[70] p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center gap-4 mb-6 text-red-600">
              <div className="p-3 bg-red-50 rounded-full">
                <Trash2 className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold">Confirm Deletion</h2>
            </div>
            <p className="text-slate-600 mb-8">
              Are you sure you want to delete this worker? This action cannot be undone and all associated records will be removed.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setDeleteId(null)}
                className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl font-medium text-slate-600 hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleDeleteWorker}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-all"
              >
                Delete Worker
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AddWorkerModal({ clients, permitHolders, onClose }: { clients: Client[], permitHolders: PermitHolder[], onClose: () => void }) {
  const [formData, setFormData] = useState({
    fullName: '',
    oldPassport: '',
    newPassport: '',
    passportExpiry: '',
    permitExpiry: '',
    espExpiry: '',
    permitYear: '1',
    permitHolder: '',
    managedBy: '',
    dob: '',
    gender: 'Male',
    nationality: '',
    socsoNo: '',
    epfNo: '',
    remark: '',
    workerId: `W-${Date.now().toString().slice(-6)}`,
    status: 'Active' as const,
    clientId: '',
    currentClientJoinDate: '',
    currentClientTerminationDate: '',
    acknowledgement: '' as const,
    fomemaStatus: '' as const,
    insurancePurchase: '' as const,
    plksStatus: '' as const,
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    console.log('Submitting worker form...', formData);
    try {
      const docRef = await addDoc(collection(db, 'workers'), {
        ...formData,
        fullName: formData.fullName.toUpperCase(),
        permitYear: formData.permitYear, // It's already a string in types.ts
        workLocation: '',
        joinDate: new Date().toISOString().split('T')[0],
        currentClientJoinDate: formData.currentClientJoinDate,
        currentClientTerminationDate: formData.currentClientTerminationDate,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      console.log('Worker added with ID:', docRef.id);

          // Record initial placement history if client is selected
          if (formData.clientId) {
            const client = clients.find(c => c.id === formData.clientId);
            await addDoc(collection(db, 'placement_history'), {
              workerId: docRef.id,
              workerName: formData.fullName.toUpperCase(),
              clientId: formData.clientId,
              clientName: client?.name || 'No Client',
              joinDate: formData.currentClientJoinDate || '',
              terminationDate: formData.currentClientTerminationDate || '',
              remark: 'Initial placement',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }

      toast.success('Worker added successfully');
      onClose();
    } catch (error) {
      console.error('Error adding worker:', error);
      handleFirestoreError(error, OperationType.CREATE, 'workers');
      toast.error('Failed to add worker. Check console for details.');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-slate-900">Add New Worker</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-6 h-6 text-slate-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Worker Name</label>
              <input 
                type="text" required
                value={formData.fullName}
                onChange={e => setFormData({...formData, fullName: e.target.value})}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                placeholder="Enter full name"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Current Client</label>
              <select 
                value={formData.clientId}
                onChange={e => setFormData({...formData, clientId: e.target.value})}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
              >
                <option value="">Select Client</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Client Join Date</label>
              <input 
                type="date"
                value={formData.currentClientJoinDate}
                onChange={e => setFormData({...formData, currentClientJoinDate: e.target.value})}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Client Termination Date</label>
              <input 
                type="date"
                value={formData.currentClientTerminationDate}
                onChange={e => setFormData({...formData, currentClientTerminationDate: e.target.value})}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Worker ID (Auto)</label>
              <input 
                type="text" readOnly
                value={formData.workerId}
                className="w-full px-4 py-2.5 border border-slate-100 bg-slate-50 rounded-xl text-slate-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Old Passport</label>
              <input 
                type="text"
                value={formData.oldPassport}
                onChange={e => setFormData({...formData, oldPassport: e.target.value})}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">New Passport</label>
              <input 
                type="text" required
                value={formData.newPassport}
                onChange={e => setFormData({...formData, newPassport: e.target.value})}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Passport Exp.</label>
              <input 
                type="date" required
                value={formData.passportExpiry}
                onChange={e => setFormData({...formData, passportExpiry: e.target.value})}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Permit Ex.</label>
              <input 
                type="date" required
                value={formData.permitExpiry}
                onChange={e => setFormData({...formData, permitExpiry: e.target.value})}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">eSP Expiry</label>
              <input 
                type="date"
                value={formData.espExpiry}
                onChange={e => setFormData({...formData, espExpiry: e.target.value})}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Permit Year</label>
              <input 
                type="text"
                value={formData.permitYear}
                onChange={e => setFormData({...formData, permitYear: e.target.value})}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Permit Holder</label>
              <select 
                value={formData.permitHolder}
                onChange={e => setFormData({...formData, permitHolder: e.target.value})}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
              >
                <option value="">Select Holder</option>
                {permitHolders.map(h => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Managed By</label>
              <input 
                type="text"
                value={formData.managedBy}
                onChange={e => setFormData({...formData, managedBy: e.target.value})}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">DOB</label>
              <input 
                type="date" required
                value={formData.dob}
                onChange={e => setFormData({...formData, dob: e.target.value})}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Gender</label>
              <select 
                value={formData.gender}
                onChange={e => setFormData({...formData, gender: e.target.value})}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Status</label>
              <select 
                value={formData.status}
                onChange={e => setFormData({...formData, status: e.target.value as any})}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Holiday">Holiday</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Nationality</label>
              <input 
                type="text" required
                value={formData.nationality}
                onChange={e => setFormData({...formData, nationality: e.target.value})}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">SOCSO NO</label>
              <input 
                type="text"
                value={formData.socsoNo}
                onChange={e => setFormData({...formData, socsoNo: e.target.value})}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">EPF No.</label>
              <input 
                type="text"
                value={formData.epfNo}
                onChange={e => setFormData({...formData, epfNo: e.target.value})}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Remark</label>
              <textarea 
                value={formData.remark}
                onChange={e => setFormData({...formData, remark: e.target.value})}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none min-h-[100px]"
                placeholder="Add any additional notes..."
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button 
              type="button" 
              onClick={onClose}
              className="px-6 py-2.5 border border-slate-200 rounded-xl font-medium text-slate-600 hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="px-8 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all"
            >
              Create Worker
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
