import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bell, Mail, Smartphone, Loader2, Check, AlertCircle } from 'lucide-react';
import { api, NotificationPreferences } from '../services/api';

interface NotificationSettingsProps {
    isOpen: boolean;
    onClose: () => void;
    userName: string;
}

export default function NotificationSettings({ isOpen, onClose, userName }: NotificationSettingsProps) {
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [prefs, setPrefs] = useState<NotificationPreferences>({
        email_new_requests: true,
        email_status_changes: true,
        email_comments: true,
        email_assigned_only: false,
        sms_new_requests: false,
        sms_status_changes: false,
        phone: null
    });
    const [phone, setPhone] = useState('');

    useEffect(() => {
        if (isOpen) {
            loadPreferences();
        }
    }, [isOpen]);

    const loadPreferences = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await api.getNotificationPreferences();
            setPrefs(data);
            setPhone(data.phone || '');
        } catch (err) {
            console.error('Failed to load notification preferences:', err);
            setError('Failed to load preferences');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        setError(null);
        setSaveSuccess(false);
        try {
            const updateData = {
                ...prefs,
                phone: phone.trim() || null
            };
            const updated = await api.updateNotificationPreferences(updateData);
            setPrefs(updated);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
        } catch (err) {
            console.error('Failed to save notification preferences:', err);
            setError('Failed to save preferences');
        } finally {
            setIsSaving(false);
        }
    };

    const togglePref = (key: keyof NotificationPreferences) => {
        if (key === 'phone') return;
        setPrefs(prev => ({ ...prev, [key]: !prev[key] }));
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
                >
                    {/* Header */}
                    <div className="p-6 border-b border-white/10">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-primary-500/20 flex items-center justify-center">
                                    <Bell className="w-5 h-5 text-primary-400" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-white">Notification Settings</h2>
                                    <p className="text-sm text-white/50">{userName}</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                                aria-label="Close notification settings"
                            >
                                <X className="w-5 h-5 text-white/60" aria-hidden="true" />
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-6 max-h-[60vh] overflow-y-auto">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {/* Email Notifications */}
                                <div>
                                    <div className="flex items-center gap-2 mb-4">
                                        <Mail className="w-4 h-4 text-white/60" />
                                        <h3 className="text-sm font-medium text-white/80 uppercase tracking-wider">Email Notifications</h3>
                                    </div>
                                    <div className="space-y-3">
                                        <ToggleRow
                                            label="New Requests"
                                            description="Get notified when new requests are submitted"
                                            enabled={prefs.email_new_requests}
                                            onChange={() => togglePref('email_new_requests')}
                                        />
                                        <ToggleRow
                                            label="Status Changes"
                                            description="Get notified when request status changes"
                                            enabled={prefs.email_status_changes}
                                            onChange={() => togglePref('email_status_changes')}
                                        />
                                        <ToggleRow
                                            label="Comments"
                                            description="Get notified when comments are added"
                                            enabled={prefs.email_comments}
                                            onChange={() => togglePref('email_comments')}
                                        />
                                        <div className="pt-2 border-t border-white/5">
                                            <ToggleRow
                                                label="Assigned Only"
                                                description="Only notify for requests assigned to me"
                                                enabled={prefs.email_assigned_only}
                                                onChange={() => togglePref('email_assigned_only')}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* SMS Notifications */}
                                <div>
                                    <div className="flex items-center gap-2 mb-4">
                                        <Smartphone className="w-4 h-4 text-white/60" />
                                        <h3 className="text-sm font-medium text-white/80 uppercase tracking-wider">SMS Notifications</h3>
                                    </div>
                                    <div className="space-y-3">
                                        <div className="mb-4">
                                            <label className="block text-sm text-white/60 mb-2">Phone Number</label>
                                            <input
                                                type="tel"
                                                value={phone}
                                                onChange={(e) => setPhone(e.target.value)}
                                                placeholder="+1 555-123-4567"
                                                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50"
                                            />
                                        </div>
                                        <ToggleRow
                                            label="New Requests"
                                            description="SMS alert for new requests"
                                            enabled={prefs.sms_new_requests}
                                            onChange={() => togglePref('sms_new_requests')}
                                            disabled={!phone.trim()}
                                        />
                                        <ToggleRow
                                            label="Status Changes"
                                            description="SMS alert when status changes"
                                            enabled={prefs.sms_status_changes}
                                            onChange={() => togglePref('sms_status_changes')}
                                            disabled={!phone.trim()}
                                        />
                                    </div>
                                </div>

                                {/* Error/Success Messages */}
                                {error && (
                                    <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-300 text-sm">
                                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                        {error}
                                    </div>
                                )}
                                {saveSuccess && (
                                    <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-300 text-sm">
                                        <Check className="w-4 h-4 flex-shrink-0" />
                                        Preferences saved successfully
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-white/10 flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isLoading || isSaving}
                            className="px-6 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isSaving ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                'Save Changes'
                            )}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

// Toggle Row Component
function ToggleRow({
    label,
    description,
    enabled,
    onChange,
    disabled = false
}: {
    label: string;
    description: string;
    enabled: boolean;
    onChange: () => void;
    disabled?: boolean;
}) {
    return (
        <div
            className={`flex items-center justify-between p-3 bg-white/5 rounded-lg ${disabled ? 'opacity-50' : ''}`}
        >
            <div className="flex-1 mr-4">
                <p className="text-sm font-medium text-white">{label}</p>
                <p className="text-xs text-white/50">{description}</p>
            </div>
            {/* Toggle switch with fixed pixel dimensions */}
            <button
                type="button"
                onClick={onChange}
                disabled={disabled}
                className={`relative rounded-full transition-colors duration-200 ${enabled ? 'bg-primary-500' : 'bg-slate-600'
                    } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                role="switch"
                aria-checked={enabled}
                aria-label={`Toggle ${label}`}
                style={{
                    width: '48px',
                    height: '26px',
                    flexShrink: 0
                }}
            >
                <span
                    className="absolute rounded-full bg-white shadow-md transition-all duration-200"
                    style={{
                        width: '20px',
                        height: '20px',
                        top: '3px',
                        left: enabled ? '25px' : '3px'
                    }}
                    aria-hidden="true"
                />
            </button>
        </div>
    );
}
