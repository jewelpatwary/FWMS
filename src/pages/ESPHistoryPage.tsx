import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  collection, 
  query, 
  onSnapshot, 
  where,
  orderBy,
  doc,
  getDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Worker, ESPHistory } from '../types';
import { 
  X,
  Clock
} from 'lucide-react';
import { formatDate, formatDateTime } from '../utils/dateUtils';

export default function ESPHistoryPage() {
  const { workerId } = useParams<{ workerId: string }>();
  const navigate = useNavigate();
  const [worker, setWorker] = useState<Worker | null>(null);
  const [history, setHistory] = useState<ESPHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workerId) return;

    // Fetch worker details
    const fetchWorker = async () => {
      try {
        const workerDoc = await getDoc(doc(db, 'workers', workerId));
        if (workerDoc.exists()) {
          setWorker({ id: workerDoc.id, ...workerDoc.data() } as Worker);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'workers');
      }
    };

    fetchWorker();

    // Fetch history
    const q = query(
      collection(db, 'esp_history'),
      where('workerId', '==', workerId),
      orderBy('createdAt', 'desc')
    );

    const unsubHistory = onSnapshot(q, (snap) => {
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as ESPHistory)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'esp_history');
      setLoading(false);
    });

    return () => unsubHistory();
  }, [workerId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 whitespace-nowrap">eSP Expiry History</h1>
          {worker && (
            <p className="text-slate-500 text-sm whitespace-nowrap">{worker.fullName} ({worker.workerId})</p>
          )}
        </div>
        <button 
          onClick={() => navigate('/esp')}
          className="p-2 hover:bg-slate-100 rounded-full transition-colors"
          title="Close"
        >
          <X className="w-6 h-6 text-slate-500" />
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden p-6">
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-12 text-slate-500 whitespace-nowrap">Loading history...</div>
          ) : history.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <Clock className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-500 whitespace-nowrap">No history found for this worker</p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((entry) => (
                <div key={entry.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                  <div className="whitespace-nowrap">
                    <p className="text-sm font-semibold text-slate-900">Expiry Date: {formatDate(entry.expiryDate)}</p>
                    <p className="text-xs text-slate-500">Updated by: {entry.updatedByName}</p>
                  </div>
                  <div className="text-right whitespace-nowrap">
                    <p className="text-xs text-slate-400">
                      {entry.createdAt ? formatDateTime(entry.createdAt) : '-'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
