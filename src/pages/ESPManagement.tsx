import { useState, useEffect, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { 
  collection, 
  onSnapshot, 
  updateDoc, 
  doc, 
  addDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Worker, UserProfile, Client, PermitHolder } from '../types';
import { 
  Search, 
  History,
  Calendar,
  Download,
  Filter,
  X
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { differenceInDays, getYear, getMonth, format } from 'date-fns';
import { formatDate, parseDate } from '../utils/dateUtils';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function ESPManagement() {
  const { profile } = useOutletContext<{ profile: UserProfile | null }>();
  const navigate = useNavigate();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [permitHolders, setPermitHolders] = useState<PermitHolder[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    clientId: '',
    year: '',
    month: ''
  });

  useEffect(() => {
    if (!profile) return;

    const unsubWorkers = onSnapshot(collection(db, 'workers'), (snap) => {
      const allWorkers = snap.docs.map(d => ({ id: d.id, ...d.data() } as Worker));
      
      const expiringWorkers = allWorkers.filter(w => {
        if (!w.permitExpiry || w.plksStatus === 'Collected') return false;
        try {
          const expiryDate = parseDate(w.permitExpiry);
          if (!expiryDate) return false;
          const daysLeft = differenceInDays(expiryDate, new Date());
          return daysLeft <= 90;
        } catch (e) {
          return false;
        }
      });

      setWorkers(expiringWorkers);
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
    return workers.filter(w => {
      const matchesSearch = w.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          w.workerId.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesClient = !filters.clientId || w.clientId === filters.clientId;
      
      let matchesDate = true;
      if (w.permitExpiry) {
        try {
          const date = parseDate(w.permitExpiry);
          if (date) {
            if (filters.year && getYear(date).toString() !== filters.year) matchesDate = false;
            if (filters.month && (getMonth(date) + 1).toString() !== filters.month) matchesDate = false;
          } else {
            matchesDate = !filters.year && !filters.month;
          }
        } catch (e) {
          matchesDate = !filters.year && !filters.month;
        }
      } else {
        matchesDate = !filters.year && !filters.month;
      }

      return matchesSearch && matchesClient && matchesDate;
    });
  }, [workers, searchTerm, filters]);

  const [showExportMenu, setShowExportMenu] = useState(false);

  const exportToExcel = () => {
    setShowExportMenu(false);
    const exportData = filteredWorkers.map(w => ({
      'Worker ID': w.workerId,
      'Worker Name': w.fullName,
      'Permit Holder': permitHolders.find(h => h.id === w.permitHolder)?.name || '-',
      'Company': clients.find(c => c.id === w.clientId)?.name || '-',
      'Permit Expiry': formatDate(w.permitExpiry),
      'eSP Expiry': formatDate(w.espExpiry) || '-'
    }));

    // Add signature rows
    const ws = XLSX.utils.json_to_sheet(exportData);
    const rowCount = exportData.length;
    
    XLSX.utils.sheet_add_aoa(ws, [
      [],
      ['Prepared By:', '', 'Checked By:', '', 'Verified By:', '', 'Approved By:'],
      ['________________', '', '________________', '', '________________', '', '________________']
    ], { origin: -1 });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'eSP Management');
    XLSX.writeFile(wb, `eSP_Management_${formatDate(new Date()).replace(/\//g, '-')}.xlsx`);
  };

  const exportToPDF = () => {
    setShowExportMenu(false);
    const doc = new jsPDF('landscape');
    
    doc.text('eSP Management Report', 14, 15);
    
    const tableData = filteredWorkers.map((w, index) => [
      w.workerId,
      w.fullName,
      permitHolders.find(h => h.id === w.permitHolder)?.name || '-',
      clients.find(c => c.id === w.clientId)?.name || '-',
      w.permitExpiry ? formatDate(w.permitExpiry, 'dd/MMM/yy') : '-',
      w.espExpiry ? formatDate(w.espExpiry, 'dd/MMM/yy') : '-'
    ]);

    autoTable(doc, {
      head: [['Worker ID', 'Name', 'Permit Holder', 'Company', 'Permit Expiry', 'eSP Expiry']],
      body: tableData,
      startY: 20,
      theme: 'grid',
      styles: { fontSize: 8, cellWidth: 'wrap' },
      didDrawPage: (data) => {
        const pageSize = doc.internal.pageSize;
        const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
        const pageWidth = pageSize.width ? pageSize.width : pageSize.getWidth();
        
        doc.setFontSize(10);
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

        // Add digital signature if enabled
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
            ctx.fillStyle = '#1e293b';
            ctx.fillText(signatureText, 10, canvas.height / 2);
            
            const sigImg = canvas.toDataURL();
            // Place signature above "Prepared By" line (first col)
            doc.addImage(sigImg, 'PNG', 14, y + 2, 40, 10);
          }
        }
      }
    });

    doc.save(`eSP_Management_${formatDate(new Date()).replace(/\//g, '-')}.pdf`);
  };

  const handleUpdateESP = async (worker: Worker, newExpiry: string) => {
    if (!newExpiry) return;

    // Determine reference date for validation
    let referenceDateStr = worker.permitExpiry || '';
    let referenceLabel = 'Permit Expiry';

    if (worker.plksStatus === 'Collected') {
      referenceDateStr = worker.permitExpiry || '';
      referenceLabel = 'Latest Permit Expiry';
    } else if (worker.espExpiry) {
      referenceDateStr = worker.espExpiry;
      referenceLabel = 'Previous eSP Expiry';
    }

    if (referenceDateStr) {
      try {
        const refDate = parseDate(referenceDateStr);
        const newDate = parseDate(newExpiry);
        
        if (refDate && newDate && newDate <= refDate) {
          toast.error(`eSP Expiry must be after ${referenceLabel} (${formatDate(referenceDateStr)})`);
          return;
        }
      } catch (e) {
        console.error('Date parsing error:', e);
      }
    }

    try {
      await updateDoc(doc(db, 'workers', worker.id), {
        espExpiry: newExpiry,
        updatedAt: new Date().toISOString()
      });

      await addDoc(collection(db, 'esp_history'), {
        workerId: worker.id,
        workerName: worker.fullName,
        expiryDate: newExpiry,
        updatedBy: profile?.uid || '',
        updatedByName: profile?.displayName || 'System',
        createdAt: new Date().toISOString()
      });

      toast.success('eSP Expiry updated successfully');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'workers');
      toast.error('Failed to update eSP Expiry');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 whitespace-nowrap">eSP Management</h1>
          <p className="text-slate-500 text-sm whitespace-nowrap">Monitor and update eSP expiry for workers with expiring permits</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-lg border transition-colors flex items-center gap-2 text-sm font-medium ${showFilters ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>
          <div className="flex items-center gap-2 border-l border-slate-200 pl-2 relative">
            <button 
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            
            {showExportMenu && (
              <>
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setShowExportMenu(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-40 bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-20">
                  <button 
                    onClick={exportToExcel}
                    className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    Excel Format
                  </button>
                  <button 
                    onClick={exportToPDF}
                    className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <div className="w-2 h-2 rounded-full bg-rose-500" />
                    PDF Format
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Company</label>
            <select 
              value={filters.clientId}
              onChange={(e) => setFilters(prev => ({ ...prev, clientId: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            >
              <option value="">All Companies</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Year</label>
            <select 
              value={filters.year}
              onChange={(e) => setFilters(prev => ({ ...prev, year: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            >
              <option value="">All Years</option>
              {Array.from(new Set(workers.map(w => w.permitExpiry ? getYear(parseDate(w.permitExpiry) || new Date()) : null))).filter(Boolean).sort().map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Month</label>
            <select 
              value={filters.month}
              onChange={(e) => setFilters(prev => ({ ...prev, month: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
            >
              <option value="">All Months</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                <option key={month} value={month}>{format(new Date(2000, month - 1), 'MMMM')}</option>
              ))}
            </select>
          </div>
          {(filters.clientId || filters.year || filters.month) && (
            <div className="md:col-span-3 flex justify-end">
              <button 
                onClick={() => setFilters({ clientId: '', year: '', month: '' })}
                className="text-xs text-rose-600 font-medium hover:underline flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                Clear Filters
              </button>
            </div>
          )}
        </div>
      )}

      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search by name or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Worker ID</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Worker Name</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Permit Holder</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">Permit Expiry</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">eSP Expiry</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500 whitespace-nowrap">Loading...</td>
                </tr>
              ) : filteredWorkers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500 whitespace-nowrap">No workers found with expiring permits</td>
                </tr>
              ) : (
                filteredWorkers.map((worker) => (
                  <tr key={worker.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900 whitespace-nowrap">{worker.workerId}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">
                      <div>
                        {worker.fullName}
                        <div className="text-[10px] text-slate-400">{clients.find(c => c.id === worker.clientId)?.name}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">
                      {permitHolders.find(h => h.id === worker.permitHolder)?.name || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        {formatDate(worker.permitExpiry)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">
                      <input 
                        type="date"
                        value={worker.espExpiry || ''}
                        onChange={(e) => handleUpdateESP(worker, e.target.value)}
                        className="px-3 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      />
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <button 
                        onClick={() => navigate(`/esp/history/${worker.id}`)}
                        className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="View History"
                      >
                        <History className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
