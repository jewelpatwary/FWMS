import { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { 
  collection, 
  onSnapshot, 
  query,
  orderBy,
  getDoc,
  addDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Worker, UserProfile, Client, PermitHolder } from '../types';
import { 
  Search, 
  Calendar,
  Users,
  Filter,
  Building2,
  Download,
  AlertCircle,
  FileText,
  X,
  RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfMonth, endOfMonth, isWithinInterval, addDays, isBefore, addYears } from 'date-fns';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'react-hot-toast';
import { updateDoc, doc } from 'firebase/firestore';
import { formatDate, formatDateTime, parseDate } from '../utils/dateUtils';

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

export default function PermitRenewalList() {
  const MONTHS = [
    { value: '01', label: 'January' },
    { value: '02', label: 'February' },
    { value: '03', label: 'March' },
    { value: '04', label: 'April' },
    { value: '05', label: 'May' },
    { value: '06', label: 'June' },
    { value: '07', label: 'July' },
    { value: '08', label: 'August' },
    { value: '09', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' }
  ];

  const { profile } = useOutletContext<{ profile: UserProfile | null }>();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [permitHolders, setPermitHolders] = useState<PermitHolder[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>((new Date().getMonth() + 1).toString().padStart(2, '0'));
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [selectedManagedBy, setSelectedManagedBy] = useState<string>('');
  const [selectedFomemaStatus, setSelectedFomemaStatus] = useState<string>('');
  const [selectedPlksStatus, setSelectedPlksStatus] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [isReRequestModalOpen, setIsReRequestModalOpen] = useState(false);
  const [reRequestReason, setReRequestReason] = useState('');
  const [selectedWorkerForReRequest, setSelectedWorkerForReRequest] = useState<Worker | null>(null);
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [refundData, setRefundData] = useState<{ worker: Worker; field: string } | null>(null);
  const [globalSettings, setGlobalSettings] = useState<{ insuranceAutoUpdate: boolean }>({ insuranceAutoUpdate: true });
  
  const [resetModalWorker, setResetModalWorker] = useState<Worker | null>(null);
  const [resetConfirmText, setResetConfirmText] = useState('');

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'global');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setGlobalSettings(docSnap.data() as { insuranceAutoUpdate: boolean });
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    if (!profile) return;

    const q = query(collection(db, 'workers'), orderBy('permitExpiry', 'asc'));
    const unsubWorkers = onSnapshot(q, (snap) => {
      const workerList = snap.docs.map(d => ({ id: d.id, ...d.data() } as Worker));
      setWorkers(workerList);
      
      // Auto-reset workers who have entered their next renewal cycle (within 90 days of NEW expiry)
      workerList.forEach(w => {
        // If status is 'Collected' and we are now in the 90-day window of the NEW expiry date,
        // it means we are ready to start the NEXT renewal cycle.
        if (w.plksStatus === 'Collected' && isWorkerInRenewalWindow(w)) {
          const resetData: any = {
            acknowledgement: '',
            fomemaPayment: '-',
            fomemaStatus: '-',
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

            plksStatus: '',
            plksPayment: '-',
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

            comApply: '',
            comStatus: '',
            comRequestDate: '',
            updatedAt: new Date().toISOString()
          };
          updateDoc(doc(db, 'workers', w.id), resetData).catch(console.error);
        }
      });

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

      // Log to audit_logs
      await addDoc(collection(db, 'audit_logs'), {
        workerId: resetModalWorker.id,
        changedBy: profile.uid,
        changedByName: profile.displayName,
        changeType: 'status',
        fieldName: 'permit_renewal_process',
        oldValue: 'Reset From Permit Renewal List',
        newValue: 'Reset to Blank',
        timestamp: new Date().toISOString(),
        details: `Full reset of permit renewal process for ${resetModalWorker.fullName} by Super Admin`
      });

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

  const isWorkerInRenewalWindow = (worker: Worker) => {
    const expiryDate = parseDate(worker.permitExpiry);
    if (!expiryDate) return false;
    try {
      const today = new Date();
      const ninetyDaysFromNow = addDays(today, 90);
      // Updateable if expiry is within 90 days from now
      return isBefore(expiryDate, ninetyDaysFromNow);
    } catch (e) {
      return false;
    }
  };

  const updateWorkerField = async (worker: Worker, field: string, value: string) => {
    // Check if worker is within renewal window (90 days)
    // Allow 'Collected' workers to be edited even if expiry is moved forward
    if (!isWorkerInRenewalWindow(worker) && worker.plksStatus !== 'Collected') {
      toast.error('Updates are only permitted within 90 days of permit expiry');
      return;
    }

    // Rules
    if (field === 'fomemaPayment' && value && worker.acknowledgement !== 'Agree') {
      toast.error('Acknowledgement must be "Agree" to update FOMEMA Payment');
      return;
    }
    if (field === 'fomemaStatus' && value) {
      if (worker.acknowledgement !== 'Agree') {
        toast.error('Acknowledgement must be "Agree" to update Fomema Status');
        return;
      }
      if (worker.fomemaPayment !== 'Payment Done' && value !== 'Refund' && worker.fomemaStatus !== 'Refund') {
        toast.error('FOMEMA Payment must be "Payment Done" to update Fomema Status');
        return;
      }
    }
    if (field === 'insurancePurchase' && value) {
      if (worker.acknowledgement !== 'Agree') {
        toast.error('Acknowledgement must be "Agree" to update Purchase Insurance');
        return;
      }
      if (worker.fomemaStatus !== 'Suitable' && !['Applied', 'Application Approved', 'Payment Request', 'Pending payment', 'Payment Done', 'Collected'].includes(worker.plksStatus as string) && !worker.plksPaymentApproved) {
        toast.error('Fomema Status must be "Suitable" or PLKS Status must be "Applied" to update Purchase Insurance');
        return;
      }
    }
    if (field === 'insurancePayment' && value) {
      if (worker.acknowledgement !== 'Agree') {
        toast.error('Acknowledgement must be "Agree" to update Insurance Payment');
        return;
      }
      if (worker.fomemaStatus !== 'Suitable' && !['Applied', 'Application Approved', 'Payment Request', 'Pending payment', 'Payment Done', 'Collected'].includes(worker.plksStatus as string) && !worker.plksPaymentApproved) {
        toast.error('Fomema Status must be "Suitable" or PLKS Status must be "Applied" to update Insurance Payment');
        return;
      }
      if (worker.insurancePurchase !== 'Done' && value !== 'Refund') {
        toast.error('Purchase Insurance must be "Done" to update Insurance Payment');
        return;
      }
    }
    if (field === 'plksStatus' && value) {
      if (worker.acknowledgement !== 'Agree') {
        toast.error('Acknowledgement must be "Agree" to update PLKS Status');
        return;
      }
      if (worker.fomemaStatus !== 'Suitable' && !['Applied', 'Application Approved', 'Payment Request', 'Pending payment', 'Payment Done', 'Collected'].includes(worker.plksStatus as string) && !worker.plksPaymentApproved && value !== 'Applied') {
        toast.error('Fomema Status must be "Suitable" to update PLKS Status');
        return;
      }
    }
    if (field === 'plksPayment' && value) {
      if (worker.acknowledgement !== 'Agree') {
        toast.error('Acknowledgement must be "Agree" to update PLKS Payment');
        return;
      }
      if (worker.fomemaStatus !== 'Suitable' && !['Applied', 'Application Approved', 'Payment Request', 'Pending payment', 'Payment Done', 'Collected'].includes(worker.plksStatus as string) && !worker.plksPaymentApproved) {
        toast.error('Fomema Status must be "Suitable" or PLKS Status must be "Applied" to update PLKS Payment');
        return;
      }
      if (worker.insurancePurchase !== 'Done') {
        toast.error('Purchase Insurance must be "Done" to update PLKS Payment');
        return;
      }
    }

    const updates: any = { [field]: value, updatedAt: new Date().toISOString() };

    // Sync Payment fields with Status fields
    if (field === 'fomemaPayment') {
      updates.fomemaStatus = value;
    } else if (field === 'fomemaStatus' && (value === 'Payment Request' || value === 'Payment Done' || value === 'Refund')) {
      updates.fomemaPayment = value;
    } else if (field === 'insurancePayment') {
      if (value === 'Payment Done') {
        updates.insurancePurchase = 'Done';
      }
    } else if (field === 'insurancePurchase' && (value === 'Payment Request' || value === 'Payment Done' || value === 'Refund' || value === 'Done')) {
      if (value !== 'Done') {
        updates.insurancePayment = value;
      }
    } else if (field === 'plksPayment') {
      updates.plksStatus = value;
    } else if (field === 'plksStatus') {
      // Special logic for PLKS Status
      if (value === 'Applied') {
        if (globalSettings.insuranceAutoUpdate) {
          updates.insurancePurchase = 'Done';
          updates.insurancePayment = 'Payment Request';
        }
      }
    }

    // Logic to reset all next columns if Acknowledgement is selected
    if (field === 'acknowledgement') {
      updates.fomemaPayment = '';
      updates.fomemaStatus = '';
      updates.fomemaPaymentApproved = false;
      updates.fomemaPaymentApprovedBy = '';
      updates.fomemaPaymentApprovedAt = '';
      updates.fomemaPaymentRequestedBy = '';
      updates.fomemaPaymentRequestedAt = '';
      updates.fomemaReRequestReason = '';
      updates.fomemaRefundApproved = false;
      updates.fomemaRefundApprovedBy = '';
      updates.fomemaRefundApprovedAt = '';
      updates.fomemaRefundRequestedBy = '';
      updates.fomemaRefundRequestedAt = '';
      updates.fomemaRefundReason = '';
      
      updates.insurancePurchase = '';
      updates.insurancePayment = '';
      updates.insurancePaymentApproved = false;
      updates.insurancePaymentApprovedBy = '';
      updates.insurancePaymentApprovedAt = '';
      updates.insurancePaymentRequestedBy = '';
      updates.insurancePaymentRequestedAt = '';
      updates.insuranceRefundApproved = false;
      updates.insuranceRefundApprovedBy = '';
      updates.insuranceRefundApprovedAt = '';
      updates.insuranceRefundRequestedBy = '';
      updates.insuranceRefundRequestedAt = '';
      updates.insuranceRefundReason = '';
      
      updates.plksStatus = '';
      updates.plksPayment = '';
      updates.plksPaymentApproved = false;
      updates.plksPaymentApprovedBy = '';
      updates.plksPaymentApprovedAt = '';
      updates.plksPaymentRequestedBy = '';
      updates.plksPaymentRequestedAt = '';
      updates.plksRefundApproved = false;
      updates.plksRefundApprovedBy = '';
      updates.plksRefundApprovedAt = '';
      updates.plksRefundRequestedBy = '';
      updates.plksRefundRequestedAt = '';
      updates.plksRefundReason = '';
    }

    // Set request tracking if status is Payment Request
    if (value === 'Payment Request') {
      if (field === 'fomemaStatus' || field === 'fomemaPayment') {
        updates.fomemaPaymentRequestedBy = profile?.displayName || 'Unknown';
        updates.fomemaPaymentRequestedAt = new Date().toISOString();
      } else if (field === 'insurancePurchase' || field === 'insurancePayment') {
        updates.insurancePaymentRequestedBy = profile?.displayName || 'Unknown';
        updates.insurancePaymentRequestedAt = new Date().toISOString();
      } else if (field === 'plksStatus' || field === 'plksPayment') {
        updates.plksPaymentRequestedBy = profile?.displayName || 'Unknown';
        updates.plksPaymentRequestedAt = new Date().toISOString();
      }
    }

    // Reset approval flags if status is Refund
    if (value === 'Refund') {
      // Do nothing here, handleRefundSubmit handles the logic
    }

    // Handle Re-Request logic
    if (value === 'Payment Re-Request') {
      setSelectedWorkerForReRequest(worker);
      setReRequestReason(worker.fomemaReRequestReason || '');
      setIsReRequestModalOpen(true);
      return;
    }

    // Handle Refund logic - open modal instead of direct update
    if (value === 'Refund') {
      setRefundData({ worker, field });
      setRefundReason('');
      setIsRefundModalOpen(true);
      return;
    }

    // Auto-deactivate if Request COM is selected
    if (field === 'acknowledgement' && value === 'Request COM') {
      updates.status = 'Inactive';
    }

    // Special logic for PLKS Collected
    if (field === 'plksStatus' && value === 'Collected') {
      const expiryDate = parseDate(worker.permitExpiry);
      if (expiryDate) {
        try {
          const nextExpiry = addYears(expiryDate, 1);
          updates.permitExpiry = nextExpiry.toISOString().split('T')[0];
        } catch (e) {
          console.error('Date parsing error:', e);
        }
      }
      const currentYear = parseInt(worker.permitYear || '0');
      updates.permitYear = (currentYear + 1).toString();

      // Reset fields for the next renewal cycle
      updates.acknowledgement = '';
      updates.fomemaStatus = '-';
      updates.fomemaPayment = '-';
      updates.fomemaPaymentApproved = false;
      updates.fomemaPaymentApprovedBy = '';
      updates.fomemaPaymentApprovedAt = '';
      updates.fomemaPaymentRequestedBy = '';
      updates.fomemaPaymentRequestedAt = '';
      
      updates.insurancePurchase = '';
      updates.insurancePayment = '';
      updates.insurancePaymentApproved = false;
      updates.insurancePaymentApprovedBy = '';
      updates.insurancePaymentApprovedAt = '';
      updates.insurancePaymentRequestedBy = '';
      updates.insurancePaymentRequestedAt = '';
      
      updates.plksPayment = '-';
      updates.plksPaymentApproved = false;
      updates.plksPaymentApprovedBy = '';
      updates.plksPaymentApprovedAt = '';
      updates.plksPaymentRequestedBy = '';
      updates.plksPaymentRequestedAt = '';
      
      updates.comApply = '';
      updates.comStatus = '';
      updates.comRequestDate = '';
    }

    try {
      await updateDoc(doc(db, 'workers', worker.id), updates);
      toast.success('Updated successfully');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'workers');
      toast.error('Failed to update');
    }
  };

  const handleFomemaStatusChange = (worker: Worker, value: string) => {
    if (value === 'Payment Re-Request') {
      setSelectedWorkerForReRequest(worker);
      setReRequestReason(worker.fomemaReRequestReason || '');
      setIsReRequestModalOpen(true);
    } else {
      updateWorkerField(worker, 'fomemaStatus', value);
    }
  };

  const handleReRequestSubmit = async () => {
    if (!selectedWorkerForReRequest || !reRequestReason.trim()) {
      toast.error('Please enter a reason');
      return;
    }

    try {
      await updateDoc(doc(db, 'workers', selectedWorkerForReRequest.id), {
        fomemaStatus: 'Payment Re-Request',
        fomemaPayment: 'Payment Re-Request',
        fomemaReRequestReason: reRequestReason,
        fomemaPaymentRequestedBy: profile?.displayName || 'Unknown',
        fomemaPaymentRequestedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      toast.success('Re-Request submitted successfully');
      setIsReRequestModalOpen(false);
      setReRequestReason('');
      setSelectedWorkerForReRequest(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'workers');
      toast.error('Failed to submit re-request');
    }
  };

  const handleRefundSubmit = async () => {
    if (!refundData || !refundReason.trim()) {
      toast.error('Please provide a reason for refund');
      return;
    }

    const { worker, field } = refundData;
    const isSuperAdmin = profile?.role === 'super_admin';
    const updates: any = {
      [field]: 'Refund',
      updatedAt: new Date().toISOString()
    };

    if (field === 'fomemaStatus' || field === 'fomemaPayment') {
      updates.fomemaStatus = 'Refund';
      updates.fomemaPayment = 'Refund';
      updates.fomemaRefundReason = refundReason;
      updates.fomemaRefundRequestedBy = profile?.displayName || 'Unknown';
      updates.fomemaRefundRequestedAt = new Date().toISOString();
      if (isSuperAdmin) {
        updates.fomemaRefundApproved = true;
        updates.fomemaRefundApprovedBy = profile?.displayName;
        updates.fomemaRefundApprovedAt = new Date().toISOString();
        updates.fomemaPaymentApproved = false;
        updates.fomemaPaymentApprovedBy = '';
        updates.fomemaPaymentApprovedAt = '';
      } else {
        updates.fomemaRefundApproved = false;
      }
    } else if (field === 'insurancePurchase' || field === 'insurancePayment') {
      updates.insurancePurchase = 'Refund';
      updates.insurancePayment = 'Refund';
      updates.insuranceRefundReason = refundReason;
      updates.insuranceRefundRequestedBy = profile?.displayName || 'Unknown';
      updates.insuranceRefundRequestedAt = new Date().toISOString();
      if (isSuperAdmin) {
        updates.insuranceRefundApproved = true;
        updates.insuranceRefundApprovedBy = profile?.displayName;
        updates.insuranceRefundApprovedAt = new Date().toISOString();
        updates.insurancePaymentApproved = false;
        updates.insurancePaymentApprovedBy = '';
        updates.insurancePaymentApprovedAt = '';
      } else {
        updates.insuranceRefundApproved = false;
      }
    } else if (field === 'plksStatus' || field === 'plksPayment') {
      updates.plksStatus = 'Refund';
      updates.plksPayment = 'Refund';
      updates.plksRefundReason = refundReason;
      updates.plksRefundRequestedBy = profile?.displayName || 'Unknown';
      updates.plksRefundRequestedAt = new Date().toISOString();
      if (isSuperAdmin) {
        updates.plksRefundApproved = true;
        updates.plksRefundApprovedBy = profile?.displayName;
        updates.plksRefundApprovedAt = new Date().toISOString();
        updates.plksPaymentApproved = false;
        updates.plksPaymentApprovedBy = '';
        updates.plksPaymentApprovedAt = '';
      } else {
        updates.plksRefundApproved = false;
      }
    }

    try {
      await updateDoc(doc(db, 'workers', worker.id), updates);
      toast.success('Refund processed successfully');
      setIsRefundModalOpen(false);
      setRefundData(null);
      setRefundReason('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'workers');
      toast.error('Failed to process refund');
    }
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

  const handleApproveRefund = async (worker: Worker, field: 'fomema' | 'insurance' | 'plks') => {
    if (profile?.role !== 'super_admin') {
      toast.error('Only Super Admin can approve refunds');
      return;
    }

    const updates: any = {
      updatedAt: new Date().toISOString()
    };

    if (field === 'fomema') {
      updates.fomemaRefundApproved = true;
      updates.fomemaRefundApprovedBy = profile.displayName;
      updates.fomemaRefundApprovedAt = new Date().toISOString();
      updates.fomemaPaymentApproved = false;
      updates.fomemaPaymentApprovedBy = '';
      updates.fomemaPaymentApprovedAt = '';
    } else if (field === 'insurance') {
      updates.insuranceRefundApproved = true;
      updates.insuranceRefundApprovedBy = profile.displayName;
      updates.insuranceRefundApprovedAt = new Date().toISOString();
      updates.insurancePaymentApproved = false;
      updates.insurancePaymentApprovedBy = '';
      updates.insurancePaymentApprovedAt = '';
    } else if (field === 'plks') {
      updates.plksRefundApproved = true;
      updates.plksRefundApprovedBy = profile.displayName;
      updates.plksRefundApprovedAt = new Date().toISOString();
      updates.plksPaymentApproved = false;
      updates.plksPaymentApprovedBy = '';
      updates.plksPaymentApprovedAt = '';
    }

    try {
      await updateDoc(doc(db, 'workers', worker.id), updates);
      toast.success(`${field.toUpperCase()} refund approved and record unlocked`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'workers');
      toast.error('Failed to approve refund');
    }
  };
  const uniqueManagedBy = useMemo(() => {
    const managers = new Set(workers.map(w => w.managedBy).filter(Boolean));
    return Array.from(managers).sort();
  }, [workers]);

  const filteredWorkers = useMemo(() => {
    return workers.filter(w => {
      const matchesSearch = w.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          w.workerId.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesClient = !selectedClient || w.clientId === selectedClient;
      const matchesManagedBy = !selectedManagedBy || w.managedBy === selectedManagedBy;
      const matchesFomema = !selectedFomemaStatus || w.fomemaStatus === selectedFomemaStatus;
      const matchesPlks = !selectedPlksStatus || w.plksStatus === selectedPlksStatus;

      const baseMatch = matchesSearch && matchesClient && matchesManagedBy && matchesFomema && matchesPlks;

      const expiryDate = parseDate(w.permitExpiry);
      if (!expiryDate) return baseMatch && !selectedMonth;

      const matchesMonth = !selectedMonth || (expiryDate.getMonth() + 1).toString().padStart(2, '0') === selectedMonth;
      return baseMatch && matchesMonth;
    });
  }, [workers, searchTerm, selectedMonth, selectedClient, selectedManagedBy, selectedFomemaStatus, selectedPlksStatus]);

  const handleExportExcel = () => {
    try {
      const exportData = filteredWorkers.map((w, index) => ({
        'SL No.': index + 1,
        'Worker Name': w.fullName,
        'Old Passport Number': w.oldPassport || '-',
        'New Passport Number': w.newPassport || '-',
        'Passport Ex.': formatDate(w.passportExpiry),
        'Passport Remaining': calculateValidity(w.passportExpiry),
        'Permit Ex.': formatDate(w.permitExpiry),
        'Permit Year': w.permitYear || '-',
        'Permit Holder': permitHolders.find(h => h.id === w.permitHolder)?.name || w.permitHolder || '-',
        'Current Client': clients.find(c => c.id === w.clientId)?.name || '-',
        'Managed By': w.managedBy || '-',
        'Acknowledgement': w.acknowledgement || '-',
        'Fomema Status': w.fomemaStatus || '-',
        'PLKS Status': w.plksStatus || '-',
        'PLKS Payment': w.plksPayment || '-',
        'Purchase Insurance': w.insurancePurchase || '-',
        'Insurance Payment': w.insurancePayment || '-'
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      const monthLabel = MONTHS.find(m => m.value === selectedMonth)?.label || 'All';
      XLSX.utils.book_append_sheet(wb, ws, 'Permit Renewal List');
      XLSX.writeFile(wb, `Permit_Renewal_List_${monthLabel}.xlsx`);
      toast.success('Exported to Excel successfully');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export to Excel');
    }
  };

  const handleExportPDF = () => {
    try {
      const doc = new jsPDF('l', 'mm', 'a4');
      
      // Title
      doc.setFontSize(18);
      doc.text('Permit Renewal List', 14, 15);
      doc.setFontSize(10);
      doc.text(`Generated on: ${formatDateTime(new Date().toISOString())}`, 14, 22);
      if (selectedMonth) {
        const monthLabel = MONTHS.find(m => m.value === selectedMonth)?.label;
        doc.text(`Month: ${monthLabel}`, 14, 27);
      }

      const tableData = filteredWorkers.map((w, index) => [
        index + 1,
        w.fullName,
        w.oldPassport || '-',
        w.newPassport || '-',
        w.passportExpiry ? formatDate(w.passportExpiry, 'dd/MMM/yy') : '-',
        calculateValidity(w.passportExpiry),
        w.permitExpiry ? formatDate(w.permitExpiry, 'dd/MMM/yy') : '-',
        w.permitYear || '-',
        permitHolders.find(h => h.id === w.permitHolder)?.name || w.permitHolder || '-',
        clients.find(c => c.id === w.clientId)?.name || '-',
        w.managedBy || '-',
        w.acknowledgement || '-',
        w.fomemaStatus || '-',
        w.plksStatus || '-',
        w.plksPayment || '-',
        w.insurancePurchase || '-',
        w.insurancePayment || '-'
      ]);

      autoTable(doc, {
        startY: 35,
        head: [[
          'SL', 'Name', 'Old Pass', 'New Pass', 'Pass Ex.', 'Pass Rem.', 
          'Permit Ex.', 'Year', 'Holder', 'Client', 'Managed By', 'Ack.', 'Fomema Status', 'PLKS Status', 'PLKS Payment', 'Purchase Ins.', 'Ins. Payment'
        ]],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontSize: 8 },
        styles: { fontSize: 7, cellPadding: 2, cellWidth: 'wrap' },
        columnStyles: {
          0: { cellWidth: 8 },
          1: { cellWidth: 30 },
          2: { cellWidth: 15 },
          3: { cellWidth: 15 },
          4: { cellWidth: 15 },
          5: { cellWidth: 15 },
          6: { cellWidth: 15 },
          7: { cellWidth: 10 },
          8: { cellWidth: 20 },
          9: { cellWidth: 20 },
          10: { cellWidth: 15 },
          11: { cellWidth: 12 },
          12: { cellWidth: 15 },
          13: { cellWidth: 15 },
          14: { cellWidth: 15 },
          15: { cellWidth: 15 },
          16: { cellWidth: 15 }
        }
      });

      // Footer
      const finalY = (doc as any).lastAutoTable.finalY + 20;
      const pageWidth = doc.internal.pageSize.getWidth();
      const sectionWidth = pageWidth / 4;

      doc.setFontSize(9);
      
      // Prepared by
      doc.text('____________________', 14, finalY);
      doc.text('Prepared by', 14, finalY + 5);
      doc.text('(Admin department)', 14, finalY + 10);

      // Checked by
      doc.text('____________________', 14 + sectionWidth, finalY);
      doc.text('Checked by', 14 + sectionWidth, finalY + 5);
      doc.text('(Manager)', 14 + sectionWidth, finalY + 10);

      // Final verified by
      doc.text('____________________', 14 + sectionWidth * 2, finalY);
      doc.text('Final verified by', 14 + sectionWidth * 2, finalY + 5);
      doc.text('(Manager)', 14 + sectionWidth * 2, finalY + 10);

      // Approved By
      doc.text('____________________', 14 + sectionWidth * 3, finalY);
      doc.text('Approved By', 14 + sectionWidth * 3, finalY + 5);
      doc.text('(M. Director)', 14 + sectionWidth * 3, finalY + 10);

      const monthLabel = MONTHS.find(m => m.value === selectedMonth)?.label || 'All';
      doc.save(`Permit_Renewal_List_${monthLabel}.pdf`);
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
          <h1 className="text-2xl font-bold text-slate-900">Permit Renewal List</h1>
          <p className="text-slate-500 text-xs">Monitor and filter workers by permit expiry month</p>
        </div>
      </div>

      {/* Filters & Search */}
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
          <div className="relative flex-1 min-w-[150px]">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-xs appearance-none"
            >
              <option value="">All Months</option>
              {MONTHS.map(month => (
                <option key={month.value} value={month.value}>{month.label}</option>
              ))}
            </select>
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
          <div className="relative flex-1 min-w-[150px]">
            <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              value={selectedManagedBy}
              onChange={(e) => setSelectedManagedBy(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-xs appearance-none"
            >
              <option value="">All Managers</option>
              {uniqueManagedBy.map(manager => (
                <option key={manager as string} value={manager as string}>{manager as string}</option>
              ))}
            </select>
          </div>
          <div className="relative flex-1 min-w-[150px]">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              value={selectedFomemaStatus}
              onChange={(e) => setSelectedFomemaStatus(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-xs appearance-none"
            >
              <option value="">Fomema: All</option>
              <option value="Purchased">Purchased</option>
              <option value="Clinic Booked">Clinic Booked</option>
              <option value="Suitable">Suitable</option>
              <option value="Unsuitable">Unsuitable</option>
              <option value="Refund">Refund</option>
            </select>
          </div>
          <div className="relative flex-1 min-w-[150px]">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <select
              value={selectedPlksStatus}
              onChange={(e) => setSelectedPlksStatus(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-xs appearance-none"
            >
              <option value="">PLKS: All</option>
              <option value="Eligible">Eligible</option>
              <option value="Non Eligible">Non Eligible</option>
              <option value="Applied">Applied</option>
              <option value="Application Approved">Application Approved</option>
              <option value="Payment Done">Payment Done</option>
              <option value="Collected">Collected</option>
              <option value="Refund">Refund</option>
            </select>
          </div>
          <button 
            onClick={() => {
              setSelectedMonth('');
              setSelectedClient('');
              setSelectedManagedBy('');
              setSelectedFomemaStatus('');
              setSelectedPlksStatus('');
            }}
            className="px-4 py-2 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100"
          >
            Clear Filters
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

      {/* Worker Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-240px)]">
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
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center bg-rose-700">FOMEMA Payment</th>
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center">Fomema Status</th>
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider border border-indigo-500 text-center min-w-[120px]">PLKS Status</th>
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center bg-emerald-700">PLKS Payment</th>
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center">Purchase Insurance</th>
                <th className="px-4 py-3 text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap border border-indigo-500 text-center bg-indigo-700">Insurance Payment</th>
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
                  <td className={`px-4 py-3 text-[13px] whitespace-nowrap border border-slate-200 text-center ${getPassportHighlight(worker.passportExpiry) || 'text-slate-600'}`}>{formatDate(worker.passportExpiry)}</td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">{calculateValidity(worker.passportExpiry)}</td>
                  <td className={`px-4 py-3 text-[13px] whitespace-nowrap border border-slate-200 text-center ${getPermitHighlight(worker.permitExpiry) || 'text-slate-600'}`}>{formatDate(worker.permitExpiry)}</td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">{worker.permitYear || '-'}</td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">
                    {permitHolders.find(h => h.id === worker.permitHolder)?.name || worker.permitHolder || '-'}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">
                    {clients.find(c => c.id === worker.clientId)?.name || '-'}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">
                    {worker.managedBy || '-'}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">
                    {isWorkerInRenewalWindow(worker) ? (
                      <select
                        value={worker.acknowledgement || ''}
                        onChange={(e) => updateWorkerField(worker, 'acknowledgement', e.target.value)}
                        disabled={worker.fomemaPayment === 'Payment Done' || worker.fomemaPaymentApproved}
                        className={`bg-transparent border-none focus:ring-0 text-[13px] text-slate-600 cursor-pointer hover:bg-slate-50 rounded px-1 w-full text-center ${(worker.fomemaPayment === 'Payment Done' || worker.fomemaPaymentApproved) ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <option value="">Select</option>
                        <option value="Agree">Agree</option>
                        <option value="Request COM">Request COM</option>
                        <option value="OverStay">OverStay</option>
                      </select>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  
                  {/* FOMEMA Payment Column */}
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center bg-rose-50/30">
                    {worker.acknowledgement === 'Agree' && isWorkerInRenewalWindow(worker) ? (
                      <div className="flex flex-col items-center">
                        <select
                          value={worker.fomemaPayment || ''}
                          onChange={(e) => updateWorkerField(worker, 'fomemaPayment', e.target.value)}
                          disabled={
                            worker.fomemaPayment === 'Payment Done' ||
                            (profile?.role !== 'super_admin' && (
                              (worker.fomemaPaymentApproved && worker.fomemaPayment !== 'Refund') || 
                              (worker.fomemaPayment === 'Payment Request') ||
                              (worker.fomemaPayment === 'Payment Re-Request') ||
                              (worker.fomemaPayment === 'Refund' && !worker.fomemaRefundApproved)
                            ))
                          }
                          className={`bg-transparent border-none focus:ring-0 text-[13px] text-slate-600 cursor-pointer hover:bg-slate-50 rounded px-1 w-full text-center ${
                            worker.fomemaPayment === 'Payment Done' ||
                            (profile?.role !== 'super_admin' && (
                              (worker.fomemaPaymentApproved && worker.fomemaPayment !== 'Refund') || 
                              (worker.fomemaPayment === 'Payment Request') ||
                              (worker.fomemaPayment === 'Payment Re-Request') ||
                              (worker.fomemaPayment === 'Refund' && !worker.fomemaRefundApproved)
                            )) ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        >
                          <option value="">Select</option>
                          <option value="Payment Request" disabled={worker.fomemaRefundApproved || (!!worker.fomemaPayment && worker.fomemaPayment !== 'Payment Request')}>Payment Request</option>
                          <option value="Payment Re-Request" disabled={!worker.fomemaRefundApproved && worker.fomemaPayment !== 'Payment Re-Request'}>Payment Re-Request</option>
                          {(profile?.role === 'super_admin' || profile?.permissions?.canApprovePayments || worker.fomemaPaymentApproved) && (
                            <option value="Payment Done" disabled={!worker.fomemaPaymentApproved}>Payment Done</option>
                          )}
                          <option value="Refund" disabled={!worker.fomemaPaymentApproved}>Refund</option>
                        </select>
                        {worker.fomemaPaymentApproved && profile?.role === 'super_admin' && (
                          <div className="mt-1 flex flex-col items-center gap-1">
                            <button 
                              onClick={() => updateWorkerField(worker, 'fomemaPayment', 'Refund')}
                              className="text-[8px] bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded hover:bg-rose-200 font-bold"
                            >
                              REFUND TO UNLOCK
                            </button>
                          </div>
                        )}
                        {(worker.fomemaStatus === 'Refund' || worker.fomemaPayment === 'Refund') && !worker.fomemaRefundApproved && (
                          <div className="mt-1 flex flex-col items-center gap-1">
                            <div className="text-[9px] text-amber-600 font-bold uppercase">Refund Pending</div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">
                    {worker.acknowledgement === 'Agree' && isWorkerInRenewalWindow(worker) ? (
                      <div className="flex flex-col items-center">
                        <select
                          value={worker.fomemaStatus || ''}
                          onChange={(e) => handleFomemaStatusChange(worker, e.target.value)}
                          disabled={(worker.fomemaPayment !== 'Payment Done' && worker.fomemaStatus !== 'Refund') || worker.plksStatus === 'Application Approved' || !!worker.plksPayment}
                          className={`bg-transparent border-none focus:ring-0 text-[13px] text-slate-600 cursor-pointer hover:bg-slate-50 rounded px-1 w-full text-center ${(worker.fomemaPayment !== 'Payment Done' || worker.plksStatus === 'Application Approved' || !!worker.plksPayment) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <option value="">Select</option>
                          {worker.fomemaStatus === 'Payment Request' && (
                            <option value="Payment Request" disabled>Payment Request</option>
                          )}
                          {worker.fomemaStatus === 'Payment Re-Request' && (
                            <option value="Payment Re-Request" disabled>Payment Re-Request</option>
                          )}
                          {worker.fomemaStatus === 'Payment Done' && (
                            <option value="Payment Done" disabled>Payment Done</option>
                          )}
                          {worker.fomemaStatus === 'Purchased' && (
                            <option value="Purchased" disabled>Purchased</option>
                          )}
                          {worker.fomemaStatus === 'Refund' && (
                            <option value="Refund" disabled>Refund</option>
                          )}
                          {worker.fomemaStatus === 'Other' && (
                            <option value="Other" disabled>Other</option>
                          )}
                          <option value="Clinic Booked">Clinic Booked</option>
                          <option value="Pending examination">Pending examination</option>
                          <option value="Review">Review</option>
                          <option value="Pending for certification">Pending for certification</option>
                          <option value="Suitable">Suitable</option>
                          <option value="Unsuitable">Unsuitable</option>
                        </select>
                        {worker.fomemaStatus === 'Payment Re-Request' && worker.fomemaReRequestReason && (
                          <div className="mt-1 text-[10px] text-rose-500 italic max-w-[150px] truncate" title={worker.fomemaReRequestReason}>
                            Reason: {worker.fomemaReRequestReason}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400">{worker.fomemaStatus || '-'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-slate-600 border border-slate-200 text-center min-w-[120px]">
                    {worker.acknowledgement === 'Agree' && (worker.fomemaStatus === 'Suitable' || worker.plksStatus === 'Applied' || worker.plksPaymentApproved) && isWorkerInRenewalWindow(worker) ? (
                      <div className="flex flex-col items-center">
                        <select
                          value={worker.plksPaymentApproved && worker.plksStatus !== 'Collected' ? 'Payment Done' : (worker.plksStatus || '')}
                          onChange={(e) => updateWorkerField(worker, 'plksStatus', e.target.value)}
                          disabled={(!worker.plksPaymentApproved && !!worker.plksPayment) || (worker.plksStatus === 'Refund' && !worker.plksRefundApproved)}
                          className={`bg-transparent border-none focus:ring-0 text-[13px] text-slate-600 cursor-pointer hover:bg-slate-50 rounded px-1 w-full text-center ${ ((!worker.plksPaymentApproved && !!worker.plksPayment) || (worker.plksStatus === 'Refund' && !worker.plksRefundApproved)) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {worker.plksPaymentApproved ? (
                            <>
                              <option value="Payment Done" disabled={worker.plksStatus === 'Collected'}>Payment Done</option>
                              <option value="Collected">Collected</option>
                            </>
                          ) : (
                            <>
                              <option value="">Select</option>
                              <option value="Eligible">Eligible</option>
                              <option value="Non Eligible">Non Eligible</option>
                              <option value="Applied">Applied</option>
                              <option value="Application Approved">Application Approved</option>
                              {worker.plksStatus === 'Payment Request' && (
                                <option value="Payment Request" disabled>Payment Request</option>
                              )}
                              {worker.plksStatus === 'Payment Re-Request' && (
                                <option value="Payment Re-Request" disabled>Payment Re-Request</option>
                              )}
                              {worker.plksStatus === 'Pending payment' && (
                                <option value="Pending payment" disabled>Pending payment</option>
                              )}
                              {worker.plksStatus === 'Payment Done' && (
                                <option value="Payment Done" disabled>Payment Done</option>
                              )}
                              <option value="Collected">Collected</option>
                            </>
                          )}
                        </select>
                        {(worker.plksStatus === 'Refund' || worker.plksPayment === 'Refund') && !worker.plksRefundApproved && (
                          <div className="mt-1 flex flex-col items-center gap-1">
                            <div className="text-[9px] text-amber-600 font-bold uppercase">Refund Pending</div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400">{worker.plksStatus || '-'}</span>
                    )}
                  </td>

                  {/* PLKS Payment Column */}
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center bg-emerald-50/30">
                    {worker.acknowledgement === 'Agree' && (worker.fomemaStatus === 'Suitable' || worker.plksStatus === 'Applied' || worker.plksStatus === 'Payment Done' || worker.plksStatus === 'Collected' || worker.plksPaymentApproved) && (isWorkerInRenewalWindow(worker) || worker.plksStatus === 'Collected') ? (
                      <div className="flex flex-col items-center">
                        <select
                          value={worker.plksPaymentApproved ? 'Payment Done' : (worker.plksPayment || '')}
                          onChange={(e) => updateWorkerField(worker, 'plksPayment', e.target.value)}
                          disabled={!['Application Approved', 'Applied', 'Payment Request', 'Payment Re-Request', 'Pending payment', 'Payment Done', 'Refund', 'Collected'].includes(worker.plksStatus as string) || (worker.plksPayment === 'Refund' && !worker.plksRefundApproved) || worker.plksPaymentApproved}
                          className={`bg-transparent border-none focus:ring-0 text-[13px] text-slate-600 cursor-pointer hover:bg-slate-50 rounded px-1 w-full text-center ${!['Application Approved', 'Applied', 'Payment Request', 'Payment Re-Request', 'Pending payment', 'Payment Done', 'Refund', 'Collected'].includes(worker.plksStatus as string) || (worker.plksPayment === 'Refund' && !worker.plksRefundApproved) || worker.plksPaymentApproved ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <option value="">Select</option>
                          <option value="Payment Request" disabled={worker.plksPaymentApproved || (worker.plksRefundApproved && profile?.role !== 'super_admin')}>Payment Request</option>
                          <option value="Payment Re-Request" disabled={worker.plksPaymentApproved}>Payment Re-Request</option>
                          {(profile?.role === 'super_admin' || profile?.permissions?.canApprovePayments || worker.plksPaymentApproved) && (
                            <>
                              <option value="Payment Done">Payment Done</option>
                            </>
                          )}
                          <option value="Refund" disabled={worker.plksPaymentApproved && profile?.role !== 'super_admin'}>Refund</option>
                        </select>
                        {profile?.role === 'super_admin' && worker.plksPaymentApproved && (
                          <div className="mt-1 flex flex-col items-center gap-1">
                            <button 
                              onClick={() => updateWorkerField(worker, 'plksPayment', 'Refund')}
                              className="text-[8px] bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded hover:bg-rose-200 font-bold"
                            >
                              REFUND TO UNLOCK
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center">
                    {(worker.acknowledgement === 'Agree' && (worker.fomemaStatus === 'Suitable' || ['Applied', 'Application Approved', 'Payment Request', 'Pending payment', 'Payment Done', 'Collected'].includes(worker.plksStatus as string) || worker.plksPaymentApproved) && (isWorkerInRenewalWindow(worker) || worker.plksStatus === 'Collected')) ? (
                      <div className="flex flex-col items-center">
                        <select
                          value={worker.insurancePurchase || ''}
                          onChange={(e) => updateWorkerField(worker, 'insurancePurchase', e.target.value)}
                          disabled={(worker.insurancePaymentApproved && (worker.insurancePurchase as string) !== 'Refund') || (worker.fomemaStatus !== 'Suitable' && !['Applied', 'Application Approved', 'Payment Request', 'Pending payment', 'Payment Done', 'Collected'].includes(worker.plksStatus as string) && !worker.plksPaymentApproved) || (worker.insurancePurchase === 'Refund' && !worker.insuranceRefundApproved)}
                          className={`bg-transparent border-none focus:ring-0 text-[13px] text-slate-600 cursor-pointer hover:bg-slate-50 rounded px-1 w-full text-center ${worker.insurancePaymentApproved || (worker.insurancePurchase === 'Refund' && !worker.insuranceRefundApproved) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <option value="">Select</option>
                          <option value="Done">Done</option>
                          <option value="Refund">Refund</option>
                        </select>
                        {(worker.insurancePurchase === 'Refund' || worker.insurancePayment === 'Refund') && !worker.insuranceRefundApproved && (
                          <div className="mt-1 flex flex-col items-center gap-1">
                            <div className="text-[9px] text-amber-600 font-bold uppercase">Refund Pending</div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400">{worker.insurancePurchase || '-'}</span>
                    )}
                  </td>

                  {/* Insurance Payment Column */}
                  <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap border border-slate-200 text-center bg-indigo-50/30">
                    {(worker.acknowledgement === 'Agree' && (worker.fomemaStatus === 'Suitable' || ['Applied', 'Application Approved', 'Payment Request', 'Pending payment', 'Payment Done', 'Collected'].includes(worker.plksStatus as string) || worker.plksPaymentApproved) && worker.insurancePurchase === 'Done' && (isWorkerInRenewalWindow(worker) || worker.plksStatus === 'Collected')) ? (
                      <div className="flex flex-col items-center">
                        <select
                          value={worker.insurancePayment || ''}
                          onChange={(e) => updateWorkerField(worker, 'insurancePayment', e.target.value)}
                          disabled={(worker.insurancePaymentApproved && (worker.insurancePayment as string) !== 'Refund') || (worker.fomemaStatus !== 'Suitable' && !['Applied', 'Application Approved', 'Payment Request', 'Pending payment', 'Payment Done', 'Collected'].includes(worker.plksStatus as string) && !worker.plksPaymentApproved) || worker.insurancePurchase !== 'Done' || (worker.insurancePayment === 'Refund' && !worker.insuranceRefundApproved)}
                          className={`bg-transparent border-none focus:ring-0 text-[13px] text-slate-600 cursor-pointer hover:bg-slate-50 rounded px-1 w-full text-center ${worker.insurancePaymentApproved || (worker.insurancePayment === 'Refund' && !worker.insuranceRefundApproved) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <option value="">Select</option>
                          <option value="Payment Request" disabled={worker.insurancePaymentApproved || (worker.insuranceRefundApproved && profile?.role !== 'super_admin')}>Payment Request</option>
                          <option value="Payment Re-Request" disabled={worker.insurancePaymentApproved}>Payment Re-Request</option>
                          {(profile?.role === 'super_admin' || profile?.permissions?.canApprovePayments || worker.insurancePaymentApproved) && (
                            <option value="Payment Done">Payment Done</option>
                          )}
                          <option value="Refund" disabled={worker.insurancePaymentApproved && profile?.role !== 'super_admin'}>Refund</option>
                        </select>
                        {worker.insurancePaymentApproved && profile?.role === 'super_admin' && (
                          <div className="mt-1 flex flex-col items-center gap-1">
                            <button 
                              onClick={() => updateWorkerField(worker, 'insurancePayment', 'Refund')}
                              className="text-[8px] bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded hover:bg-rose-200 font-bold"
                            >
                              REFUND TO UNLOCK
                            </button>
                          </div>
                        )}
                        {((worker.insurancePayment as string) === 'Refund' || (worker.insurancePurchase as string) === 'Refund') && !worker.insuranceRefundApproved && (
                          <div className="mt-1 flex flex-col items-center gap-1">
                            <div className="text-[9px] text-amber-600 font-bold uppercase">Refund Pending</div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400">-</span>
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
        {filteredWorkers.length === 0 && !loading && (
          <div className="p-12 text-center">
            <Users className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500">No workers found matching your criteria.</p>
          </div>
        )}
      </div>

      {/* Re-Request Reason Modal */}
      {isReRequestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-lg font-bold text-slate-900">Payment Re-Request Reason</h3>
              <button 
                onClick={() => setIsReRequestModalOpen(false)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                Please provide a reason for the payment re-request for <strong>{selectedWorkerForReRequest?.fullName}</strong>.
              </p>
              <textarea
                value={reRequestReason}
                onChange={(e) => setReRequestReason(e.target.value)}
                placeholder="Enter reason here..."
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none min-h-[120px] text-sm"
              />
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setIsReRequestModalOpen(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReRequestSubmit}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 shadow-md transition-all"
                >
                  Submit Re-Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Refund Modal */}
      {isRefundModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-lg font-bold text-slate-900 flex items-center">
                <AlertCircle className="w-5 h-5 mr-2 text-rose-500" />
                Confirm Refund
              </h3>
              <button 
                onClick={() => setIsRefundModalOpen(false)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-3 bg-rose-50 rounded-lg border border-rose-100">
                <p className="text-xs text-rose-700 leading-relaxed">
                  You are about to process a refund for <strong>{refundData?.worker.fullName}</strong>'s <strong>{refundData?.field.replace('Status', '').replace('Purchase', '').toUpperCase()}</strong> payment. This action will mark the status as "Refund" and unlock the payment column.
                </p>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-2">
                  Reason for Refund
                </label>
                <textarea
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Enter the reason for refund..."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-500 outline-none min-h-[100px] resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setIsRefundModalOpen(false)}
                  className="flex-1 px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRefundSubmit}
                  className="flex-1 px-4 py-2 text-sm font-bold text-white bg-rose-600 rounded-xl hover:bg-rose-700 transition-colors shadow-sm"
                >
                  Confirm Refund
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                  This action is irreversible and will clear all progress for {resetModalWorker.fullName} in the Permit Renewal workflow.
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
