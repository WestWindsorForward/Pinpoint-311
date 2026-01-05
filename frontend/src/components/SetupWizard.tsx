import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Rocket,
    Palette,
    Building2,
    Grid3X3,
    Shield,
    Key,
    CheckCircle2,
    ChevronRight,
    ChevronLeft,
    Upload,
    Plus,
    Trash2,
    AlertCircle,
} from 'lucide-react';
import { api } from '../services/api';

interface SetupWizardProps {
    onComplete: () => void;
    townshipName?: string;
}

interface WizardStep {
    id: string;
    title: string;
    description: string;
    icon: React.ElementType;
    optional?: boolean;
}

const WIZARD_STEPS: WizardStep[] = [
    { id: 'welcome', title: 'Welcome', description: 'Getting started', icon: Rocket },
    { id: 'branding', title: 'Branding', description: 'Township identity', icon: Palette },
    { id: 'departments', title: 'Departments', description: 'Create teams', icon: Building2 },
    { id: 'services', title: 'Services', description: 'Request types', icon: Grid3X3 },
    { id: 'security', title: 'Security', description: 'Admin password', icon: Shield },
    { id: 'integrations', title: 'Integrations', description: 'API keys', icon: Key, optional: true },
    { id: 'complete', title: 'Complete', description: 'All done!', icon: CheckCircle2 },
];

