import { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Settings as SettingsIcon, Save, PenTool, Check, X, Shield, ArrowLeft, ChevronRight, Database, Download, Upload, AlertCircle, Palette } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useOutletContext, useNavigate, Link } from 'react-router-dom';
import { UserProfile } from '../types';
import { collection, getDocs, writeBatch, deleteDoc } from 'firebase/firestore';

const SIGNATURE_FONTS = [
  'Alex Brush', 'Allura', 'Arizonia', 'Bad Script', 'Caveat',
  'Cookie', 'Courgette', 'Damion', 'Dancing Script', 'Great Vibes',
  'Handlee', 'Herr Von Muellerhoff', 'Italianno', 'Just Another Hand',
  'Kaushan Script', 'Marck Script', 'Mr Dafoe', 'Pacifico',
  'Pinyon Script', 'Shadows Into Light'
];

interface SettingsProps {
  view?: 'overview' | 'signature' | 'global' | 'backup' | 'appearance';
}

export default function Settings({ view = 'overview' }: SettingsProps) {
  const { profile } = useOutletContext<{ profile: UserProfile }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isAutoUpdate, setIsAutoUpdate] = useState(true);
  const [signature, setSignature] = useState({
    useSignature: false,
    text: '',
    fontFamily: 'Dancing Script'
  });
  const [appearance, setAppearance] = useState({
    fontSize: '14px',
    fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif'
  });

  const FONT_OPTIONS = [
    { name: 'Inter (System Default)', value: '"Inter", ui-sans-serif, system-ui, sans-serif' },
    { name: 'Roboto', value: '"Roboto", sans-serif' },
    { name: 'Open Sans', value: '"Open Sans", sans-serif' },
    { name: 'Lato', value: '"Lato", sans-serif' },
    { name: 'Montserrat', value: '"Montserrat", sans-serif' },
    { name: 'Poppins', value: '"Poppins", sans-serif' },
    { name: 'Source Sans Pro', value: '"Source Sans Pro", sans-serif' },
    { name: 'Oswald', value: '"Oswald", sans-serif' },
    { name: 'Raleway', value: '"Raleway", sans-serif' },
    { name: 'Ubuntu', value: '"Ubuntu", sans-serif' },
    { name: 'Nunito', value: '"Nunito", sans-serif' },
    { name: 'Playfair Display', value: '"Playfair Display", serif' },
    { name: 'Merriweather', value: '"Merriweather", serif' },
    { name: 'Lora', value: '"Lora", serif' },
    { name: 'Libre Baskerville', value: '"Libre Baskerville", serif' },
    { name: 'JetBrains Mono', value: '"JetBrains Mono", monospace' },
    { name: 'Fira Sans', value: '"Fira Sans", sans-serif' },
    { name: 'Quicksand', value: '"Quicksand", sans-serif' },
    { name: 'Josefin Sans', value: '"Josefin Sans", sans-serif' },
    { name: 'Outfit', value: '"Outfit", sans-serif' },
    { name: 'Space Grotesk', value: '"Space Grotesk", sans-serif' },
    { name: 'Lexend', value: '"Lexend", sans-serif' },
    { name: 'Work Sans', value: '"Work Sans", sans-serif' },
    { name: 'Heebo', value: '"Heebo", sans-serif' },
    { name: 'Karla', value: '"Karla", sans-serif' },
    { name: 'Prompt', value: '"Prompt", sans-serif' },
    { name: 'Kanit', value: '"Kanit", sans-serif' },
    { name: 'Mukta', value: '"Mukta", sans-serif' },
    { name: 'Titillium Web', value: '"Titillium Web", sans-serif' },
    { name: 'Arimo', value: '"Arimo", sans-serif' },
    { name: 'Barlow', value: '"Barlow", sans-serif' },
    { name: 'Inconsolata', value: '"Inconsolata", monospace' },
    { name: 'PT Sans', value: '"PT Sans", sans-serif' },
    { name: 'PT Serif', value: '"PT Serif", serif' },
    { name: 'Noto Sans', value: '"Noto Sans", sans-serif' },
    { name: 'Noto Serif', value: '"Noto Serif", serif' },
    { name: 'Dosis', value: '"Dosis", sans-serif' },
    { name: 'Exo 2', value: '"Exo 2", sans-serif' },
    { name: 'Cairo', value: '"Cairo", sans-serif' },
    { name: 'Pacifico', value: '"Pacifico", cursive' },
    { name: 'Dancing Script', value: '"Dancing Script", cursive' },
    { name: 'Caveat', value: '"Caveat", cursive' },
    { name: 'Shadows Into Light', value: '"Shadows Into Light", cursive' },
    { name: 'Comfortaa', value: '"Comfortaa", sans-serif' },
    { name: 'Fjalla One', value: '"Fjalla One", sans-serif' },
    { name: 'Muli', value: '"Muli", sans-serif' },
    { name: 'Cabin', value: '"Cabin", sans-serif' },
    { name: 'Vollkorn', value: '"Vollkorn", serif' },
    { name: 'Crimson Text', value: '"Crimson Text", serif' },
    { name: 'EB Garamond', value: '"EB Garamond", serif' },
    { name: 'Overpass', value: '"Overpass", sans-serif' },
    { name: 'Abel', value: '"Abel", sans-serif' },
    { name: 'Zilla Slab', value: '"Zilla Slab", serif' }
  ].sort((a, b) => a.name.localeCompare(b.name));

  const FONT_SIZES = ['12px', '13px', '14px', '15px', '16px', '18px', '20px', '22px', '24px'];

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'global');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setIsAutoUpdate(docSnap.data().insuranceAutoUpdate ?? true);
        } else if (profile?.role === 'super_admin') {
          await setDoc(docRef, { insuranceAutoUpdate: true });
        }

        if (profile?.signature) {
          setSignature(profile.signature);
        } else {
          setSignature(prev => ({ ...prev, text: profile?.displayName || '' }));
        }

        if (profile?.appearance) {
          setAppearance(profile.appearance);
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, [profile]);

  const handleSaveGlobal = async () => {
    if (profile?.role !== 'super_admin') {
      toast.error('Only Super Admin can change global settings');
      return;
    }
    setLoading(true);
    try {
      await updateDoc(doc(db, 'settings', 'global'), {
        insuranceAutoUpdate: isAutoUpdate,
        updatedAt: new Date().toISOString()
      });
      toast.success('Global settings saved successfully');
      navigate('/settings');
    } catch (error) {
      toast.error('Failed to save global settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAppearance = async () => {
    if (!profile?.uid) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        appearance: appearance,
        updatedAt: new Date().toISOString()
      });
      toast.success('Appearance settings saved successfully');
      navigate('/settings');
    } catch (error) {
      toast.error('Failed to save appearance settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSignature = async () => {
    if (!profile?.uid) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        signature: signature,
        updatedAt: new Date().toISOString()
      });
      toast.success('Signature settings saved successfully');
      navigate('/settings');
    } catch (error) {
      toast.error('Failed to save signature settings');
    } finally {
      setLoading(false);
    }
  };

  const COLLECTIONS_TO_BACKUP = [
    'workers',
    'clients',
    'companies',
    'permits',
    'passports',
    'permit_holders',
    'custom_fields',
    'worker_custom_values',
    'audit_logs',
    'placement_history',
    'esp_history',
    'settings',
    'letter_templates',
    'users'
  ];

  const handleExportBackup = async () => {
    setLoading(true);
    try {
      const backupData: Record<string, any[]> = {};
      
      for (const collectionName of COLLECTIONS_TO_BACKUP) {
        const querySnapshot = await getDocs(collection(db, collectionName));
        backupData[collectionName] = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      }

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `FWMS_Backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success('Backup exported successfully');
    } catch (error) {
      console.error('Backup error:', error);
      toast.error('Failed to export backup');
    } finally {
      setLoading(false);
    }
  };

  const handleImportBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const backupData = JSON.parse(e.target?.result as string);
        
        if (typeof backupData !== 'object') throw new Error('Invalid backup file');

        const confirm = window.confirm('WARNING: This will overwrite or merge data and might cause duplicates. Are you sure you want to proceed?');
        if (!confirm) return;

        setLoading(true);
        let count = 0;

        for (const collectionName in backupData) {
          if (!COLLECTIONS_TO_BACKUP.includes(collectionName)) continue;
          
          const items = backupData[collectionName];
          if (!Array.isArray(items)) continue;

          // Process in batches of 500 (Firestore limit)
          for (let i = 0; i < items.length; i += 500) {
            const batch = writeBatch(db);
            const chunk = items.slice(i, i + 500);
            
            chunk.forEach(item => {
              const { id, ...data } = item;
              if (id) {
                const docRef = doc(db, collectionName, id);
                batch.set(docRef, data, { merge: true });
                count++;
              }
            });
            
            await batch.commit();
          }
        }

        toast.success(`Import completed! Processed ${count} records across ${Object.keys(backupData).length} collections.`);
        navigate('/settings');
      } catch (error) {
        console.error('Import error:', error);
        toast.error('Failed to import backup. Please ensure the file is a valid backup.');
      } finally {
        setLoading(false);
        // Clear the input
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  if (loading && view !== 'overview') return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
    </div>
  );

  if (view === 'appearance') {
    return (
      <div className="max-w-4xl mx-auto space-y-6 pb-12">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/settings')}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Appearance</h1>
              <p className="text-slate-500">Customize font size and style for your workstation</p>
            </div>
          </div>
          <button
            onClick={handleSaveAppearance}
            className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-all font-bold shadow-sm"
          >
            <Save className="w-4 h-4" />
            Save Changes
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 space-y-10">
          {/* Font Size */}
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Font Size</h3>
              <p className="text-sm text-slate-500">Adjust the overall text scale of the application</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {FONT_SIZES.map(size => (
                <button
                  key={size}
                  onClick={() => setAppearance(prev => ({ ...prev, fontSize: size }))}
                  className={`px-6 py-3 rounded-xl border-2 transition-all font-bold flex flex-col items-center gap-1 ${
                    appearance.fontSize === size 
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-600' 
                      : 'border-slate-100 hover:border-slate-200 text-slate-600'
                  }`}
                >
                  <span style={{ fontSize: size }}>Aa</span>
                  <span className="text-[10px] uppercase tracking-wider opacity-60 font-sans">{size}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Font Family */}
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Font Style</h3>
              <p className="text-sm text-slate-500">Pick a typeface that suits your reading preference</p>
            </div>
            <div className="max-w-md">
              <select
                value={appearance.fontFamily}
                onChange={(e) => setAppearance(prev => ({ ...prev, fontFamily: e.target.value }))}
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 font-bold appearance-none cursor-pointer"
                style={{ fontFamily: appearance.fontFamily }}
              >
                {FONT_OPTIONS.map(font => (
                  <option 
                    key={font.name} 
                    value={font.value}
                    style={{ fontFamily: font.value }}
                  >
                    {font.name}
                  </option>
                ))}
              </select>
              <div className="mt-4 p-6 rounded-xl border border-slate-200 bg-slate-50">
                <p className="text-xs font-bold text-slate-400 uppercase mb-2">Style Preview</p>
                <p 
                  style={{ fontFamily: appearance.fontFamily, fontSize: '1.25rem' }} 
                  className="text-slate-900"
                >
                  The quick brown fox jumps over the lazy dog. 1234567890
                </p>
              </div>
            </div>
          </div>

          {/* Preview Section */}
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-8 space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Live Preview</h3>
            <div 
              style={{ fontSize: appearance.fontSize, fontFamily: appearance.fontFamily }}
              className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 space-y-4"
            >
              <h4 className="font-bold">System Dashboard Example</h4>
              <p className="text-slate-600 leading-relaxed">
                This is a sample of how your data will look across the system. 
                Adjusting these settings will help reduce eye strain during long working hours.
              </p>
              <div className="flex gap-2">
                <div className="h-8 w-24 bg-indigo-600 rounded-lg"></div>
                <div className="h-8 w-24 bg-slate-200 rounded-lg"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'signature') {
    return (
      <div className="max-w-4xl mx-auto space-y-6 pb-12">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/settings')}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Digital Signature</h1>
              <p className="text-slate-500">Configure your personal signature for documents</p>
            </div>
          </div>
          <button
            onClick={handleSaveSignature}
            className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-all font-bold shadow-sm"
          >
            <Save className="w-4 h-4" />
            Save Changes
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-8">
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="space-y-1">
              <p className="font-bold text-slate-900 text-sm">Use Digital Signature</p>
              <p className="text-sm text-slate-500">Enable or disable signature in exported files</p>
            </div>
            <button
              onClick={() => setSignature(prev => ({ ...prev, useSignature: !prev.useSignature }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                signature.useSignature ? 'bg-indigo-600' : 'bg-slate-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  signature.useSignature ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {signature.useSignature && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Signature Text</label>
                  <input
                    type="text"
                    value={signature.text}
                    onChange={(e) => setSignature(prev => ({ ...prev, text: e.target.value }))}
                    placeholder="Enter your name"
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Select Style (Font)</label>
                  <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {SIGNATURE_FONTS.map(font => (
                      <button
                        key={font}
                        onClick={() => setSignature(prev => ({ ...prev, fontFamily: font }))}
                        className={`p-3 rounded-lg border text-center transition-all ${
                          signature.fontFamily === font 
                            ? 'border-indigo-600 bg-indigo-50 text-indigo-600 shadow-sm ring-1 ring-indigo-600' 
                            : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                        }`}
                      >
                        <span style={{ fontFamily: font }} className="text-xl">{signature.text || 'Signature'}</span>
                        <p className="text-[10px] mt-1 font-sans text-slate-400">{font}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 p-8 flex flex-col items-center justify-center text-center space-y-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Preview on Documents</p>
                <div className="bg-white p-12 shadow-md border border-slate-100 rounded-sm w-full max-w-[300px] aspect-[3/2] flex items-center justify-center relative">
                  <div className="absolute top-4 left-4 text-[8px] text-slate-300 uppercase tracking-tighter">Approved By:</div>
                  <div 
                    style={{ fontFamily: signature.fontFamily }} 
                    className="text-4xl text-slate-800"
                  >
                    {signature.text || 'Signature'}
                  </div>
                  <div className="absolute bottom-8 left-0 right-0 h-[1px] bg-slate-200 mx-8"></div>
                  <div className="absolute bottom-4 text-[10px] text-slate-400 font-medium">{profile?.displayName}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (view === 'global') {
    return (
      <div className="max-w-4xl mx-auto space-y-6 pb-12">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/settings')}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Global System Settings</h1>
              <p className="text-slate-500">Configure application behavior for all users</p>
            </div>
          </div>
          {profile?.role === 'super_admin' && (
            <button
              onClick={handleSaveGlobal}
              className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-all font-bold shadow-sm"
            >
              <Save className="w-4 h-4" />
              Save Changes
            </button>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="space-y-1">
              <p className="font-bold text-slate-900 text-sm">Purchase Insurance Auto Update</p>
              <p className="text-sm text-slate-500">Automatically update "Purchase Insurance" to "Done" when PLKS Status is changed to "Applied"</p>
            </div>
            <div className="flex items-center gap-4">
              <span className={`text-sm font-bold ${isAutoUpdate ? 'text-indigo-600' : 'text-slate-400'}`}>
                {isAutoUpdate ? 'ON' : 'OFF'}
              </span>
              <button
                disabled={profile?.role !== 'super_admin'}
                onClick={() => setIsAutoUpdate(!isAutoUpdate)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                   isAutoUpdate ? 'bg-indigo-600' : 'bg-slate-200'
                } ${profile?.role !== 'super_admin' ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isAutoUpdate ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'backup') {
    return (
      <div className="max-w-4xl mx-auto space-y-6 pb-12">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/settings')}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Backup & Restore</h1>
              <p className="text-slate-500">Secure your data or restore from a previous backup</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Export Section */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 flex flex-col items-center text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center">
              <Download className="w-8 h-8 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Export Backup</h3>
              <p className="text-sm text-slate-500 mt-2">
                Download a full backup of all workers, clients, and system settings in JSON format.
              </p>
            </div>
            <button
              onClick={handleExportBackup}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-xl hover:bg-indigo-700 transition-all font-bold shadow-sm disabled:opacity-50"
            >
              <Download className="w-5 h-5" />
              Download Backup
            </button>
          </div>

          {/* Import Section */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 flex flex-col items-center text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
              <Upload className="w-8 h-8 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Restore Backup</h3>
              <p className="text-sm text-slate-500 mt-2">
                Upload a previously saved backup file to restore your data. 
              </p>
            </div>
            <label className="w-full">
              <input
                type="file"
                accept=".json"
                onChange={handleImportBackup}
                className="hidden"
                disabled={loading}
              />
              <div className={`w-full flex items-center justify-center gap-2 bg-white border-2 border-dashed border-slate-200 text-slate-600 px-6 py-3 rounded-xl hover:border-emerald-500 hover:text-emerald-600 transition-all font-bold cursor-pointer ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <Upload className="w-5 h-5" />
                Select & Upload File
              </div>
            </label>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex gap-4">
          <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
          <div className="space-y-1">
            <p className="font-bold text-amber-900">Important Note</p>
            <p className="text-sm text-amber-700 leading-relaxed">
              Restoring data will merge existing records with the same ID. If a record in the backup already exists on the server, it will be updated. Letter templates and global settings will also be affected. Use with caution.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <SettingsIcon className="w-8 h-8 text-indigo-600" />
          Settings
        </h1>
        <p className="text-slate-500">Configure global behavior and personal preferences</p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {/* Appearance Row */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden group hover:border-indigo-300 transition-all">
          <div className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                <Palette className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Appearance</h3>
                <p className="text-sm text-slate-500">Change font size and system typeface</p>
              </div>
            </div>
            <Link 
              to="/settings/appearance"
              className="flex items-center gap-2 px-4 py-2 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 transition-all text-sm font-bold border border-slate-200"
            >
              Edit
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Signature Row */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden group hover:border-indigo-300 transition-all">
          <div className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                <PenTool className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Digital Signature</h3>
                <p className="text-sm text-slate-500">Setup your digital signature for document exports</p>
              </div>
            </div>
            <Link 
              to="/settings/signature"
              className="flex items-center gap-2 px-4 py-2 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 transition-all text-sm font-bold border border-slate-200"
            >
              Edit
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Global Row */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden group hover:border-indigo-300 transition-all">
          <div className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                <Shield className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Global System Settings</h3>
                <p className="text-sm text-slate-500">Configure core system behaviors (Admin only)</p>
              </div>
            </div>
            <Link 
              to="/settings/global"
              className="flex items-center gap-2 px-4 py-2 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 transition-all text-sm font-bold border border-slate-200"
            >
              Edit
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Backup Row */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden group hover:border-indigo-300 transition-all">
          <div className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                <Database className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Backup & Restore</h3>
                <p className="text-sm text-slate-500">Full system data export and import</p>
              </div>
            </div>
            <Link 
              to="/settings/backup"
              className="flex items-center gap-2 px-4 py-2 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 transition-all text-sm font-bold border border-slate-200"
            >
              Manage
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
