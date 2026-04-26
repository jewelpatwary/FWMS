import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Worker, Permit, UserProfile } from '../types';
import { FileText, Download, Filter, AlertTriangle, CheckCircle, Clock, CreditCard, ShieldCheck, Users } from 'lucide-react';
import { isAfter, addDays } from 'date-fns';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { formatDate, parseDate } from '../utils/dateUtils';

export default function Reports() {
  const { profile } = useOutletContext<{ profile: UserProfile | null }>();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [permits, setPermits] = useState<Permit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;

    const unsubWorkers = onSnapshot(collection(db, 'workers'), (snap) => {
      setWorkers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Worker)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'workers');
    });
    const unsubPermits = onSnapshot(collection(db, 'permits'), (snap) => {
      setPermits(snap.docs.map(d => ({ id: d.id, ...d.data() } as Permit)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'permits');
      setLoading(false);
    });
    return () => {
      unsubWorkers();
      unsubPermits();
    };
  }, [profile]);

  const expiringSoon = permits.filter(p => {
    const expiry = parseDate(p.expiryDate);
    if (!expiry) return false;
    const sixtyDaysFromNow = addDays(new Date(), 60);
    return isAfter(expiry, new Date()) && !isAfter(expiry, sixtyDaysFromNow);
  });

  const expired = permits.filter(p => {
    const expiry = parseDate(p.expiryDate);
    if (!expiry) return false;
    return !isAfter(expiry, new Date());
  });

  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const lastMonthEnd = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);
  const thisMonthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

  const workersLastMonth = workers.filter(w => new Date(w.createdAt) <= lastMonthEnd);
  const workersThisMonth = workers.filter(w => new Date(w.createdAt) <= thisMonthEnd);

  const holidayCount = workers.filter(w => w.status === 'Holiday').length;
  const comCount = workers.filter(w => w.acknowledgement === 'Request COM').length;
  const overstayCount = workers.filter(w => w.acknowledgement === 'OverStay').length;

  const exportToExcel = () => {
    const data = workers.map(w => ({
      'Worker ID': w.workerId,
      'Full Name': w.fullName,
      'Passport': w.newPassport || w.oldPassport,
      'Nationality': w.nationality,
      'SOCSO No': w.socsoNo || '-',
      'EPF No': w.epfNo || '-',
      'Permit Ex.': w.permitExpiry ? formatDate(w.permitExpiry) : '-',
      'eSP Expiry': w.espExpiry ? formatDate(w.espExpiry) : '-',
      'Status': w.status,
      'Acknowledgement': w.acknowledgement || '-',
      'Join Date': w.joinDate ? formatDate(w.joinDate) : '-'
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    
    // Add signature rows
    XLSX.utils.sheet_add_aoa(ws, [
      [],
      ['Prepared By:', '', 'Checked By:', '', 'Verified By:', '', 'Approved By:'],
      [profile?.signature?.useSignature ? profile.signature.text : '________________', '', '________________', '', '________________', '', '________________']
    ], { origin: -1 });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Workers');
    XLSX.writeFile(wb, 'Worker_Report.xlsx');
  };

  const exportToPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4') as any;
    doc.text('Foreign Worker Management System - Worker Report', 14, 15);
    const tableData = workers.map(w => [
      w.workerId, 
      w.fullName, 
      w.newPassport || w.oldPassport, 
      w.nationality, 
      w.socsoNo || '-',
      w.epfNo || '-',
      w.permitExpiry ? formatDate(w.permitExpiry, 'dd/MMM/yy') : '-', 
      w.espExpiry ? formatDate(w.espExpiry, 'dd/MMM/yy') : '-', 
      w.status,
      w.acknowledgement || '-'
    ]);
    doc.autoTable({
      head: [['ID', 'Name', 'Passport', 'Nationality', 'SOCSO', 'EPF', 'Permit Ex.', 'eSP Ex.', 'Status', 'Ack.']],
      body: tableData,
      startY: 20,
      styles: { fontSize: 7, cellWidth: 'wrap' },
      didDrawPage: (data: any) => {
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
    doc.save('Worker_Report.pdf');
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reports & Analytics</h1>
          <p className="text-slate-500 text-sm">Generate and export system data reports</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={exportToExcel}
            className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-all flex items-center"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Excel
          </button>
          <button 
            onClick={exportToPDF}
            className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-all flex items-center"
          >
            <FileText className="w-4 h-4 mr-2" />
            Export PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <ReportSummaryCard 
          title="Last Month Workers" 
          count={workersLastMonth.length} 
          icon={Users} 
          color="text-slate-600" 
          bg="bg-slate-50"
          description={`Total workers as of ${formatDate(lastMonthEnd)}`}
        />
        <ReportSummaryCard 
          title="This Month Workers" 
          count={workersThisMonth.length} 
          icon={Users} 
          color="text-indigo-600" 
          bg="bg-indigo-50"
          description={`Total workers as of ${formatDate(thisMonthEnd)}`}
        />
        <ReportSummaryCard 
          title="Holiday / COM / Overstay" 
          count={holidayCount + comCount + overstayCount} 
          icon={AlertTriangle} 
          color="text-amber-600" 
          bg="bg-amber-50"
          description={`H: ${holidayCount} | C: ${comCount} | O: ${overstayCount}`}
        />
        <ReportSummaryCard 
          title="Active Workers" 
          count={workers.filter(w => w.status === 'Active').length} 
          icon={CheckCircle} 
          color="text-emerald-600" 
          bg="bg-emerald-50"
          description="Currently employed"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
        <ReportSummaryCard 
          title="Expiring Permits" 
          count={expiringSoon.length} 
          icon={Clock} 
          color="text-amber-600" 
          bg="bg-amber-50"
          description="Expiring within 60 days"
        />
        <ReportSummaryCard 
          title="Expired Permits" 
          count={expired.length} 
          icon={AlertTriangle} 
          color="text-red-600" 
          bg="bg-red-50"
          description="Requires immediate action"
        />
        <ReportSummaryCard 
          title="SOCSO Registered" 
          count={workers.filter(w => w.socsoNo && w.socsoNo.trim() !== '').length} 
          icon={ShieldCheck} 
          color="text-blue-600" 
          bg="bg-blue-50"
          description="Workers with SOCSO No."
        />
        <ReportSummaryCard 
          title="EPF Registered" 
          count={workers.filter(w => w.epfNo && w.epfNo.trim() !== '').length} 
          icon={CreditCard} 
          color="text-indigo-600" 
          bg="bg-indigo-50"
          description="Workers with EPF No."
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex items-center justify-between">
            <h3 className="font-bold text-slate-900">Expiring Permits List</h3>
            <button className="text-indigo-600 text-sm font-medium hover:underline">View All</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">Worker</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">Permit No</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">Expiry Date</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">Days Left</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {expiringSoon.map(permit => {
                  const worker = workers.find(w => w.id === permit.workerId);
                  const expiry = parseDate(permit.expiryDate);
                  const daysLeft = expiry ? differenceInDays(expiry, new Date()) : 0;
                  return (
                    <tr key={permit.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium text-slate-900 whitespace-nowrap">{worker?.fullName || 'Unknown'}</td>
                      <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">{permit.permitNumber}</td>
                      <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">{formatDate(permit.expiryDate)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                          daysLeft < 30 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'
                        }`}>
                          {daysLeft} days
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {expiringSoon.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400 text-sm">
                      No permits expiring soon.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex items-center justify-between">
            <h3 className="font-bold text-slate-900">SOCSO & EPF Summary</h3>
            <button className="text-indigo-600 text-sm font-medium hover:underline">View All</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">Worker</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">SOCSO No</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">EPF No</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">Special Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {workers.slice(0, 10).map(worker => (
                  <tr key={worker.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900 whitespace-nowrap">{worker.fullName}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">{worker.socsoNo || '-'}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">{worker.epfNo || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex gap-1 flex-wrap">
                        {worker.status === 'Holiday' && (
                          <span className="px-2 py-1 rounded-md text-[10px] font-bold bg-amber-50 text-amber-600">
                            HOLIDAY
                          </span>
                        )}
                        {worker.acknowledgement === 'Request COM' && (
                          <span className="px-2 py-1 rounded-md text-[10px] font-bold bg-red-50 text-red-600">
                            COM
                          </span>
                        )}
                        {worker.acknowledgement === 'OverStay' && (
                          <span className="px-2 py-1 rounded-md text-[10px] font-bold bg-purple-50 text-purple-600">
                            OVERSTAY
                          </span>
                        )}
                        {(!worker.status || worker.status === 'Active') && !worker.acknowledgement && (
                          <span className="px-2 py-1 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-600">
                            NORMAL
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {workers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400 text-sm">
                      No workers found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function differenceInDays(date1: Date, date2: Date) {
  return Math.ceil((date1.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24));
}

function ReportSummaryCard({ title, count, icon: Icon, color, bg, description }: any) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
      <div className="flex items-center gap-4 mb-4">
        <div className={`${bg} ${color} p-3 rounded-xl`}>
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <h2 className={`text-2xl font-bold ${color}`}>{count}</h2>
        </div>
      </div>
      <p className="text-xs text-slate-400">{description}</p>
    </div>
  );
}
