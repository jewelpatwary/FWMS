import { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { 
  collection, 
  onSnapshot, 
  query,
  where,
  updateDoc,
  doc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Worker, UserProfile, Client } from '../types';
import { 
  Search, 
  Calendar,
  Users,
  Building2,
  Download,
  FileText,
  ClipboardList
} from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'react-hot-toast';
import { formatDate } from '../utils/dateUtils';

export default function COMManagement() {
  const { profile } = useOutletContext<{ profile: UserProfile | null }>();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;

    // Only fetch workers where acknowledgement is 'Request COM'
    const q = query(collection(db, 'workers'), where('acknowledgement', '==', 'Request COM'));
    const unsubWorkers = onSnapshot(q, (snap) => {
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

    return () => {
      unsubWorkers();
      unsubClients();
    };
  }, [profile]);

  const updateWorkerField = async (workerId: string, field: string, value: string) => {
    try {
      await updateDoc(doc(db, 'workers', workerId), {
        [field]: value,
        updatedAt: new Date().toISOString()
      });
      toast.success('Updated successfully');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'workers');
      toast.error('Failed to update');
    }
  };

  const filteredWorkers = useMemo(() => {
    return workers.filter(w => {
      const matchesSearch = w.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          w.workerId.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesClient = !selectedClient || w.clientId === selectedClient;
      
      const matchesDateRange = (!startDate || (w.comRequestDate && w.comRequestDate >= startDate)) &&
                               (!endDate || (w.comRequestDate && w.comRequestDate <= endDate));

      return matchesSearch && matchesClient && matchesDateRange;
    });
  }, [workers, searchTerm, selectedClient, startDate, endDate]);

  const handleExportExcel = () => {
    try {
      const exportData = filteredWorkers.map((w, index) => ({
        'SL No.': index + 1,
        'Worker Name': w.fullName,
        'Passport Number': w.newPassport || w.oldPassport || '-',
        'Client': clients.find(c => c.id === w.clientId)?.name || '-',
        'Request Date for COM': w.comRequestDate || '-',
        'COM Apply': w.comApply || '-',
        'COM Status': w.comStatus || '-'
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'COM List');
      XLSX.writeFile(wb, `COM_List_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      toast.success('Exported to Excel successfully');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export to Excel');
    }
  };

  const handleExportPDF = () => {
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      doc.setFontSize(18);
      doc.text('COM Management List', 14, 15);
      doc.setFontSize(10);
      doc.text(`Generated on: ${format(new Date(), 'dd MMM yyyy HH:mm')}`, 14, 22);

      const tableData = filteredWorkers.map((w, index) => [
        index + 1,
        w.fullName,
        w.newPassport || w.oldPassport || '-',
        clients.find(c => c.id === w.clientId)?.name || '-',
        w.comRequestDate ? formatDate(w.comRequestDate, 'dd/MMM/yy') : '-',
        w.comApply || '-',
        w.comStatus || '-'
      ]);

      autoTable(doc, {
        startY: 30,
        head: [['SL', 'Name', 'Passport', 'Client', 'Req. Date', 'COM Apply', 'Status']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229], textColor: 255 },
        styles: { fontSize: 8, cellWidth: 'wrap' }
      });

      doc.save(`COM_List_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast.success('Exported to PDF successfully');
    } catch (error) {
      console.error('PDF Export error:', error);
      toast.error('Failed to export to PDF');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">COM Management</h1>
          <p className="text-slate-500 text-xs">Manage workers requesting COM</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col lg:flex-row gap-4 items-center">
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
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="pl-8 pr-2 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-[11px]"
                placeholder="Start Date"
              />
            </div>
            <span className="text-slate-400 text-xs">to</span>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="pl-8 pr-2 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-[11px]"
                placeholder="End Date"
              />
            </div>
          </div>
          <div className="relative flex-1 min-w-[150px]">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-xs appearance-none"
            >
              <option value="">All Clients</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
          </div>
          <button 
            onClick={() => {
              setSearchTerm('');
              setSelectedClient('');
              setStartDate('');
              setEndDate('');
            }}
            className="px-4 py-2 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100"
          >
            Clear
          </button>
          <button 
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Excel
          </button>
          <button 
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-rose-600 rounded-lg hover:bg-rose-700 transition-colors"
          >
            <FileText className="w-4 h-4" />
            PDF
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse border border-slate-200">
            <thead>
              <tr className="bg-indigo-600 border-b border-indigo-700">
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center">SL No.</th>
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-left">Worker Name</th>
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center">Passport Number</th>
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center">Client</th>
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center">Request Date for COM</th>
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center">COM Apply</th>
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center">COM Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredWorkers.map((worker, index) => (
                <tr key={worker.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">{index + 1}</td>
                  <td className="px-4 py-3 text-[13px] font-medium text-slate-900 whitespace-nowrap border border-slate-200 text-left">{worker.fullName}</td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">{worker.newPassport || worker.oldPassport || '-'}</td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">
                    {clients.find(c => c.id === worker.clientId)?.name || '-'}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">
                    <input 
                      type="date"
                      value={worker.comRequestDate || ''}
                      onChange={(e) => updateWorkerField(worker.id, 'comRequestDate', e.target.value)}
                      className="bg-transparent border-none focus:ring-0 text-[13px] text-slate-600 cursor-pointer hover:bg-slate-50 rounded px-1 w-full text-center"
                    />
                  </td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">
                    <input 
                      type="date"
                      value={worker.comApply || ''}
                      onChange={(e) => updateWorkerField(worker.id, 'comApply', e.target.value)}
                      className="bg-transparent border-none focus:ring-0 text-[13px] text-slate-600 cursor-pointer hover:bg-slate-50 rounded px-1 w-full text-center"
                    />
                  </td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">
                    <select
                      value={worker.comStatus || ''}
                      onChange={(e) => updateWorkerField(worker.id, 'comStatus', e.target.value)}
                      className="bg-transparent border-none focus:ring-0 text-[13px] text-slate-600 cursor-pointer hover:bg-slate-50 rounded px-1 w-full text-center"
                    >
                      <option value="">Select</option>
                      <option value="Done">Done</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredWorkers.length === 0 && !loading && (
          <div className="p-12 text-center">
            <ClipboardList className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500">No workers found requesting COM.</p>
          </div>
        )}
      </div>
    </div>
  );
}
