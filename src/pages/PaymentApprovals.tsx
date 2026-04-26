import { useState, useEffect, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, where, updateDoc, doc, addDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Worker, UserProfile, Client, PermitHolder } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Search, 
  Filter,
  CreditCard,
  ShieldCheck,
  FileText,
  Download,
  History,
  RotateCcw,
  X
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { parseISO } from 'date-fns';
import { formatDate, formatDateTime, parseDate } from '../utils/dateUtils';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function PaymentApprovals() {
  const { profile } = useOutletContext<{ profile: UserProfile | null }>();
  const navigate = useNavigate();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [permitHolders, setPermitHolders] = useState<PermitHolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'fomema' | 'insurance' | 'plks'>('all');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'all' | 'request' | 'done' | 'refund'>('all');

  useEffect(() => {
    if (!profile) return;

    // Fetch Workers
    const q = query(collection(db, 'workers'));
    const unsubWorkers = onSnapshot(q, (snap) => {
      const allWorkers = snap.docs.map(d => ({ id: d.id, ...d.data() } as Worker));
      setWorkers(allWorkers);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'workers');
      setLoading(false);
    });

    // Fetch Clients
    const unsubClients = onSnapshot(collection(db, 'clients'), (snap) => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() } as Client)));
    });

    // Fetch Permit Holders
    const unsubHolders = onSnapshot(collection(db, 'permit_holders'), (snap) => {
      setPermitHolders(snap.docs.map(d => ({ id: d.id, ...d.data() } as PermitHolder)));
    });

    return () => {
      unsubWorkers();
      unsubClients();
      unsubHolders();
    };
  }, [profile]);

  const approvePayment = async (worker: Worker, type: 'fomema' | 'insurance' | 'plks') => {
    if (!profile?.permissions?.canApprovePayments && profile?.role !== 'super_admin') {
      toast.error('You do not have permission to approve payments');
      return;
    }

    const updates: any = {
      updatedAt: new Date().toISOString()
    };

    if (type === 'fomema') {
      updates.fomemaPaymentApproved = true;
      updates.fomemaPaymentApprovedBy = profile.displayName;
      updates.fomemaPaymentApprovedAt = new Date().toISOString();
      updates.fomemaPayment = 'Payment Done';
      updates.fomemaStatus = 'Payment Done';
    } else if (type === 'insurance') {
      updates.insurancePaymentApproved = true;
      updates.insurancePaymentApprovedBy = profile.displayName;
      updates.insurancePaymentApprovedAt = new Date().toISOString();
      updates.insurancePayment = 'Payment Done';
      updates.insurancePurchase = 'Done';
    } else if (type === 'plks') {
      updates.plksPaymentApproved = true;
      updates.plksPaymentApprovedBy = profile.displayName;
      updates.plksPaymentApprovedAt = new Date().toISOString();
      updates.plksPayment = 'Payment Done';
      updates.plksStatus = 'Payment Done';
    }

    try {
      const logPromises = [];
      
      // Log each field change
      Object.entries(updates).forEach(([key, value]) => {
        if (key === 'updatedAt') return;
        logPromises.push(addDoc(collection(db, 'audit_logs'), {
          workerId: worker.id,
          changedBy: profile.uid,
          changedByName: profile.displayName,
          changeType: 'payment',
          fieldName: key,
          oldValue: String(worker[key as keyof Worker] || ''),
          newValue: String(value || ''),
          timestamp: new Date().toISOString()
        }));
      });

      await Promise.all([
        updateDoc(doc(db, 'workers', worker.id), updates),
        ...logPromises,
        addDoc(collection(db, 'payment_logs'), {
          workerId: worker.id,
          workerName: worker.fullName,
          type: type.toUpperCase(),
          action: 'Approve Payment',
          performedBy: profile.displayName,
          performedByUid: profile.uid,
          timestamp: new Date().toISOString(),
          requestedBy: worker[`${type}PaymentRequestedBy` as keyof Worker] || 'Unknown',
          requestedAt: worker[`${type}PaymentRequestedAt` as keyof Worker] || ''
        })
      ]);
      toast.success(`${type.toUpperCase()} payment approved`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'workers');
      toast.error('Failed to approve payment');
    }
  };

  const approveRefund = async (worker: Worker, type: 'fomema' | 'insurance' | 'plks') => {
    if (profile?.role !== 'super_admin') {
      toast.error('Only Super Admin can approve refunds');
      return;
    }

    const updates: any = {
      updatedAt: new Date().toISOString()
    };

    if (type === 'fomema') {
      updates.fomemaRefundApproved = true;
      updates.fomemaRefundApprovedBy = profile.displayName;
      updates.fomemaRefundApprovedAt = new Date().toISOString();
      updates.fomemaPaymentApproved = false;
      updates.fomemaPaymentApprovedBy = '';
      updates.fomemaPaymentApprovedAt = '';
      updates.fomemaPayment = '';
      updates.fomemaStatus = '';
      updates.fomemaPaymentRequestedBy = '';
      updates.fomemaPaymentRequestedAt = '';
      updates.fomemaReRequestReason = '';
      
      updates.insurancePurchase = '';
      updates.insurancePayment = '';
      updates.insurancePaymentApproved = false;
      updates.insurancePaymentApprovedBy = '';
      updates.insurancePaymentApprovedAt = '';
      updates.insurancePaymentRequestedBy = '';
      updates.insurancePaymentRequestedAt = '';
      
      updates.plksStatus = '';
      updates.plksPayment = '';
      updates.plksPaymentApproved = false;
      updates.plksPaymentApprovedBy = '';
      updates.plksPaymentApprovedAt = '';
      updates.plksPaymentRequestedBy = '';
      updates.plksPaymentRequestedAt = '';
    } else if (type === 'insurance') {
      updates.insuranceRefundApproved = true;
      updates.insuranceRefundApprovedBy = profile.displayName;
      updates.insuranceRefundApprovedAt = new Date().toISOString();
      updates.insurancePaymentApproved = false;
      updates.insurancePaymentApprovedBy = '';
      updates.insurancePaymentApprovedAt = '';
    } else if (type === 'plks') {
      updates.plksRefundApproved = true;
      updates.plksRefundApprovedBy = profile.displayName;
      updates.plksRefundApprovedAt = new Date().toISOString();
      updates.plksPaymentApproved = false;
      updates.plksPaymentApprovedBy = '';
      updates.plksPaymentApprovedAt = '';
    }

    try {
      const logPromises = [];
      
      // Log each field change
      Object.entries(updates).forEach(([key, value]) => {
        if (key === 'updatedAt') return;
        logPromises.push(addDoc(collection(db, 'audit_logs'), {
          workerId: worker.id,
          changedBy: profile.uid,
          changedByName: profile.displayName,
          changeType: 'refund',
          fieldName: key,
          oldValue: String(worker[key as keyof Worker] || ''),
          newValue: String(value || ''),
          timestamp: new Date().toISOString()
        }));
      });

      await Promise.all([
        updateDoc(doc(db, 'workers', worker.id), updates),
        ...logPromises,
        addDoc(collection(db, 'payment_logs'), {
          workerId: worker.id,
          workerName: worker.fullName,
          type: type.toUpperCase(),
          action: 'Approve Refund',
          performedBy: profile.displayName,
          performedByUid: profile.uid,
          timestamp: new Date().toISOString(),
          requestedBy: worker[`${type}RefundRequestedBy` as keyof Worker] || 'Unknown',
          requestedAt: worker[`${type}RefundRequestedAt` as keyof Worker] || '',
          reason: worker[`${type}RefundReason` as keyof Worker] || ''
        })
      ]);
      toast.success(`${type.toUpperCase()} refund approved`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'workers');
      toast.error('Failed to approve refund');
    }
  };

  const [resetModalWorker, setResetModalWorker] = useState<Worker | null>(null);
  const [resetConfirmText, setResetConfirmText] = useState('');

  const handleResetSubmit = async () => {
    if (!resetModalWorker || profile?.role !== 'super_admin') return;
    if (resetConfirmText !== 'RESET') {
      toast.error('Please type RESET to confirm');
      return;
    }

    const loadingToast = toast.loading('Resetting permit renewal process...');

    try {
      const resetData: any = {
        // Acknowledgement
        acknowledgement: '',

        // FOMEMA
        fomemaPayment: '',
        fomemaStatus: '',
        fomemaPaymentApproved: false,
        fomemaPaymentApprovedBy: '',
        fomemaPaymentApprovedAt: '',
        fomemaPaymentRequestedBy: '',
        fomemaPaymentRequestedAt: '',
        fomemaReRequestReason: '',
        fomemaRefundRequestedBy: '',
        fomemaRefundRequestedAt: '',
        fomemaRefundReason: '',
        fomemaRefundApproved: false,
        fomemaRefundApprovedBy: '',
        fomemaRefundApprovedAt: '',

        // Insurance
        insurancePurchase: '',
        insurancePayment: '',
        insurancePaymentApproved: false,
        insurancePaymentApprovedBy: '',
        insurancePaymentApprovedAt: '',
        insurancePaymentRequestedBy: '',
        insurancePaymentRequestedAt: '',
        insuranceRefundRequestedBy: '',
        insuranceRefundRequestedAt: '',
        insuranceRefundReason: '',
        insuranceRefundApproved: false,
        insuranceRefundApprovedBy: '',
        insuranceRefundApprovedAt: '',

        // PLKS
        plksStatus: '',
        plksPayment: '',
        plksPaymentApproved: false,
        plksPaymentApprovedBy: '',
        plksPaymentApprovedAt: '',
        plksPaymentRequestedBy: '',
        plksPaymentRequestedAt: '',
        plksRefundRequestedBy: '',
        plksRefundRequestedAt: '',
        plksRefundReason: '',
        plksRefundApproved: false,
        plksRefundApprovedBy: '',
        plksRefundApprovedAt: '',

        // COM & Other
        comApply: '',
        comStatus: '',
        comRequestDate: '',

        updatedAt: new Date().toISOString()
      };

      // 1. Log to audit_logs (system log)
      await addDoc(collection(db, 'audit_logs'), {
        workerId: resetModalWorker.id,
        changedBy: profile.uid,
        changedByName: profile.displayName,
        changeType: 'status',
        fieldName: 'permit_renewal_process',
        oldValue: 'Active/Approved/Partial',
        newValue: 'Reset to Blank',
        timestamp: new Date().toISOString(),
        details: `Full reset of permit renewal process for ${resetModalWorker.fullName} by Super Admin`
      });

      // 2. Log to payment_logs (for Payment History)
      await addDoc(collection(db, 'payment_logs'), {
        workerId: resetModalWorker.id,
        workerName: resetModalWorker.fullName,
        type: 'RESET',
        action: 'Process Reset',
        performedBy: profile.displayName,
        performedByUid: profile.uid,
        timestamp: new Date().toISOString(),
        details: 'Entire permit renewal process reset to blank state by Super Admin'
      });

      // 3. Update the worker document
      await updateDoc(doc(db, 'workers', resetModalWorker.id), resetData);
      
      toast.dismiss(loadingToast);
      toast.success('Permit renewal process reset successfully');
      setResetModalWorker(null);
      setResetConfirmText('');
    } catch (error) {
      toast.dismiss(loadingToast);
      handleFirestoreError(error, OperationType.UPDATE, 'workers');
      toast.error('Failed to reset permit renewal');
    }
  };

  const filteredWorkers = useMemo(() => {
    return workers.filter(w => {
      const matchesSearch = w.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           w.workerId.toLowerCase().includes(searchTerm.toLowerCase());
      
      const checkStatus = (status: string | undefined) => {
        if (paymentStatusFilter === 'all') return true;
        if (paymentStatusFilter === 'request') return status === 'Payment Request' || status === 'Payment Re-Request';
        if (paymentStatusFilter === 'done') return status === 'Payment Done' || status === 'Done' || status === 'Payment Approved';
        if (paymentStatusFilter === 'refund') return status === 'Refund';
        return false;
      };

      let matchesType = true;
      if (filterType === 'fomema') matchesType = checkStatus(w.fomemaPayment || w.fomemaStatus);
      else if (filterType === 'insurance') matchesType = checkStatus(w.insurancePayment || w.insurancePurchase);
      else if (filterType === 'plks') matchesType = checkStatus(w.plksPayment || w.plksStatus) || w.plksStatus === 'Applied';
      else if (filterType === 'all') {
        matchesType = checkStatus(w.fomemaPayment || w.fomemaStatus) || 
                      checkStatus(w.insurancePayment || w.insurancePurchase) || 
                      checkStatus(w.plksPayment || w.plksStatus) ||
                      w.plksStatus === 'Applied';
      }

      return matchesSearch && matchesType;
    });
  }, [workers, searchTerm, filterType, paymentStatusFilter]);

  const handleExportExcel = () => {
    try {
      const exportData = filteredWorkers.map((w, index) => ({
        'SL No.': index + 1,
        'Worker Name': w.fullName,
        'Worker ID': w.workerId,
        'Passport Number': w.newPassport || w.oldPassport || '-',
        'Permit Expiry': formatDate(w.permitExpiry),
        'Permit Year': w.permitYear || '-',
        'Permit Holder': permitHolders.find(h => h.id === w.permitHolder)?.name || w.permitHolder || '-',
        'Client': clients.find(c => c.id === w.clientId)?.name || '-',
        'Managed By': w.managedBy || '-',
        'Acknowledgement': w.acknowledgement || '-',
        'Fomema Status': w.fomemaStatus || '-',
        'Fomema Approved': w.fomemaPaymentApproved ? 'Yes' : 'No',
        'Purchase Insurance': w.insurancePurchase || '-',
        'Insurance Approved': w.insurancePaymentApproved ? 'Yes' : 'No',
        'PLKS Status': w.plksStatus || '-',
        'PLKS Approved': w.plksPaymentApproved ? 'Yes' : 'No'
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Payment Approvals');
      XLSX.writeFile(wb, `Payment_Approvals_${formatDate(new Date()).replace(/\//g, '-')}.xlsx`);
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
      doc.text('Payment Approvals List', 14, 15);
      doc.setFontSize(10);
      doc.text(`Generated on: ${formatDateTime(new Date())}`, 14, 22);

      const tableData = filteredWorkers.map((w, index) => [
        index + 1,
        w.fullName,
        w.workerId,
        w.permitExpiry ? formatDate(w.permitExpiry, 'dd/MMM/yy') : '-',
        clients.find(c => c.id === w.clientId)?.name || '-',
        w.fomemaStatus || '-',
        w.fomemaPaymentApproved ? 'Approved' : '-',
        w.insurancePurchase || '-',
        w.insurancePaymentApproved ? 'Approved' : '-',
        w.plksStatus || '-',
        w.plksPaymentApproved ? 'Approved' : '-'
      ]);

      autoTable(doc, {
        startY: 30,
        head: [[
          'SL', 'Name', 'ID', 'Permit Ex.', 'Client', 'Fomema', 'F. Appr', 'Insurance', 'I. Appr', 'PLKS', 'P. Appr'
        ]],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontSize: 8 },
        styles: { fontSize: 7, cellPadding: 2, cellWidth: 'wrap' }
      });

      doc.save(`Payment_Approvals_${formatDate(new Date()).replace(/\//g, '-')}.pdf`);
      toast.success('Exported to PDF');
    } catch (error) {
      console.error('PDF Export error:', error);
      toast.error('Failed to export to PDF');
    }
  };

  if (profile?.role !== 'super_admin' && !profile?.permissions?.canApprovePayments) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-slate-500">
        <AlertCircle className="w-12 h-12 mb-4 opacity-20" />
        <p>You do not have permission to access payment approvals.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payment Approvals</h1>
          <p className="text-slate-500 text-xs">Review and approve payment requests for Fomema, Insurance, and PLKS</p>
        </div>
        
      {/* Filters & Search */}
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
            <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-xs appearance-none"
            >
              <option value="all">All Payment</option>
              <option value="fomema">FOMEMA</option>
              <option value="insurance">Insurance</option>
              <option value="plks">PLKS</option>
            </select>
          </div>
          <div className="relative flex-1 min-w-[150px]">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              value={paymentStatusFilter}
              onChange={(e) => setPaymentStatusFilter(e.target.value as any)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-xs appearance-none"
            >
              <option value="all">All Status</option>
              <option value="request">Request</option>
              <option value="done">Payment Done</option>
              <option value="refund">Refund</option>
            </select>
          </div>
          <button 
            onClick={() => {
              setSearchTerm('');
              setFilterType('all');
              setPaymentStatusFilter('all');
            }}
            className="px-4 py-2 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100"
          >
            Clear
          </button>
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
          <button 
            onClick={() => navigate('/payment-history')}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <History className="w-4 h-4" />
            History
          </button>
        </div>
      </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-280px)]">
        <div className="overflow-auto flex-1 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100">
          <table className="w-full text-left border-collapse border border-slate-200 min-w-max">
            <thead className="sticky top-0 z-20 shadow-sm">
              <tr className="bg-indigo-600 border-b border-indigo-700">
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center">SL No.</th>
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-left">Worker Name</th>
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center">Old Passport Number</th>
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center">New Passport Number</th>
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center">Passport Ex.</th>
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center">Passport Remaining</th>
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center">Permit Ex.</th>
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center">Permit Year</th>
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center">Permit Holder</th>
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center">Current Client</th>
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center">Managed By</th>
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center">Worker Acknowledgement</th>
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center bg-rose-600 min-w-[150px]">FOMEMA Payment</th>
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center bg-indigo-600 min-w-[150px]">Insurance Payment</th>
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center bg-emerald-600 min-w-[150px]">PLKS Payment</th>
                {profile?.role === 'super_admin' && (
                  <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center bg-slate-800">Action</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredWorkers.map((worker, index) => (
                <tr key={worker.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">{index + 1}</td>
                  <td className="px-4 py-3 text-[13px] font-medium text-slate-900 whitespace-nowrap border border-slate-200 text-left">{worker.fullName}</td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">{worker.oldPassport || '-'}</td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">{worker.newPassport || '-'}</td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">{formatDate(worker.passportExpiry)}</td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">
                    {(() => {
                      if (!worker.passportExpiry) return '-';
                      const expDate = parseDate(worker.passportExpiry);
                      if (!expDate) return 'Invalid';
                      const today = new Date();
                      const diffTime = expDate.getTime() - today.getTime();
                      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                      if (diffDays < 0) return 'Expired';
                      const years = Math.floor(diffDays / 365);
                      const months = Math.floor((diffDays % 365) / 30);
                      return `${years}y ${months}m`;
                    })()}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">{formatDate(worker.permitExpiry)}</td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">{worker.permitYear || '-'}</td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">
                    {permitHolders.find(h => h.id === worker.permitHolder)?.name || worker.permitHolder || '-'}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">
                    {clients.find(c => c.id === worker.clientId)?.name || '-'}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">{worker.managedBy || '-'}</td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">{worker.acknowledgement || '-'}</td>
                  
                  {/* FOMEMA Column */}
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center bg-rose-50/30">
                    {(worker.fomemaPayment === 'Payment Request' || worker.fomemaStatus === 'Payment Request' || worker.fomemaStatus === 'Payment Re-Request') && !worker.fomemaPaymentApproved ? (
                      <div className="flex flex-col items-center gap-1">
                        {worker.fomemaStatus === 'Payment Re-Request' && (
                          <span className="text-[8px] text-rose-500 italic truncate max-w-[100px]" title={worker.fomemaReRequestReason}>
                            Re: {worker.fomemaReRequestReason}
                          </span>
                        )}
                        <button
                          onClick={() => approvePayment(worker, 'fomema')}
                          className="px-3 py-1 bg-rose-600 text-white rounded text-[10px] font-bold hover:bg-rose-700 transition-colors shadow-sm"
                        >
                          Approve
                        </button>
                      </div>
                    ) : (worker.fomemaPayment === 'Refund' || worker.fomemaStatus === 'Refund') && !worker.fomemaRefundApproved ? (
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[8px] text-amber-600 font-bold uppercase italic truncate max-w-[100px]" title={worker.fomemaRefundReason}>
                          Reason: {worker.fomemaRefundReason}
                        </span>
                        <button
                          onClick={() => approveRefund(worker, 'fomema')}
                          className="px-3 py-1 bg-amber-600 text-white rounded text-[10px] font-bold hover:bg-amber-700 transition-colors shadow-sm"
                        >
                          Approve Refund
                        </button>
                      </div>
                    ) : (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        (worker.fomemaPayment === 'Payment Done' || worker.fomemaStatus === 'Payment Done') ? 'bg-emerald-100 text-emerald-700' :
                        (worker.fomemaPayment === 'Refund' || worker.fomemaStatus === 'Refund') ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {worker.fomemaPayment || worker.fomemaStatus || 'NONE'}
                      </span>
                    )}
                  </td>

                  {/* Insurance Column */}
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center bg-indigo-50/30">
                    {(worker.insurancePayment === 'Payment Request' || worker.insurancePurchase === 'Payment Request') && !worker.insurancePaymentApproved ? (
                      <button
                        onClick={() => approvePayment(worker, 'insurance')}
                        className="px-3 py-1 bg-indigo-600 text-white rounded text-[10px] font-bold hover:bg-indigo-700 transition-colors shadow-sm"
                      >
                        Approve
                      </button>
                    ) : (worker.insurancePayment === 'Refund' || worker.insurancePurchase === 'Refund') && !worker.insuranceRefundApproved ? (
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[8px] text-amber-600 font-bold uppercase italic truncate max-w-[100px]" title={worker.insuranceRefundReason}>
                          Reason: {worker.insuranceRefundReason}
                        </span>
                        <button
                          onClick={() => approveRefund(worker, 'insurance')}
                          className="px-4 py-1 bg-amber-600 text-white rounded text-[10px] font-bold hover:bg-amber-700 transition-colors shadow-sm"
                        >
                          Approve Refund
                        </button>
                      </div>
                    ) : (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        (worker.insurancePayment === 'Payment Done' || worker.insurancePurchase === 'Payment Done' || worker.insurancePurchase === 'Done') ? 'bg-emerald-100 text-emerald-700' :
                        (worker.insurancePayment === 'Refund' || worker.insurancePurchase === 'Refund') ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {worker.insurancePayment || worker.insurancePurchase || 'NONE'}
                      </span>
                    )}
                  </td>

                  {/* PLKS Column */}
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center bg-emerald-50/30">
                    {(worker.plksPayment === 'Payment Request' || worker.plksStatus === 'Payment Request' || worker.plksStatus === 'Applied') && !worker.plksPaymentApproved ? (
                      <button
                        onClick={() => approvePayment(worker, 'plks')}
                        className="px-3 py-1 bg-emerald-600 text-white rounded text-[10px] font-bold hover:bg-emerald-700 transition-colors shadow-sm"
                      >
                        Approve
                      </button>
                    ) : (worker.plksPayment === 'Refund' || worker.plksStatus === 'Refund') && !worker.plksRefundApproved ? (
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[8px] text-amber-600 font-bold uppercase italic truncate max-w-[100px]" title={worker.plksRefundReason}>
                          Reason: {worker.plksRefundReason}
                        </span>
                        <button
                          onClick={() => approveRefund(worker, 'plks')}
                          className="px-4 py-1 bg-amber-600 text-white rounded text-[10px] font-bold hover:bg-amber-700 transition-colors shadow-sm"
                        >
                          Approve Refund
                        </button>
                      </div>
                    ) : (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        (worker.plksPayment === 'Payment Done' || worker.plksStatus === 'Payment Done' || worker.plksPayment === 'Payment Approved') ? 'bg-emerald-100 text-emerald-700' :
                        (worker.plksPayment === 'Refund' || worker.plksStatus === 'Refund') ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {worker.plksPayment || worker.plksStatus || 'NONE'}
                      </span>
                    )}
                  </td>
                  {profile?.role === 'super_admin' && (
                    <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">
                      <button
                        onClick={() => {
                          setResetModalWorker(worker);
                          setResetConfirmText('');
                        }}
                        className="flex items-center justify-center gap-1 mx-auto px-2 py-1 bg-rose-50 text-rose-600 rounded text-[10px] font-bold hover:bg-rose-100 transition-colors border border-rose-100"
                        title="Reset Entire Permit Renewal Process"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Reset
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredWorkers.length === 0 && (
          <div className="p-12 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-200 mx-auto mb-4" />
            <p className="text-slate-500">No pending payment approvals found.</p>
          </div>
        )}
      </div>
      {/* Reset Confirmation Modal */}
      <AnimatePresence>
        {resetModalWorker && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="bg-rose-600 p-6 text-white relative">
                <button 
                  onClick={() => setResetModalWorker(null)}
                  className="absolute right-4 top-4 p-1 hover:bg-white/20 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <RotateCcw className="w-6 h-6 text-white" />
                  </div>
                  <h2 className="text-xl font-bold">Reset Process?</h2>
                </div>
                <p className="text-rose-100 text-sm">
                  This action is irreversible and will clear all progress for {resetModalWorker.fullName}.
                </p>
              </div>

              <div className="p-6 space-y-4">
                <div className="bg-rose-50 border border-rose-100 p-4 rounded-xl">
                  <h3 className="text-rose-800 text-sm font-bold mb-2 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    What will be reset?
                  </h3>
                  <ul className="text-rose-700 text-xs space-y-1 list-disc list-inside">
                    <li>FOMEMA Payment & Status</li>
                    <li>Insurance Payment & Purchase</li>
                    <li>PLKS Payment & Status</li>
                    <li>Worker Acknowledgement</li>
                    <li>COM Application status</li>
                  </ul>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Type <span className="font-bold text-rose-600 underline">RESET</span> to confirm
                  </label>
                  <input
                    type="text"
                    value={resetConfirmText}
                    onChange={(e) => setResetConfirmText(e.target.value)}
                    placeholder="Type RESET here"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none transition-all font-mono text-center tracking-widest"
                    autoFocus
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setResetModalWorker(null)}
                    className="flex-1 px-4 py-3 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-colors border border-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleResetSubmit}
                    disabled={resetConfirmText !== 'RESET'}
                    className={`flex-1 px-4 py-3 rounded-xl font-bold transition-all shadow-md ${
                      resetConfirmText === 'RESET'
                        ? 'bg-rose-600 text-white hover:bg-rose-700 active:scale-95'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    Reset Now
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
