import { useState, useEffect, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Worker, UserProfile } from '../types';
import { 
  ArrowLeft,
  Calendar,
  Search,
  Download,
  FileText,
  Clock,
  History
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { formatDate, formatDateTime, parseDate } from '../utils/dateUtils';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function PaymentHistory() {
  const { profile } = useOutletContext<{ profile: UserProfile | null }>();
  const navigate = useNavigate();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0].slice(0, 8) + '01');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (!profile) return;

    const unsub = onSnapshot(collection(db, 'payment_logs'), (snap) => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'payment_logs');
      setLoading(false);
    });

    return () => unsub();
  }, [profile]);

  const historyItems = useMemo(() => {
    return logs
      .filter(log => {
        const matchesSearch = log.workerName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             log.workerId?.toLowerCase().includes(searchTerm.toLowerCase());
        
        if (!log.timestamp) return matchesSearch;

        try {
          const logDate = parseDate(log.timestamp);
          const start = startOfDay(parseDate(startDate) || new Date());
          const end = endOfDay(parseDate(endDate) || new Date());
          
          if (!logDate) return matchesSearch;
          
          const matchesDate = isWithinInterval(logDate, { start, end });
          return matchesSearch && matchesDate;
        } catch (e) {
          return matchesSearch;
        }
      })
      .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
  }, [logs, searchTerm, startDate, endDate]);

  const handleExportExcel = () => {
    try {
      const exportData = historyItems.map((item, index) => ({
        'SL No.': index + 1,
        'Worker Name': item.workerName,
        'Action': item.action,
        'Type': item.type,
        'Performed By': item.performedBy,
        'Date': item.timestamp ? formatDateTime(item.timestamp) : '-',
        'Details': item.details || item.reason || '-'
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Payment History');
      XLSX.writeFile(wb, `Payment_History_${startDate}_to_${endDate}.xlsx`);
      toast.success('Exported to Excel');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export to Excel');
    }
  };

  const handleExportPDF = () => {
    try {
      const doc = new jsPDF('l', 'mm', 'a4');
      doc.setFontSize(18);
      doc.text('Payment Approval History', 14, 15);
      doc.setFontSize(10);
      doc.text(`Period: ${formatDate(startDate)} to ${formatDate(endDate)}`, 14, 22);
      doc.text(`Generated on: ${formatDateTime(new Date().toISOString())}`, 14, 27);

      const tableData = historyItems.map((item, index) => [
        index + 1,
        item.workerName,
        item.action,
        item.type,
        item.performedBy,
        item.timestamp ? formatDateTime(item.timestamp, 'dd/MMM/yy HH:mm') : '-',
        item.details || item.reason || '-'
      ]);

      autoTable(doc, {
        startY: 35,
        head: [[
          'SL', 'Worker Name', 'Action', 'Type', 'Performed By', 'Date', 'Details'
        ]],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontSize: 8 },
        styles: { fontSize: 7, cellPadding: 2, cellWidth: 'wrap' }
      });

      doc.save(`Payment_History_${startDate}_to_${endDate}.pdf`);
      toast.success('Exported to PDF');
    } catch (error) {
      console.error('PDF Export error:', error);
      toast.error('Failed to export to PDF');
    }
  };

  if (profile?.role !== 'super_admin' && !profile?.permissions?.canApprovePayments) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-slate-500">
        <History className="w-12 h-12 mb-4 opacity-20" />
        <p>You do not have permission to access payment history.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/payment-approvals')}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Payment Approval History</h1>
            <p className="text-slate-500 text-xs">View detailed history of all approved payments</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-col lg:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search worker..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <div className="relative flex-1 min-w-[150px]">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-xs"
            />
          </div>
          <div className="relative flex-1 min-w-[150px]">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-xs"
            />
          </div>
          <button 
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            Excel
          </button>
          <button 
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-rose-600 rounded-lg hover:bg-rose-700 transition-colors shadow-sm"
          >
            <FileText className="w-4 h-4" />
            PDF
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-r border-slate-200 text-center">SL</th>
                <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-r border-slate-200">Worker Name</th>
                <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-r border-slate-200">Action</th>
                <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-r border-slate-200">Type</th>
                <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-r border-slate-200">Performed By</th>
                <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-r border-slate-200 text-center">Date</th>
                <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {historyItems.map((item, index) => (
                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 text-sm text-slate-600 border-r border-slate-200 text-center">{index + 1}</td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-900 border-r border-slate-200">{item.workerName}</td>
                  <td className="px-6 py-4 text-sm text-slate-600 border-r border-slate-200 font-bold">{item.action}</td>
                  <td className="px-6 py-4 border-r border-slate-200">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      item.type === 'FOMEMA' ? 'bg-rose-100 text-rose-700' :
                      item.type === 'INSURANCE' ? 'bg-indigo-100 text-indigo-700' :
                      item.type === 'PLKS' ? 'bg-emerald-100 text-emerald-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {item.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 border-r border-slate-200">{item.performedBy}</td>
                  <td className="px-6 py-4 text-sm text-slate-500 border-r border-slate-200 text-center">
                    {item.timestamp ? formatDateTime(item.timestamp) : '-'}
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-500 italic max-w-[200px] truncate">
                    {item.details || item.reason || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {historyItems.length === 0 && !loading && (
          <div className="p-12 text-center">
            <Clock className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500">No approval history found for the selected criteria.</p>
          </div>
        )}
      </div>
    </div>
  );
}