export const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete, townshipName: initialName }) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Branding state
    const [townshipName, setTownshipName] = useState(initialName || 'Your Township');
    const [primaryColor, setPrimaryColor] = useState('#6366f1');
    const [logoUrl, setLogoUrl] = useState<string | null>(null);

    // Departments state
    const [departments, setDepartments] = useState<{ name: string; email: string }[]>([
        { name: 'Public Works', email: '' }
    ]);

    // Security state
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordChanged, setPasswordChanged] = useState(false);

    // API Keys state
    const [googleMapsKey, setGoogleMapsKey] = useState('');
    const [vertexProject, setVertexProject] = useState('');

    const currentStepData = WIZARD_STEPS[currentStep];

    const handleNext = async () => {
        setError(null);

        // Validate and save current step before moving on
        try {
            setLoading(true);

            if (currentStepData.id === 'branding') {
                await api.updateSettings({
                    township_name: townshipName,
                    primary_color: primaryColor,
                    logo_url: logoUrl,
                });
            }

            if (currentStepData.id === 'departments') {
                // Create departments (at least one required)
                for (const dept of departments) {
                    if (dept.name.trim()) {
                        await api.createDepartment({
                            name: dept.name,
                            routing_email: dept.email || null,
                        });
                    }
                }
            }

            if (currentStepData.id === 'services') {
                // Services are typically pre-seeded, so we skip creation here
                // But we could create custom ones if needed
            }

            if (currentStepData.id === 'security') {
                if (newPassword !== confirmPassword) {
                    setError('Passwords do not match');
                    setLoading(false);
                    return;
                }
                if (newPassword.length < 8) {
                    setError('Password must be at least 8 characters');
                    setLoading(false);
                    return;
                }
                // Get current user and reset password
                const me = await api.getMe();
                await api.resetUserPassword(me.id, newPassword);
                setPasswordChanged(true);
            }

            if (currentStepData.id === 'integrations') {
                // Save API keys if provided
                if (googleMapsKey) {
                    await api.updateSecret('GOOGLE_MAPS_API_KEY', googleMapsKey);
                }
                if (vertexProject) {
                    await api.updateSecret('VERTEX_AI_PROJECT', vertexProject);
                }
            }

            if (currentStepData.id === 'complete') {
                // Mark wizard as complete by setting a flag in modules
                const settings = await api.getSettings();
                await api.updateSettings({
                    ...settings,
                    modules: {
                        ...settings.modules,
                        wizard_completed: true,
                    },
                });
                onComplete();
                return;
            }

            setCurrentStep((prev) => Math.min(prev + 1, WIZARD_STEPS.length - 1));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setLoading(false);
        }
    };

    const handleBack = () => {
        setCurrentStep((prev) => Math.max(prev - 1, 0));
        setError(null);
    };

    const handleSkip = () => {
        setCurrentStep((prev) => Math.min(prev + 1, WIZARD_STEPS.length - 1));
        setError(null);
    };

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const result = await api.uploadImage(file);
            setLogoUrl(result.url);
        } catch (err) {
            setError('Failed to upload logo');
        }
    };

    const addDepartment = () => {
        setDepartments([...departments, { name: '', email: '' }]);
    };

    const removeDepartment = (index: number) => {
        if (departments.length > 1) {
            setDepartments(departments.filter((_, i) => i !== index));
        }
    };

    const updateDepartment = (index: number, field: 'name' | 'email', value: string) => {
        const updated = [...departments];
        updated[index][field] = value;
        setDepartments(updated);
    };

    // Render step content
    const renderStepContent = () => {
        switch (currentStepData.id) {
            case 'welcome':
                return (
                    <div className="text-center py-8">
                        <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
                            <Rocket className="w-10 h-10 text-white" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-3">
                            Welcome to Township 311
                        </h2>
                        <p className="text-gray-600 max-w-md mx-auto">
                            This wizard will guide you through the essential configuration
                            to get your 311 system up and running. It only takes a few minutes!
                        </p>
                        <div className="mt-8 bg-indigo-50 rounded-lg p-4 max-w-sm mx-auto">
                            <p className="text-sm text-indigo-700">
                                <strong>What we'll set up:</strong>
                            </p>
                            <ul className="text-sm text-indigo-600 mt-2 space-y-1">
                                <li>• Township branding and colors</li>
                                <li>• Departments for request routing</li>
                                <li>• Service categories</li>
                                <li>• Admin security</li>
                                <li>• Optional integrations</li>
                            </ul>
                        </div>
                    </div>
                );

            case 'branding':
                return (
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Township / Municipality Name
                            </label>
                            <input
                                type="text"
                                value={townshipName}
                                onChange={(e) => setTownshipName(e.target.value)}
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                placeholder="e.g., West Windsor Township"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Primary Brand Color
                            </label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="color"
                                    value={primaryColor}
                                    onChange={(e) => setPrimaryColor(e.target.value)}
                                    className="w-12 h-12 rounded-lg border-2 border-gray-200 cursor-pointer"
                                />
                                <input
                                    type="text"
                                    value={primaryColor}
                                    onChange={(e) => setPrimaryColor(e.target.value)}
                                    className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                                    placeholder="#6366f1"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Logo (Optional)
                            </label>
                            <div className="flex items-center gap-4">
                                {logoUrl ? (
                                    <img
                                        src={logoUrl}
                                        alt="Logo preview"
                                        className="w-16 h-16 object-contain rounded-lg bg-gray-100"
                                    />
                                ) : (
                                    <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center">
                                        <Upload className="w-6 h-6 text-gray-400" />
                                    </div>
                                )}
                                <label className="cursor-pointer px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
                                    Upload Logo
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleLogoUpload}
                                        className="hidden"
                                    />
                                </label>
                            </div>
                        </div>
                    </div>
                );

            case 'departments':
                return (
                    <div className="space-y-4">
                        <p className="text-sm text-gray-600 mb-4">
                            Create at least one department to route incoming requests.
                            You can add more later in the Admin Console.
                        </p>

                        {departments.map((dept, index) => (
                            <div key={index} className="flex gap-3 items-start">
                                <div className="flex-1 space-y-2">
                                    <input
                                        type="text"
                                        value={dept.name}
                                        onChange={(e) => updateDepartment(index, 'name', e.target.value)}
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                                        placeholder="Department name"
                                    />
                                    <input
                                        type="email"
                                        value={dept.email}
                                        onChange={(e) => updateDepartment(index, 'email', e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                                        placeholder="Routing email (optional)"
                                    />
                                </div>
                                {departments.length > 1 && (
                                    <button
                                        onClick={() => removeDepartment(index)}
                                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                )}
                            </div>
                        ))}

                        <button
                            onClick={addDepartment}
                            className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 text-sm font-medium"
                        >
                            <Plus className="w-4 h-4" />
                            Add Another Department
                        </button>
                    </div>
                );

            case 'services':
                return (
                    <div className="space-y-4">
                        <p className="text-sm text-gray-600 mb-4">
                            Your system comes pre-configured with common service categories.
                            You can customize these in the Admin Console.
                        </p>

                        <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                            {['Pothole', 'Street Light', 'Graffiti', 'Trash / Litter', 'Sidewalk Issue', 'Sign Problem', 'Noise Complaint', 'Other Issue'].map((service) => (
                                <div
                                    key={service}
                                    className="flex items-center gap-3 py-2 px-3 bg-white rounded-lg"
                                >
                                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                                    <span className="text-gray-700">{service}</span>
                                </div>
                            ))}
                        </div>

                        <p className="text-xs text-gray-500">
                            ✨ All categories can be customized with icons, routing rules, and custom fields.
                        </p>
                    </div>
                );

            case 'security':
                return (
                    <div className="space-y-6">
                        {passwordChanged ? (
                            <div className="text-center py-4">
                                <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
                                <p className="text-green-700 font-medium">Password updated successfully!</p>
                            </div>
                        ) : (
                            <>
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
                                    <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                                    <div className="text-sm text-amber-700">
                                        <strong>Important:</strong> Change the default admin password
                                        before going live. The default password (admin123) is public knowledge.
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        New Admin Password
                                    </label>
                                    <input
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                                        placeholder="Enter new password"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Confirm Password
                                    </label>
                                    <input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                                        placeholder="Confirm new password"
                                    />
                                </div>
                            </>
                        )}
                    </div>
                );

            case 'integrations':
                return (
                    <div className="space-y-6">
                        <p className="text-sm text-gray-600">
                            These integrations are optional. You can configure them later in the Admin Console.
                        </p>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Google Maps API Key
                            </label>
                            <input
                                type="text"
                                value={googleMapsKey}
                                onChange={(e) => setGoogleMapsKey(e.target.value)}
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                                placeholder="AIza..."
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Required for address autocomplete and maps
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Vertex AI Project ID
                            </label>
                            <input
                                type="text"
                                value={vertexProject}
                                onChange={(e) => setVertexProject(e.target.value)}
                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                                placeholder="your-gcp-project-id"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Required for AI-powered request analysis
                            </p>
                        </div>
                    </div>
                );

            case 'complete':
                return (
                    <div className="text-center py-8">
                        <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                            <CheckCircle2 className="w-10 h-10 text-white" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-3">
                            You're All Set!
                        </h2>
                        <p className="text-gray-600 max-w-md mx-auto mb-6">
                            Your 311 system is configured and ready to accept resident requests.
                        </p>

                        <div className="bg-gray-50 rounded-xl p-6 max-w-md mx-auto text-left">
                            <h3 className="font-medium text-gray-900 mb-3">Quick Links:</h3>
                            <ul className="space-y-2 text-sm">
                                <li>
                                    <span className="text-gray-600">🏠 Resident Portal:</span>
                                    <code className="ml-2 bg-gray-200 px-2 py-0.5 rounded">/</code>
                                </li>
                                <li>
                                    <span className="text-gray-600">👷 Staff Dashboard:</span>
                                    <code className="ml-2 bg-gray-200 px-2 py-0.5 rounded">/staff</code>
                                </li>
                                <li>
                                    <span className="text-gray-600">⚙️ Admin Console:</span>
                                    <code className="ml-2 bg-gray-200 px-2 py-0.5 rounded">/admin</code>
                                </li>
                            </ul>
                        </div>
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden"
            >
                {/* Header with steps */}
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white">
                    <h1 className="text-xl font-bold mb-4">Setup Wizard</h1>

                    {/* Step indicators */}
                    <div className="flex gap-1">
                        {WIZARD_STEPS.map((step, index) => (
                            <div
                                key={step.id}
                                className={`flex-1 h-1 rounded-full transition-colors ${index <= currentStep ? 'bg-white' : 'bg-white/30'
                                    }`}
                            />
                        ))}
                    </div>

                    <div className="flex items-center gap-3 mt-4">
                        <currentStepData.icon className="w-5 h-5" />
                        <div>
                            <p className="font-medium">{currentStepData.title}</p>
                            <p className="text-white/70 text-sm">{currentStepData.description}</p>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 max-h-[50vh] overflow-y-auto">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentStepData.id}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                        >
                            {renderStepContent()}
                        </motion.div>
                    </AnimatePresence>

                    {error && (
                        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t p-4 flex justify-between items-center bg-gray-50">
                    <div>
                        {currentStep > 0 && currentStep < WIZARD_STEPS.length - 1 && (
                            <button
                                onClick={handleBack}
                                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800"
                            >
                                <ChevronLeft className="w-4 h-4" />
                                Back
                            </button>
                        )}
                    </div>

                    <div className="flex gap-3">
                        {currentStepData.optional && (
                            <button
                                onClick={handleSkip}
                                className="px-4 py-2 text-gray-600 hover:text-gray-800"
                            >
                                Skip
                            </button>
                        )}
                        <button
                            onClick={handleNext}
                            disabled={loading}
                            className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
                        >
                            {loading ? (
                                'Saving...'
                            ) : currentStepData.id === 'complete' ? (
                                'Get Started'
                            ) : (
                                <>
                                    Continue
                                    <ChevronRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default SetupWizard;
