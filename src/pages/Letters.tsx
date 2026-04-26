import { useState, useEffect, useMemo, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { 
  collection, 
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Worker, Client, UserProfile, LetterTemplate, Position } from '../types';
import { 
  Search, 
  Printer, 
  FileText, 
  CheckCircle, 
  X,
  Plus,
  Trash2,
  Settings,
  Image as ImageIcon,
  Save,
  AlertCircle,
  Upload,
  Move
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'react-hot-toast';

export default function Letters() {
  const { profile } = useOutletContext<{ profile: UserProfile | null }>();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [templates, setTemplates] = useState<LetterTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<string[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editedLetters, setEditedLetters] = useState<Record<string, string>>({});
  
  // Template Management State
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState<Partial<LetterTemplate> | null>(null);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  const defaultTemplates = [
    {
      name: 'Worker Permit Renewal Confirmation',
      content: `Date: {{currentDate}}\n\nTo: {{workerName}} ({{workerId}})\nPassport No: {{passportNo}}\nNationality: {{nationality}}\nClient: {{clientName}}\n\nSubject: Confirmation for Work Permit Renewal\n\nI, {{workerName}}, hereby confirm my decision regarding my work permit renewal:\n\n[ ] I AGREE to renew my work permit for another year.\n[ ] I DO NOT wish to renew and request for Check Out Memo (COM).\n    Proposed Departure Date: ____________________\n\nI understand that my decision is final and any changes may incur additional costs.\n\nWorker Signature: ____________________\nDate: ____________________`
    },
    {
      name: 'Passport Handover Acknowledgement',
      content: `Date: {{currentDate}}\n\nTo Whom It May Concern,\n\nACKNOWLEDGEMENT OF PASSPORT RECEIPT\n\nThis is to acknowledge that I, {{workerName}} ({{workerId}}), Passport No: {{passportNo}}, have received my original passport from the Management on {{currentDate}}.\n\nI have verified that the passport is in my possession and is in good condition. I take full responsibility for its safekeeping from this date onwards.\n\nWorker Signature: ____________________\nDate: ____________________`
    },
    {
      name: 'COM Confirmation Letter',
      content: `Date: {{currentDate}}\n\nTo: The Management\n\nSubject: Confirmation of Request for Check Out Memo (COM)\n\nI, {{workerName}} ({{workerId}}), Passport No: {{passportNo}}, hereby confirm that I wish to terminate my employment and return to my home country. \n\nI request the company to process my Check Out Memo (COM) for departure on or around {{currentDate}}. I understand that once the COM is issued, my work permit will be cancelled and I must leave the country as per the scheduled flight.\n\nI confirm that I have received all my outstanding wages and benefits up to the date of this letter.\n\nWorker Signature: ____________________\nDate: ____________________`
    },
    {
      name: 'Bank Account Opening Request',
      content: `Date: {{currentDate}}\n\nTo: The Branch Manager\nBank Name: ____________________\n\nSubject: Letter of Employment for Bank Account Opening\n\nDear Sir/Madam,\n\nThis is to confirm that {{workerName}} ({{workerId}}), Passport No: {{passportNo}}, is an employee of our company/client, {{clientName}}.\n\nHe/She has been employed as a general worker since {{currentDate}}. We have no objection to {{workerName}} opening a savings account with your bank for salary payment purposes.\n\nShould you require any further information, please do not hesitate to contact us.\n\nYours faithfully,\n\nFor and on behalf of,\n{{clientName}}`
    },
    {
      name: 'Salary Deduction Allocation Confirmation',
      content: `Date: {{currentDate}}\n\nTo: The Human Resources Department\n\nSubject: Authorization for Monthly Salary Deduction\n\nI, {{workerName}} ({{workerId}}), Passport No: {{passportNo}}, currently employed at {{clientName}}, hereby voluntarily authorize the company to deduct the following amount(s) from my monthly salary:\n\nDeduction Type: ____________________\nTotal Amount: RM__________\nMonthly Installment: RM__________\nStarting Period: {{currentDate}}\n\nReason for Deduction: [Levy / Advance / Accommodation / Others: ________]\n\nI understand and agree to these deductions until the total amount is fully settled.\n\nWorker Signature: ____________________\nDate: ____________________`
    },
    {
      name: 'Worker Confirmation Letter',
      content: `Date: {{currentDate}}\n\nTo Whom It May Concern,\n\nSubject: LETTER OF EMPLOYMENT CONFIRMATION\n\nThis is to certify that {{workerName}} ({{workerId}}), a {{nationality}} national with Passport No: {{passportNo}}, is currently employed by our company/client, {{clientName}}.\n\nDetails of employment are as follows:\nPosition: General Worker\nPermit Year: {{permitYear}}\nStatus: Active\n\nThis letter is issued upon the request of the worker for ____________________ purposes and does not constitute a guarantee of financial standing.\n\nFor and on behalf of,\n[Company Name]`
    }
  ];

  const allTemplates = useMemo(() => {
    const dbNames = new Set(templates.map(t => t.name));
    const combined = [...templates];
    
    defaultTemplates.forEach((t, i) => {
      if (!dbNames.has(t.name)) {
        combined.push({
          id: `default-${i}`,
          ...t,
          letterheadUrl: '',
          chopUrl: '',
          chopPosition: { x: 0, y: 0 },
          signatureUrl: '',
          signaturePosition: { x: 0, y: 0 },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        } as LetterTemplate);
      }
    });
    
    return combined;
  }, [templates]);

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

    const unsubTemplates = onSnapshot(collection(db, 'letter_templates'), (snap) => {
      const fetchedTemplates = snap.docs.map(d => ({ id: d.id, ...d.data() } as LetterTemplate));
      setTemplates(fetchedTemplates);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'letter_templates');
    });

    return () => {
      unsubWorkers();
      unsubClients();
      unsubTemplates();
    };
  }, [profile]);

  useEffect(() => {
    if (allTemplates.length > 0 && !selectedTemplateId) {
      setSelectedTemplateId(allTemplates[0].id);
    }
  }, [allTemplates, selectedTemplateId]);

  const generateLetter = (worker: Worker) => {
    const template = allTemplates.find(t => t.id === selectedTemplateId);
    if (!template) return '';

    const client = clients.find(c => c.id === worker.clientId);
    const currentDate = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

    let content = template.content;
    content = content.replace(/{{currentDate}}/g, currentDate);
    content = content.replace(/{{workerName}}/g, worker.fullName);
    content = content.replace(/{{workerId}}/g, worker.workerId);
    content = content.replace(/{{passportNo}}/g, worker.newPassport || worker.oldPassport || '-');
    content = content.replace(/{{nationality}}/g, worker.nationality);
    content = content.replace(/{{clientName}}/g, client?.name || 'N/A');
    content = content.replace(/{{permitYear}}/g, worker.permitYear || '-');

    return content;
  };

  useEffect(() => {
    const newEditedLetters: Record<string, string> = {};
    selectedWorkerIds.forEach(id => {
      const worker = workers.find(w => w.id === id);
      if (worker) {
        newEditedLetters[id] = generateLetter(worker);
      }
    });
    setEditedLetters(newEditedLetters);
  }, [selectedWorkerIds, selectedTemplateId, workers, clients]);

  const handleEditLetter = (id: string, newContent: string) => {
    setEditedLetters(prev => ({ ...prev, [id]: newContent }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'letterhead' | 'chop' | 'signature') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 500 * 1024) { // 500KB limit for base64 storage
      toast.error('Image is too large. Please use an image smaller than 500KB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (currentTemplate) {
        setCurrentTemplate(prev => {
          if (!prev) return prev;
          const updates: Partial<LetterTemplate> = {};
          if (type === 'letterhead') updates.letterheadUrl = base64;
          if (type === 'chop') updates.chopUrl = base64;
          if (type === 'signature') updates.signatureUrl = base64;
          return { ...prev, ...updates };
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveTemplate = async () => {
    if (!currentTemplate?.name || !currentTemplate?.content) {
      toast.error('Please fill in name and content');
      return;
    }

    setIsSavingTemplate(true);
    try {
      const data = {
        name: currentTemplate.name,
        content: currentTemplate.content,
        letterheadUrl: currentTemplate.letterheadUrl || '',
        chopUrl: currentTemplate.chopUrl || '',
        chopPosition: currentTemplate.chopPosition || { x: 0, y: 0 },
        signatureUrl: currentTemplate.signatureUrl || '',
        signaturePosition: currentTemplate.signaturePosition || { x: 0, y: 0 },
        updatedAt: new Date().toISOString()
      };

      if (currentTemplate.id) {
        await updateDoc(doc(db, 'letter_templates', currentTemplate.id), data);
        toast.success('Template updated');
      } else {
        await addDoc(collection(db, 'letter_templates'), {
          ...data,
          createdAt: new Date().toISOString()
        });
        toast.success('Template added');
      }
      setShowTemplateManager(false);
      setCurrentTemplate(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, currentTemplate?.id ? `letter_templates/${currentTemplate.id}` : 'letter_templates');
      toast.error('Failed to save template');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteTemplate = async (templateId: string) => {
    if (!templateId) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'letter_templates', templateId));
      toast.success('Template deleted successfully');
      setConfirmDeleteId(null);
      if (selectedTemplateId === templateId) {
        setSelectedTemplateId(templates.find(t => t.id !== templateId)?.id || '');
      }
      if (currentTemplate?.id === templateId) {
        setCurrentTemplate(null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `letter_templates/${templateId}`);
      toast.error('Failed to delete template');
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    if (loading === false && templates.length === 0 && !isSavingTemplate) {
      handleSeedDefaults();
    }
  }, [loading, templates]);

  const handleSeedDefaults = async (force = false) => {
    if (isSavingTemplate) return;
    if (!force && templates.length > 0) return;
    if (force && !window.confirm('Import standard templates? This will add any missing default templates.')) return;
    
    setIsSavingTemplate(true);
    try {
      const existingNames = new Set(templates.map(t => t.name));
      let addedCount = 0;

      for (const t of defaultTemplates) {
        if (existingNames.has(t.name)) continue;
        
        await addDoc(collection(db, 'letter_templates'), {
          ...t,
          letterheadUrl: '',
          chopUrl: '',
          chopPosition: { x: 0, y: 0 },
          signatureUrl: '',
          signaturePosition: { x: 0, y: 0 },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        existingNames.add(t.name);
        addedCount++;
      }
      
      if (addedCount > 0) {
        toast.success(`${addedCount} standard templates imported`);
      } else if (force) {
        toast.error('All standard templates already exist');
      }
    } catch (error) {
      console.error('Error seeding templates:', error);
      toast.error('Failed to import templates');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const filteredWorkers = useMemo(() => {
    return workers.filter(w => 
      w.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.workerId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (w.newPassport || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (w.oldPassport || '').toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 10);
  }, [workers, searchQuery]);

  const toggleWorker = (id: string) => {
    setSelectedWorkerIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const selectedTemplate = allTemplates.find(t => t.id === selectedTemplateId);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-20 print:p-0 print:m-0 print:max-w-none">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Letter Generation</h1>
          <p className="text-slate-500 text-sm">Generate and print worker acknowledgement letters</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTemplateManager(true)}
            className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-all flex items-center shadow-sm"
          >
            <Settings className="w-4 h-4 mr-2" />
            Manage Templates
          </button>
          <button
            onClick={handlePrint}
            disabled={selectedWorkerIds.length === 0}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-all flex items-center disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <Printer className="w-4 h-4 mr-2" />
            Print Letters
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print:hidden">
        {/* Left Column: Selection */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">1. Select Template</h2>
            <div className="space-y-2">
              {allTemplates.map(t => (
                <div key={t.id} className="group relative">
                  <button
                    onClick={() => setSelectedTemplateId(t.id)}
                    className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all border ${
                      selectedTemplateId === t.id 
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-medium' 
                        : 'bg-white border-slate-100 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between pr-8">
                      <span>{t.name}</span>
                      {t.id.startsWith('default-') && (
                        <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase font-bold">Default</span>
                      )}
                    </div>
                  </button>
                  {!t.id.startsWith('default-') && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(t.id);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-all"
                      title="Delete Template"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">2. Select Workers</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by ID, Name, Passport..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
              {filteredWorkers.map(w => (
                <button
                  key={w.id}
                  onClick={() => toggleWorker(w.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all border ${
                    selectedWorkerIds.includes(w.id)
                      ? 'bg-indigo-50 border-indigo-100 text-indigo-700'
                      : 'bg-white border-transparent text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-left">
                    <p className="font-semibold">{w.fullName}</p>
                    <p className="text-[10px] opacity-70">{w.workerId} • {w.newPassport || w.oldPassport}</p>
                  </div>
                  {selectedWorkerIds.includes(w.id) && <CheckCircle className="w-4 h-4 text-indigo-600" />}
                </button>
              ))}
              {searchQuery && filteredWorkers.length === 0 && (
                <p className="text-center py-4 text-xs text-slate-400">No workers found</p>
              )}
            </div>

            {selectedWorkerIds.length > 0 && (
              <div className="pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-500">{selectedWorkerIds.length} Selected</span>
                  <button 
                    onClick={() => setSelectedWorkerIds([])}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Clear All
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedWorkerIds.map(id => {
                    const worker = workers.find(w => w.id === id);
                    return (
                      <span key={id} className="inline-flex items-center px-2 py-1 rounded-md bg-indigo-100 text-indigo-700 text-[10px] font-medium">
                        {worker?.workerId}
                        <button onClick={() => toggleWorker(id)} className="ml-1 hover:text-indigo-900">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Preview & Edit */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h2 className="text-sm font-semibold text-slate-900">Letter Preview</h2>
              <div className="flex gap-2 text-xs font-medium text-slate-400">
                {selectedTemplate?.letterheadUrl && <span>+ Letterhead</span>}
                {selectedTemplate?.chopUrl && <span>+ Chop</span>}
                {selectedTemplate?.signatureUrl && <span>+ Sign</span>}
              </div>
            </div>
            
            <div className="p-8 min-h-[600px] bg-white overflow-y-auto max-h-[800px] custom-scrollbar">
              {selectedWorkerIds.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-4 py-20">
                  <FileText className="w-12 h-12 opacity-20" />
                  <p className="text-sm">Select a template and at least one worker to preview</p>
                </div>
              ) : (
                <div className="space-y-20">
                  {selectedWorkerIds.map((id, index) => {
                    const worker = workers.find(w => w.id === id);
                    if (!worker) return null;
                    return (
                      <div key={id} className="bg-white border border-slate-100 shadow-inner p-12 max-w-[21cm] mx-auto min-h-[29.7cm] flex flex-col">
                        {index > 0 && <div className="print:page-break-before hidden" />}
                        
                        {/* Header Image */}
                        {selectedTemplate?.letterheadUrl && (
                          <div className="mb-8 flex justify-center">
                            <img src={selectedTemplate.letterheadUrl} alt="Letterhead" className="max-h-32 w-full object-contain" />
                          </div>
                        )}

                        <div className="letter-wrapper flex-1">
                          {isEditing ? (
                            <textarea
                              value={editedLetters[id] || ''}
                              onChange={(e) => handleEditLetter(id, e.target.value)}
                              className="w-full h-full min-h-[600px] p-0 font-serif text-sm border-none focus:ring-0 outline-none leading-relaxed resize-none"
                            />
                          ) : (
                            <div className="whitespace-pre-wrap font-serif text-slate-800 leading-relaxed text-sm">
                              {editedLetters[id] || ''}
                            </div>
                          )}
                        </div>

                        {/* Footer Images */}
                        <div className="mt-12 relative min-h-[5cm] border-t border-dashed border-slate-100 pt-4">
                          <p className="absolute top-0 right-0 text-[10px] text-slate-300 font-medium flex items-center gap-1">
                            <Move className="w-3 h-3" /> Draggable elements
                          </p>
                          {selectedTemplate?.chopUrl && (
                            <motion.img 
                              drag
                              dragMomentum={false}
                              onDragEnd={async (_, info) => {
                                if (selectedTemplate.id && !selectedTemplate.id.startsWith('default-')) {
                                  const newPos = { 
                                    x: (selectedTemplate.chopPosition?.x || 0) + info.offset.x, 
                                    y: (selectedTemplate.chopPosition?.y || 0) + info.offset.y 
                                  };
                                  try {
                                    await updateDoc(doc(db, 'letter_templates', selectedTemplate.id), {
                                      chopPosition: newPos
                                    });
                                  } catch (e) { console.error('Failed to save pos', e); }
                                }
                              }}
                              style={{ 
                                x: selectedTemplate.chopPosition?.x || 0,
                                y: selectedTemplate.chopPosition?.y || 0
                              }}
                              src={selectedTemplate.chopUrl} 
                              alt="Chop" 
                              className={`absolute bottom-0 left-[2cm] w-[3cm] opacity-80 cursor-move active:scale-110 transition-transform ${selectedTemplate.id.startsWith('default-') ? 'pointer-events-none' : ''}`} 
                            />
                          )}
                          {selectedTemplate?.signatureUrl && (
                            <motion.img 
                              drag
                              dragMomentum={false}
                              onDragEnd={async (_, info) => {
                                if (selectedTemplate.id && !selectedTemplate.id.startsWith('default-')) {
                                  const newPos = { 
                                    x: (selectedTemplate.signaturePosition?.x || 0) + info.offset.x, 
                                    y: (selectedTemplate.signaturePosition?.y || 0) + info.offset.y 
                                  };
                                  try {
                                    await updateDoc(doc(db, 'letter_templates', selectedTemplate.id), {
                                      signaturePosition: newPos
                                    });
                                  } catch (e) { console.error('Failed to save pos', e); }
                                }
                              }}
                              style={{ 
                                x: selectedTemplate.signaturePosition?.x || 0,
                                y: selectedTemplate.signaturePosition?.y || 0
                              }}
                              src={selectedTemplate.signatureUrl} 
                              alt="Signature" 
                              className={`absolute bottom-[1cm] left-[1cm] w-[4cm] cursor-move active:scale-110 transition-transform ${selectedTemplate.id.startsWith('default-') ? 'pointer-events-none' : ''}`} 
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Template Management Modal */}
      <AnimatePresence>
        {showTemplateManager && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => {
                if (!isSavingTemplate) {
                  setShowTemplateManager(false);
                  setCurrentTemplate(null);
                }
              }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Manage Letter Templates</h2>
                  <p className="text-slate-500 text-sm">Create and edit templates with letterheads, chops, and signatures</p>
                </div>
                <button
                  onClick={() => setShowTemplateManager(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 flex flex-col md:flex-row gap-6">
                {/* List of Templates */}
                <div className="w-full md:w-64 space-y-2 md:border-r border-slate-100 md:pr-6">
                  <button
                    onClick={() => setCurrentTemplate({ name: '', content: '', letterheadUrl: '', chopUrl: '', signatureUrl: '' })}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-all mb-4"
                  >
                    <Plus className="w-4 h-4" />
                    New Template
                  </button>
                  <div className="space-y-1">
                    {templates.length === 0 ? (
                      <div className="text-center py-6">
                        <p className="text-xs text-slate-400 mb-3">No templates yet</p>
                        <button
                          onClick={() => handleSeedDefaults(true)}
                          className="text-xs text-indigo-600 hover:underline font-medium"
                        >
                          Import standard templates
                        </button>
                      </div>
                    ) : (
                      <>
                        {templates.map(t => (
                          <div key={t.id} className="group relative">
                            <button
                              onClick={() => setCurrentTemplate(t)}
                              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                                currentTemplate?.id === t.id 
                                  ? 'bg-indigo-50 text-indigo-700 font-medium' 
                                  : 'hover:bg-slate-50 text-slate-600'
                              }`}
                            >
                              {t.name}
                            </button>
                            <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDeleteId(t.id);
                                }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-all"
                                title="Delete Template"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                          </div>
                        ))}
                        <div className="pt-4 mt-4 border-t border-slate-100 px-2 text-center">
                          <button
                            onClick={() => handleSeedDefaults(true)}
                            className="text-[10px] text-slate-400 hover:text-indigo-600 transition-colors flex items-center gap-1 mx-auto"
                          >
                            <Plus className="w-3 h-3" /> Import defaults
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Editor */}
                <div className="flex-1 space-y-6">
                  {currentTemplate ? (
                    <>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Template Name</label>
                          <input
                            type="text"
                            value={currentTemplate.name}
                            onChange={e => setCurrentTemplate({ ...currentTemplate, name: e.target.value })}
                            placeholder="e.g. Workers Acknowledgement"
                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                          />
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                              <ImageIcon className="w-3 h-3" /> Letterhead
                            </label>
                            <div className="flex gap-1">
                              <input
                                type="text"
                                value={currentTemplate.letterheadUrl}
                                onChange={e => setCurrentTemplate({ ...currentTemplate, letterheadUrl: e.target.value })}
                                placeholder="URL or Upload"
                                className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                              />
                              <label className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-indigo-600 hover:border-indigo-200 cursor-pointer transition-all">
                                <Upload className="w-3.5 h-3.5" />
                                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'letterhead')} />
                              </label>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                              <ImageIcon className="w-3 h-3" /> Chop
                            </label>
                            <div className="flex gap-1">
                              <input
                                type="text"
                                value={currentTemplate.chopUrl}
                                onChange={e => setCurrentTemplate({ ...currentTemplate, chopUrl: e.target.value })}
                                placeholder="URL or Upload"
                                className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                              />
                              <label className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-indigo-600 hover:border-indigo-200 cursor-pointer transition-all">
                                <Upload className="w-3.5 h-3.5" />
                                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'chop')} />
                              </label>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                              <ImageIcon className="w-3 h-3" /> Signature
                            </label>
                            <div className="flex gap-1">
                              <input
                                type="text"
                                value={currentTemplate.signatureUrl}
                                onChange={e => setCurrentTemplate({ ...currentTemplate, signatureUrl: e.target.value })}
                                placeholder="URL or Upload"
                                className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                              />
                              <label className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-indigo-600 hover:border-indigo-200 cursor-pointer transition-all">
                                <Upload className="w-3.5 h-3.5" />
                                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'signature')} />
                              </label>
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 flex items-center justify-between">
                            Content
                            <span className="text-slate-300 normal-case font-normal text-[9px]">Available placeholders: currentDate, workerName, workerId, passportNo, nationality, clientName, permitYear</span>
                          </label>
                          <textarea
                            value={currentTemplate.content}
                            onChange={e => setCurrentTemplate({ ...currentTemplate, content: e.target.value })}
                            className="w-full min-h-[300px] p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-serif focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none"
                            placeholder="Enter letter content here..."
                          />
                        </div>

                        <div className="flex bg-amber-50 p-3 rounded-lg border border-amber-100 gap-3">
                          <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                          <p className="text-[10px] text-amber-700 leading-tight">
                            Use double curly braces for placeholders, e.g., <code className="bg-white/50 px-1">{"{{workerName}}"}</code>.
                          </p>
                        </div>
                      </div>

                      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                        <button
                          onClick={() => setCurrentTemplate(null)}
                          className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-50 rounded-xl transition-all"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveTemplate}
                          disabled={isSavingTemplate}
                          className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all flex items-center gap-2 disabled:opacity-50"
                        >
                          {isSavingTemplate ? (
                            <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                          ) : (
                            <Save className="w-4 h-4" />
                          )}
                          Save Template
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4 py-20">
                      <FileText className="w-16 h-16 opacity-10" />
                      <p className="text-sm">Select a template to edit or create a new one</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {confirmDeleteId && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => !isDeleting && setConfirmDeleteId(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 text-center"
            >
              <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Delete Template?</h3>
              <p className="text-slate-500 text-sm mb-6">
                Are you sure you want to delete <span className="font-semibold">{allTemplates.find(t => t.id === confirmDeleteId)?.name}</span>? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  disabled={isDeleting}
                  onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-200 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  disabled={isDeleting}
                  onClick={() => handleDeleteTemplate(confirmDeleteId)}
                  className="flex-1 px-4 py-2 bg-rose-600 text-white rounded-xl text-sm font-medium hover:bg-rose-700 transition-all shadow-sm flex items-center justify-center disabled:opacity-50"
                >
                  {isDeleting ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    'Delete Now'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Print-only View */}
      <div id="print-area" className="hidden print:block">
        {selectedWorkerIds.map((id) => {
          const worker = workers.find(w => w.id === id);
          if (!worker) return null;
          return (
            <div key={id} className="letter-container">
              {selectedTemplate?.letterheadUrl && (
                <div className="letter-header">
                  <img src={selectedTemplate.letterheadUrl} className="letterhead-img" alt="Header" />
                </div>
              )}
              
              <div className="letter-content">
                {editedLetters[id] || ''}
              </div>

              {(selectedTemplate?.chopUrl || selectedTemplate?.signatureUrl) && (
                <div className="letter-footer">
                  {selectedTemplate?.chopUrl && (
                    <img src={selectedTemplate.chopUrl} className="chop-img" alt="Chop" />
                  )}
                  {selectedTemplate?.signatureUrl && (
                    <img src={selectedTemplate.signatureUrl} className="sign-img" alt="Sign" />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @media print {
          @page {
            margin: 1cm;
            size: A4;
          }
          body {
            background: white;
            margin: 0;
            padding: 0;
            font-family: Georgia, serif;
            color: black;
            line-height: 1.5;
          }
          .letter-container {
            position: relative;
            min-height: 29.7cm; 
            padding: 1.5cm;
            box-sizing: border-box;
            page-break-after: always;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:block {
            display: block !important;
          }
          .letter-header {
            width: 100%;
            margin-bottom: 2cm;
            text-align: center;
          }
          .letterhead-img {
            max-width: 100%;
            max-height: 4cm;
          }
          .letter-content {
            white-space: pre-wrap;
            font-size: 11pt;
          }
          .letter-footer {
            margin-top: 3cm;
            position: relative;
            height: 4cm;
          }
          .chop-img {
            position: absolute;
            bottom: 0px;
            left: 2cm;
            width: 3cm;
            opacity: 0.8;
            transform: translate(${selectedTemplate?.chopPosition?.x || 0}px, ${selectedTemplate?.chopPosition?.y || 0}px);
          }
          .sign-img {
            position: absolute;
            bottom: 1cm;
            left: 1cm;
            width: 4cm;
            transform: translate(${selectedTemplate?.signaturePosition?.x || 0}px, ${selectedTemplate?.signaturePosition?.y || 0}px);
          }
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
        .letter-wrapper textarea {
          scrollbar-width: none;
        }
        .letter-wrapper textarea::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
