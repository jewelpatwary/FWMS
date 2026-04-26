import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { 
  collection, 
  query, 
  onSnapshot, 
  orderBy,
  where,
  doc,
  getDoc,
  deleteDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { PlacementHistory as IPlacementHistory, UserProfile, Worker } from '../types';
import { 
  ArrowLeft,
  Download,
  FileText,
  Table as TableIcon,
  History,
  Clock,
  Trash2,
  User,
  Building2,
  Calendar,
  MessageSquare,
  X
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { formatDate, formatDateTime } from '../utils/dateUtils';

export default function WorkerHistory() {
  const { workerId } = useParams<{ workerId: string }>();
  const navigate = useNavigate();
  const { profile } = useOutletContext<{ profile: UserProfile | null }>();
  const [worker, setWorker] = useState<Worker | null>(null);
  const [history, setHistory] = useState<IPlacementHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile || !workerId) return;

    const fetchWorker = async () => {
      try {
        const docRef = doc(db, 'workers', workerId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setWorker({ id: docSnap.id, ...docSnap.data() } as Worker);
        } else {
          toast.error('Worker not found');
          navigate('/placement-history');
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `workers/${workerId}`);
      }
    };

    fetchWorker();

    const q = query(
      collection(db, 'placement_history'), 
      where('workerId', '==', workerId),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as IPlacementHistory)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'placement_history');
      setLoading(false);
    });

    return () => unsub();
  }, [profile, workerId, navigate]);

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

  const exportToExcel = () => {
    if (!worker) return;
    const data = history.map(item => ({
      'Update Date': formatDateTime(item.createdAt),
      'Client Name': item.clientName,
      'Join Date': item.joinDate ? formatDate(item.joinDate) : '-',
      'Termination Date': item.terminationDate ? formatDate(item.terminationDate) : 'Current',
      'Remark': item.remark || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Placement History');
    XLSX.writeFile(wb, `${worker.fullName}_Placement_History.xlsx`);
  };

  const exportToPDF = () => {
    if (!worker) return;
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('Worker Placement History', 14, 22);
    
    doc.setFontSize(12);
    doc.text(`Worker Name: ${worker.fullName}`, 14, 32);
    doc.text(`Worker ID: ${worker.workerId}`, 14, 38);
    doc.text(`Export Date: ${formatDateTime(new Date().toISOString())}`, 14, 44);

    const tableData = history.map(item => [
      formatDateTime(item.createdAt, 'dd/MMM/yy HH:mm'),
      item.clientName,
      item.joinDate ? formatDate(item.joinDate, 'dd/MMM/yy') : '-',
      item.terminationDate ? formatDate(item.terminationDate, 'dd/MMM/yy') : 'Current',
      item.remark || '-'
    ]);

    (doc as any).autoTable({
      startY: 50,
      head: [['Update Date', 'Client Name', 'Join Date', 'Termination Date', 'Remark']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] }, // Indigo-600
      styles: { cellWidth: 'wrap' }
    });

    doc.save(`${worker.fullName}_Placement_History.pdf`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative">
      <button 
        onClick={() => navigate('/placement-history')}
        className="absolute -top-2 -right-2 p-2 hover:bg-slate-100 rounded-full transition-colors z-10"
        title="Close"
      >
        <X className="w-6 h-6 text-slate-400" />
      </button>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pr-12">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{worker?.fullName}</h1>
          <p className="text-indigo-600 font-bold text-lg">{worker?.workerId}</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={exportToExcel}
            className="flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-sm text-sm font-medium"
          >
            <TableIcon className="w-4 h-4 mr-2" />
            Export Excel
          </button>
          <button 
            onClick={exportToPDF}
            className="flex items-center px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors shadow-sm text-sm font-medium"
          >
            <FileText className="w-4 h-4 mr-2" />
            Export PDF
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-indigo-600 border-b border-indigo-700">
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center">Update Date</th>
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center">Client Name</th>
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center">Join Date</th>
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center">Termination Date</th>
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center">Remark</th>
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {history.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Clock className="w-4 h-4 text-slate-400" />
                      {formatDateTime(item.createdAt)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[13px] font-medium text-indigo-600 whitespace-nowrap border border-slate-200 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Building2 className="w-4 h-4 text-slate-400" />
                      {item.clientName}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      {formatDate(item.joinDate)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      {item.terminationDate ? formatDate(item.terminationDate) : <span className="text-indigo-600 font-medium">Current Client</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center italic">
                    <div className="flex items-center justify-center gap-2">
                      <MessageSquare className="w-4 h-4 text-slate-400" />
                      {item.remark || '-'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center border border-slate-200">
                    <button 
                      onClick={() => handleDelete(item.id)}
                      className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {history.length === 0 && (
          <div className="p-12 text-center">
            <History className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500">No placement history records found for this worker.</p>
          </div>
        )}
      </div>
    </div>
  );
}
