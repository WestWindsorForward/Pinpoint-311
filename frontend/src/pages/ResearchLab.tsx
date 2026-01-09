import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
    Download,
    FileText,
    Map,
    Code,
    Clock,
    TrendingUp,
    MapPin,
    Filter,
    RefreshCw,
    Shield,
    Eye,
    BarChart3,
    Activity,
    Layers,
    Lock,
    ArrowLeft,
} from 'lucide-react';
import { Button, Card } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { api, ResearchAnalytics, ResearchCodeSnippets } from '../services/api';

export const ResearchLab: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { settings } = useSettings();

    // Check access
    useEffect(() => {
        if (user && user.role !== 'researcher' && user.role !== 'admin') {
            navigate('/staff');
        }
    }, [user, navigate]);

    // Query state
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    const [serviceCode, setServiceCode] = useState<string>('');
    const [privacyMode, setPrivacyMode] = useState<'fuzzed' | 'exact'>('fuzzed');

    // Data state
    const [analytics, setAnalytics] = useState<ResearchAnalytics | null>(null);
    const [codeSnippets, setCodeSnippets] = useState<ResearchCodeSnippets | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isEnabled, setIsEnabled] = useState<boolean | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Snippet display
    const [activeSnippet, setActiveSnippet] = useState<'python' | 'r'>('python');

    // Check if research suite is enabled
    useEffect(() => {
        checkEnabled();
    }, []);

    const checkEnabled = async () => {
        try {
            const status = await api.getResearchStatus();
            setIsEnabled(status.enabled);
            if (status.enabled) {
                loadAnalytics();
                loadCodeSnippets();
            }
        } catch {
            setIsEnabled(false);
        }
    };

    const loadAnalytics = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await api.getResearchAnalytics({
                start_date: startDate || undefined,
                end_date: endDate || undefined,
                service_code: serviceCode || undefined,
            });
            setAnalytics(data);
        } catch (err: any) {
            setError(err.message || 'Failed to load analytics');
        } finally {
            setIsLoading(false);
        }
    };

    const loadCodeSnippets = async () => {
        try {
            const snippets = await api.getResearchCodeSnippets();
            setCodeSnippets(snippets);
        } catch (err) {
            console.error('Failed to load code snippets', err);
        }
    };

    const handleExportCSV = async () => {
        try {
            const blob = await api.exportResearchCSV({
                start_date: startDate || undefined,
                end_date: endDate || undefined,
                service_code: serviceCode || undefined,
                privacy_mode: privacyMode,
            });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `research_export_${new Date().toISOString().slice(0, 10)}.csv`;
            link.click();
            window.URL.revokeObjectURL(url);
        } catch (err: any) {
            setError(err.message || 'Export failed');
        }
    };

    const handleExportGeoJSON = async () => {
        try {
            const blob = await api.exportResearchGeoJSON({
                start_date: startDate || undefined,
                end_date: endDate || undefined,
                service_code: serviceCode || undefined,
                privacy_mode: privacyMode,
            });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `research_export_${new Date().toISOString().slice(0, 10)}.geojson`;
            link.click();
            window.URL.revokeObjectURL(url);
        } catch (err: any) {
            setError(err.message || 'Export failed');
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    // Not enabled state
    if (isEnabled === false) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
                <Card className="max-w-md text-center p-8">
                    <Lock className="w-16 h-16 text-amber-400 mx-auto mb-4" />
                    <h1 className="text-2xl font-bold text-white mb-2">Research Suite Disabled</h1>
                    <p className="text-white/60 mb-4">
                        The Research Suite is not enabled for this installation.
                        Contact your administrator to enable it.
                    </p>
                    <Button onClick={() => navigate(-1)}>
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Go Back
                    </Button>
                </Card>
            </div>
        );
    }

    // Loading state
    if (isEnabled === null) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
                <RefreshCw className="w-8 h-8 text-primary-400 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            {/* Header */}
            <header className="glass-card border-b border-white/10 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" onClick={() => navigate(-1)}>
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                        <div>
                            <h1 className="text-xl font-bold text-white flex items-center gap-2">
                                <BarChart3 className="w-6 h-6 text-amber-400" />
                                Research Data Lab
                            </h1>
                            <p className="text-sm text-white/50">
                                {settings?.township_name} • Read-only research access
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-sm text-white/60">
                            <Shield className="w-4 h-4" />
                            <span>Logged in as {user?.username} ({user?.role})</span>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-8">
                {/* Error display */}
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-red-500/20 border border-red-500/30 rounded-xl p-4 mb-6"
                    >
                        <p className="text-red-400">{error}</p>
                    </motion.div>
                )}

                {/* Query Builder */}
                <Card className="mb-8">
                    <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <Filter className="w-5 h-5 text-primary-400" />
                        Query Builder
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-sm text-white/60 mb-2">Start Date</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-white/60 mb-2">End Date</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-white/60 mb-2">Service Category</label>
                            <input
                                type="text"
                                value={serviceCode}
                                onChange={(e) => setServiceCode(e.target.value)}
                                placeholder="e.g., pothole"
                                className="w-full px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            />
                        </div>
                        <div className="flex items-end">
                            <Button onClick={loadAnalytics} disabled={isLoading} className="w-full">
                                {isLoading ? (
                                    <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                                ) : (
                                    <Activity className="w-4 h-4 mr-2" />
                                )}
                                Run Query
                            </Button>
                        </div>
                    </div>

                    {/* Privacy Mode Toggle */}
                    <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Eye className="w-5 h-5 text-amber-400" />
                            <div>
                                <span className="text-white font-medium">Privacy Mode</span>
                                <p className="text-sm text-white/50">
                                    {privacyMode === 'fuzzed'
                                        ? 'Locations fuzzed to ~100ft grid'
                                        : 'Exact locations (Admin only)'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setPrivacyMode('fuzzed')}
                                className={`px-4 py-2 rounded-lg transition-colors ${privacyMode === 'fuzzed'
                                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                    : 'bg-white/10 text-white/60 border border-white/10'
                                    }`}
                            >
                                <Shield className="w-4 h-4 inline mr-2" />
                                Fuzzed
                            </button>
                            <button
                                onClick={() => setPrivacyMode('exact')}
                                disabled={user?.role !== 'admin'}
                                className={`px-4 py-2 rounded-lg transition-colors ${privacyMode === 'exact'
                                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                    : 'bg-white/10 text-white/60 border border-white/10'
                                    } ${user?.role !== 'admin' ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                <MapPin className="w-4 h-4 inline mr-2" />
                                Exact {user?.role !== 'admin' && '(Admin)'}
                            </button>
                        </div>
                    </div>
                </Card>

                {/* Analytics Cards */}
                {analytics && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8"
                    >
                        <Card>
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-primary-500/20 flex items-center justify-center">
                                    <Layers className="w-6 h-6 text-primary-400" />
                                </div>
                                <div>
                                    <p className="text-sm text-white/60">Total Requests</p>
                                    <p className="text-2xl font-bold text-white">
                                        {analytics.total_requests.toLocaleString()}
                                    </p>
                                </div>
                            </div>
                        </Card>

                        <Card>
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                                    <Clock className="w-6 h-6 text-green-400" />
                                </div>
                                <div>
                                    <p className="text-sm text-white/60">Avg Resolution Time</p>
                                    <p className="text-2xl font-bold text-white">
                                        {analytics.avg_resolution_hours
                                            ? `${analytics.avg_resolution_hours.toFixed(1)}h`
                                            : 'N/A'}
                                    </p>
                                </div>
                            </div>
                        </Card>

                        <Card>
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                                    <TrendingUp className="w-6 h-6 text-amber-400" />
                                </div>
                                <div>
                                    <p className="text-sm text-white/60">Open Requests</p>
                                    <p className="text-2xl font-bold text-white">
                                        {analytics.status_distribution.open || 0}
                                    </p>
                                </div>
                            </div>
                        </Card>

                        <Card>
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                                    <BarChart3 className="w-6 h-6 text-blue-400" />
                                </div>
                                <div>
                                    <p className="text-sm text-white/60">Top Category</p>
                                    <p className="text-lg font-bold text-white truncate">
                                        {analytics.category_distribution[0]?.name || 'N/A'}
                                    </p>
                                </div>
                            </div>
                        </Card>
                    </motion.div>
                )}

                {/* Category Distribution */}
                {analytics && analytics.category_distribution.length > 0 && (
                    <Card className="mb-8">
                        <h2 className="text-lg font-semibold text-white mb-4">Category Distribution</h2>
                        <div className="space-y-3">
                            {analytics.category_distribution.slice(0, 10).map((cat, i) => (
                                <div key={cat.code} className="flex items-center gap-4">
                                    <span className="text-white/60 w-6 text-sm">{i + 1}.</span>
                                    <div className="flex-1">
                                        <div className="flex justify-between mb-1">
                                            <span className="text-white">{cat.name}</span>
                                            <span className="text-white/60">{cat.count}</span>
                                        </div>
                                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-primary-500 to-primary-400 rounded-full"
                                                style={{
                                                    width: `${(cat.count / analytics.total_requests) * 100}%`
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                )}

                {/* Export Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Export Buttons */}
                    <Card>
                        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <Download className="w-5 h-5 text-primary-400" />
                            Data Export
                        </h2>
                        <p className="text-white/60 text-sm mb-6">
                            Download sanitized data for offline analysis. All exports exclude PII
                            and respect your chosen privacy mode.
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                            <Button onClick={handleExportCSV} variant="secondary">
                                <FileText className="w-4 h-4 mr-2" />
                                Export CSV
                            </Button>
                            <Button onClick={handleExportGeoJSON} variant="secondary">
                                <Map className="w-4 h-4 mr-2" />
                                Export GeoJSON
                            </Button>
                        </div>
                    </Card>

                    {/* Code Snippets */}
                    <Card>
                        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <Code className="w-5 h-5 text-primary-400" />
                            API Code Snippets
                        </h2>
                        <div className="flex gap-2 mb-4">
                            <button
                                onClick={() => setActiveSnippet('python')}
                                className={`px-3 py-1 rounded-lg text-sm ${activeSnippet === 'python'
                                    ? 'bg-primary-500/20 text-primary-400'
                                    : 'bg-white/10 text-white/60'
                                    }`}
                            >
                                Python
                            </button>
                            <button
                                onClick={() => setActiveSnippet('r')}
                                className={`px-3 py-1 rounded-lg text-sm ${activeSnippet === 'r'
                                    ? 'bg-primary-500/20 text-primary-400'
                                    : 'bg-white/10 text-white/60'
                                    }`}
                            >
                                R
                            </button>
                        </div>
                        {codeSnippets && (
                            <div className="relative">
                                <pre className="bg-slate-900/50 rounded-lg p-4 text-sm text-green-400 overflow-x-auto max-h-48">
                                    {activeSnippet === 'python'
                                        ? codeSnippets.python
                                        : codeSnippets.r}
                                </pre>
                                <button
                                    onClick={() =>
                                        copyToClipboard(
                                            activeSnippet === 'python'
                                                ? codeSnippets.python
                                                : codeSnippets.r
                                        )
                                    }
                                    className="absolute top-2 right-2 px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-xs text-white/60"
                                >
                                    Copy
                                </button>
                            </div>
                        )}
                    </Card>
                </div>
            </main>
        </div>
    );
};
