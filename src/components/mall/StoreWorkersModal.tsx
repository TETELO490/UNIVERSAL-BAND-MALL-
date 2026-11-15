import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { StoreWorker } from '../../types';
import {
  X,
  Users,
  Plus,
  Trash2,
  Phone,
  Mail,
  Lock,
  Copy,
  Check,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  EyeOff,
  UserCheck,
} from 'lucide-react';

interface StoreWorkersModalProps {
  storeId: string;
  storeName: string;
  isOpen: boolean;
  onClose: () => void;
}

export const StoreWorkersModal: React.FC<StoreWorkersModalProps> = ({
  storeId,
  storeName,
  isOpen,
  onClose,
}) => {
  const { storeWorkers, createStoreWorker, deleteStoreWorker } = useApp();

  const [staffRole, setStaffRole] = useState<'Worker' | 'Manager'>('Worker');
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [workerName, setWorkerName] = useState('');
  const [workerEmail, setWorkerEmail] = useState('');
  const [workerPhone, setWorkerPhone] = useState('');
  const [workerPassword, setWorkerPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentStoreWorkers = storeWorkers.filter(
    (w) => w.storeId === storeId || w.storeName === storeName
  );

  const handleCreateWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!workerName.trim() || !workerEmail.trim()) {
      setErrorMessage('Staff full name and email are required.');
      return;
    }

    if (workerPassword.trim().length < 6) {
      setErrorMessage('Please enter a staff password of at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createStoreWorker({
        storeId,
        storeName,
        name: workerName.trim(),
        email: workerEmail.trim(),
        phone: workerPhone.trim(),
        password: workerPassword.trim(),
        role: staffRole,
      });

      if (!res.success) {
        setErrorMessage(res.error || 'Failed to create staff account.');
        setIsSubmitting(false);
        return;
      }

      setSuccessMessage(`${staffRole} account created for ${workerName.trim()}! Login credentials ready.`);
      setWorkerName('');
      setWorkerEmail('');
      setWorkerPhone('');
      setWorkerPassword('');
      setStaffRole('Worker');
      setShowAddForm(false);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error creating staff account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyCredentials = (worker: StoreWorker) => {
    const creds = `Universal Band Mall Staff Login:\nStore: ${storeName}\nName: ${worker.name}\nEmail: ${worker.email}\nPassword: ${worker.passwordHint || '(set by manager)'}\nRole: ${worker.role || 'Worker'}`;
    navigator.clipboard?.writeText(creds);
    setCopiedId(worker.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white text-black rounded-3xl overflow-hidden shadow-2xl border border-gray-100 flex flex-col max-h-[92vh]">
        {/* Header - Limpopo Blue #0D47A1 */}
        <div className="bg-[#0D47A1] text-white p-4 flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-black tracking-tight leading-tight">
                Store Workers & Managers
              </h2>
              <p className="text-[10px] text-blue-200">
                {storeName} • {currentStoreWorkers.length} Staff Member{currentStoreWorkers.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto space-y-4">
          {/* Permission Notice */}
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 text-xs text-blue-950 space-y-1.5">
            <div className="flex items-center gap-1.5 font-black text-blue-900">
              <Sparkles className="w-4 h-4 text-[#0D47A1] shrink-0" />
              <span>Customer + Staff Role Structure</span>
            </div>
            <p className="text-[11px] text-blue-900 leading-relaxed">
              • <strong>Customer Base:</strong> Workers and managers are based on the customer role. They can use the app normally, buy items, and top up their wristband wallet.
              <br />
              • <strong>Workers & Managers:</strong> Receive menu orders, mark orders ready, and scan tickets.
              <br />
              • <strong>Daily Sales Tracking:</strong> Both the <strong>Store Owner</strong> and <strong>Managers</strong> can view daily sales and revenue. (Workers do not see sales).
            </p>
          </div>

          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-300 text-red-800 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Add Worker Toggle Button */}
          {!showAddForm ? (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="w-full py-2.5 px-3 bg-[#D32F2F] hover:bg-red-700 text-white font-black text-xs rounded-xl shadow transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Create Worker or Manager Account</span>
            </button>
          ) : (
            <form onSubmit={handleCreateWorker} className="bg-gray-50 rounded-2xl p-3.5 border-2 border-gray-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-gray-900 flex items-center gap-1">
                  <UserCheck className="w-4 h-4 text-[#0D47A1]" />
                  <span>New Staff Account</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="text-xs text-gray-500 hover:text-black font-bold"
                >
                  Cancel
                </button>
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-700 block mb-1">
                  Role Type *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setStaffRole('Worker')}
                    className={`py-2 px-3 rounded-xl text-xs font-black border transition cursor-pointer ${
                      staffRole === 'Worker'
                        ? 'bg-[#0D47A1] text-white border-[#0D47A1] shadow'
                        : 'bg-white text-gray-700 border-gray-300'
                    }`}
                  >
                    Worker (Receives Orders & Scans)
                  </button>
                  <button
                    type="button"
                    onClick={() => setStaffRole('Manager')}
                    className={`py-2 px-3 rounded-xl text-xs font-black border transition cursor-pointer ${
                      staffRole === 'Manager'
                        ? 'bg-[#0D47A1] text-white border-[#0D47A1] shadow'
                        : 'bg-white text-gray-700 border-gray-300'
                    }`}
                  >
                    Manager (Daily Sales + Orders)
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-700 block mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sipho Ndlovu"
                  value={workerName}
                  onChange={(e) => setWorkerName(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs text-gray-900 font-bold focus:outline-none focus:border-[#0D47A1]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-gray-700 block mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="staff@ubmall.co.za"
                    value={workerEmail}
                    onChange={(e) => setWorkerEmail(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs text-gray-900 font-bold focus:outline-none focus:border-[#0D47A1]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-gray-700 block mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="071 234 5678"
                    value={workerPhone}
                    onChange={(e) => setWorkerPhone(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs text-gray-900 font-bold focus:outline-none focus:border-[#0D47A1]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-700 block mb-1">
                  Staff Password (min 6 characters) *
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="Enter initial staff password"
                  value={workerPassword}
                  onChange={(e) => setWorkerPassword(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs text-gray-900 font-mono font-bold focus:outline-none focus:border-[#0D47A1]"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-3 bg-[#0D47A1] hover:bg-blue-900 text-white font-black text-xs rounded-xl shadow transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <span>{isSubmitting ? 'Creating Staff Account...' : `Save & Register ${staffRole}`}</span>
              </button>
            </form>
          )}

          {/* Workers List */}
          <div className="space-y-2">
            <div className="text-xs font-black text-gray-700 flex items-center justify-between">
              <span>ACTIVE STORE WORKERS ({currentStoreWorkers.length})</span>
            </div>

            {currentStoreWorkers.length === 0 ? (
              <div className="p-6 text-center text-gray-500 bg-gray-50 rounded-2xl border border-dashed border-gray-300 text-xs space-y-1">
                <Users className="w-6 h-6 text-gray-400 mx-auto" />
                <p className="font-bold text-gray-700">No worker accounts created yet</p>
                <p className="text-[11px] text-gray-500">
                  Tap "Create Account for Worker" above to add staff who can prepare and fulfill orders.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {currentStoreWorkers.map((worker) => (
                  <div
                    key={worker.id}
                    className="bg-gray-50 rounded-2xl p-3 border border-gray-200 flex items-center justify-between gap-2 shadow-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black text-gray-900 truncate">
                          {worker.name}
                        </span>
                        <span className="text-[9px] bg-blue-100 text-[#0D47A1] font-black px-1.5 py-0.2 rounded">
                          Worker
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-500 truncate mt-0.5">
                        {worker.email} {worker.phone ? `• ${worker.phone}` : ''}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Copy credentials */}
                      <button
                        type="button"
                        onClick={() => handleCopyCredentials(worker)}
                        className="p-1.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 transition cursor-pointer"
                        title="Copy login details for worker"
                      >
                        {copiedId === worker.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => deleteStoreWorker(worker.id)}
                        className="p-1.5 rounded-lg bg-white border border-gray-200 hover:bg-red-50 text-gray-400 hover:text-red-600 transition cursor-pointer"
                        title="Delete worker"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-gray-50 border-t border-gray-200 shrink-0 text-center">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 px-4 bg-gray-200 hover:bg-gray-300 text-gray-800 font-black text-xs rounded-xl transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
