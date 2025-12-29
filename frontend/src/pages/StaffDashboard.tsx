import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
    Menu,
    X,
    Search,
    Plus,
    AlertCircle,
    CheckCircle,
    Clock,
    FileText,
    Map,
    Sparkles,
    LogOut,
    ChevronRight,
    MapPin,
    Mail,
    Phone,
    User,
    Calendar,
    BarChart3,
} from 'lucide-react';
import { Button, Card, Modal, Input, Textarea, Select, StatusBadge, Badge } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { api } from '../services/api';
import { ServiceRequest, ServiceRequestDetail, ServiceDefinition, Statistics } from '../types';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

type View = 'active' | 'resolved' | 'all' | 'statistics';

export default function StaffDashboard() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const { settings } = useSettings();

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [currentView, setCurrentView] = useState<View>('active');
    const [requests, setRequests] = useState<ServiceRequest[]>([]);
    const [selectedRequest, setSelectedRequest] = useState<ServiceRequestDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showIntakeModal, setShowIntakeModal] = useState(false);
    const [services, setServices] = useState<ServiceDefinition[]>([]);
    const [statistics, setStatistics] = useState<Statistics | null>(null);

    // Intake form state
    const [intakeData, setIntakeData] = useState({
        service_code: '',
        description: '',
        address: '',
        first_name: '',
        last_name: '',
        phone: '',
        source: 'phone',
    });

    useEffect(() => {
        loadData();
    }, [currentView]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [requestsData, servicesData] = await Promise.all([
                api.getRequests(currentView === 'active' ? 'open' : currentView === 'resolved' ? 'closed' : undefined),
                api.getServices(),
            ]);
            setRequests(requestsData);
            setServices(servicesData);

            if (currentView === 'statistics') {
                const statsData = await api.getStatistics();
                setStatistics(statsData);
            }
        } catch (err) {
            console.error('Failed to load data:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const loadRequestDetail = async (requestId: string) => {
        try {
            const detail = await api.getRequestDetail(requestId);
            setSelectedRequest(detail);
        } catch (err) {
            console.error('Failed to load request detail:', err);
        }
    };

    const handleStatusChange = async (status: string) => {
        if (!selectedRequest) return;
        try {
            const updated = await api.updateRequestStatus(selectedRequest.service_request_id, status);
            setSelectedRequest(updated);
            loadData();
        } catch (err) {
            console.error('Failed to update status:', err);
        }
    };

    const handleCreateIntake = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.createManualIntake({
                ...intakeData,
                source: intakeData.source as 'phone' | 'walk_in' | 'email',
            });
            setShowIntakeModal(false);
            setIntakeData({
                service_code: '',
                description: '',
                address: '',
                first_name: '',
                last_name: '',
                phone: '',
                source: 'phone',
            });
            loadData();
        } catch (err) {
            console.error('Failed to create intake:', err);
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const filteredRequests = requests.filter(
        (r) =>
            r.service_request_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            r.service_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            r.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const getCounts = () => {
        const open = requests.filter((r) => r.status === 'open').length;
        const inProgress = requests.filter((r) => r.status === 'in_progress').length;
        const closed = requests.filter((r) => r.status === 'closed').length;
        return { open, inProgress, closed, total: requests.length };
    };

    const counts = getCounts();

    const menuItems = [
        { id: 'active', icon: AlertCircle, label: 'Active Incidents', count: counts.open + counts.inProgress },
        { id: 'resolved', icon: CheckCircle, label: 'Resolved', count: counts.closed },
        { id: 'all', icon: FileText, label: 'All Records', count: counts.total },
        { id: 'statistics', icon: BarChart3, label: 'Statistics', count: null },
    ];

    const COLORS = ['#ef4444', '#f59e0b', '#22c55e'];

    return (
        <div className="min-h-screen flex">
            {/* Mobile sidebar backdrop */}
            <AnimatePresence>
                {sidebarOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setSidebarOpen(false)}
                        className="fixed inset-0 bg-black/60 z-40 lg:hidden"
                    />
                )}
            </AnimatePresence>

            {/* Sidebar */}
            <aside
                className={`fixed lg:static inset-y-0 left-0 z-50 w-72 glass-sidebar transform transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
            >
                <div className="flex flex-col h-full">
                    {/* Sidebar Header */}
                    <div className="p-6 border-b border-white/10">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                {settings?.logo_url ? (
                                    <img src={settings.logo_url} alt="Logo" className="h-8 w-auto" />
                                ) : (
                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
                                        <Sparkles className="w-5 h-5 text-white" />
                                    </div>
                                )}
                                <div>
                                    <h2 className="font-semibold text-white">Staff Command</h2>
                                    <p className="text-xs text-white/50">{settings?.township_name}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSidebarOpen(false)}
                                className="lg:hidden p-2 hover:bg-white/10 rounded-lg"
                            >
                                <X className="w-5 h-5 text-white/60" />
                            </button>
                        </div>
                    </div>

                    {/* Menu Items */}
                    <nav className="flex-1 p-4 space-y-2">
                        <p className="text-xs font-medium text-white/40 uppercase tracking-wider px-3 mb-3">
                            Main
                        </p>
                        {menuItems.map((item) => (
                            <button
                                key={item.id}
                                onClick={() => {
                                    setCurrentView(item.id as View);
                                    setSelectedRequest(null);
                                    setSidebarOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors ${currentView === item.id
                                    ? 'bg-primary-500/20 text-white'
                                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <item.icon className="w-5 h-5" />
                                    <span className="font-medium">{item.label}</span>
                                </div>
                                {item.count !== null && (
                                    <Badge variant={currentView === item.id ? 'info' : 'default'}>
                                        {item.count}
                                    </Badge>
                                )}
                            </button>
                        ))}

                        <div className="pt-4">
                            <p className="text-xs font-medium text-white/40 uppercase tracking-wider px-3 mb-3">
                                Tools
                            </p>
                            <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/40 cursor-not-allowed">
                                <Map className="w-5 h-5" />
                                <span className="font-medium">GIS Maps</span>
                                <Badge variant="default">Soon</Badge>
                            </button>
                            <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/40 cursor-not-allowed">
                                <Sparkles className="w-5 h-5" />
                                <span className="font-medium">AI Analysis</span>
                                <Badge variant="default">Soon</Badge>
                            </button>
                        </div>
                    </nav>

                    {/* User Footer */}
                    <div className="p-4 border-t border-white/10">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-primary-500/30 flex items-center justify-center text-white font-medium">
                                    {user?.full_name?.charAt(0) || user?.username?.charAt(0) || 'U'}
                                </div>
                                <div>
                                    <p className="font-medium text-white text-sm">{user?.full_name || user?.username}</p>
                                    <p className="text-xs text-white/50 capitalize">{user?.role}</p>
                                </div>
                            </div>
                            <button
                                onClick={handleLogout}
                                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                                title="Sign out"
                            >
                                <LogOut className="w-5 h-5 text-white/60" />
                            </button>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Mobile Header */}
                <header className="lg:hidden glass-sidebar p-4 flex items-center justify-between sticky top-0 z-30">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="p-2 hover:bg-white/10 rounded-lg"
                    >
                        <Menu className="w-6 h-6 text-white" />
                    </button>
                    <h1 className="font-semibold text-white">Staff Dashboard</h1>
                    <div className="w-10" />
                </header>

                {/* Statistics View */}
                {currentView === 'statistics' && (
                    <div className="flex-1 p-6 overflow-auto">
                        <div className="max-w-6xl mx-auto space-y-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <Badge variant="info">Analytics Dashboard</Badge>
                                    <h1 className="text-2xl font-bold text-white mt-2">System Statistics</h1>
                                </div>
                            </div>

                            {/* Stats Cards */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                <Card className="text-center">
                                    <p className="text-3xl font-bold text-white">{statistics?.total_requests || 0}</p>
                                    <p className="text-white/60 text-sm">Total Requests</p>
                                </Card>
                                <Card className="text-center border-red-500/30">
                                    <p className="text-3xl font-bold text-red-400">{statistics?.open_requests || 0}</p>
                                    <p className="text-white/60 text-sm">Open</p>
                                </Card>
                                <Card className="text-center border-amber-500/30">
                                    <p className="text-3xl font-bold text-amber-400">{statistics?.in_progress_requests || 0}</p>
                                    <p className="text-white/60 text-sm">In Progress</p>
                                </Card>
                                <Card className="text-center border-green-500/30">
                                    <p className="text-3xl font-bold text-green-400">{statistics?.closed_requests || 0}</p>
                                    <p className="text-white/60 text-sm">Resolved</p>
                                </Card>
                            </div>

                            {/* Charts */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <Card>
                                    <h3 className="text-lg font-semibold text-white mb-4">Requests by Category</h3>
                                    <div className="h-64">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={Object.entries(statistics?.requests_by_category || {}).map(([name, count]) => ({ name, count }))}>
                                                <XAxis dataKey="name" stroke="#ffffff40" fontSize={12} />
                                                <YAxis stroke="#ffffff40" fontSize={12} />
                                                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </Card>

                                <Card>
                                    <h3 className="text-lg font-semibold text-white mb-4">Status Distribution</h3>
                                    <div className="h-64 flex items-center justify-center">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={[
                                                        { name: 'Open', value: statistics?.open_requests || 0 },
                                                        { name: 'In Progress', value: statistics?.in_progress_requests || 0 },
                                                        { name: 'Closed', value: statistics?.closed_requests || 0 },
                                                    ]}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={60}
                                                    outerRadius={80}
                                                    paddingAngle={5}
                                                    dataKey="value"
                                                >
                                                    {[0, 1, 2].map((index) => (
                                                        <Cell key={`cell-${index}`} fill={COLORS[index]} />
                                                    ))}
                                                </Pie>
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div className="flex justify-center gap-6 mt-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full bg-red-500" />
                                            <span className="text-sm text-white/60">Open</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full bg-amber-500" />
                                            <span className="text-sm text-white/60">In Progress</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full bg-green-500" />
                                            <span className="text-sm text-white/60">Closed</span>
                                        </div>
                                    </div>
                                </Card>
                            </div>
                        </div>
                    </div>
                )}

                {/* List/Detail View */}
                {currentView !== 'statistics' && (
                    <div className="flex-1 flex min-h-0">
                        {/* Request List Panel */}
                        <div className="w-full lg:w-96 flex flex-col border-r border-white/10">
                            {/* List Header */}
                            <div className="p-4 border-b border-white/10">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-lg font-semibold text-white">Incidents</h2>
                                    <Button
                                        size="sm"
                                        leftIcon={<Plus className="w-4 h-4" />}
                                        onClick={() => setShowIntakeModal(true)}
                                    >
                                        Add
                                    </Button>
                                </div>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                                    <input
                                        type="text"
                                        placeholder="Search incidents..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="glass-input pl-10 py-2 text-sm"
                                    />
                                </div>
                            </div>

                            {/* Request List */}
                            <div className="flex-1 overflow-auto">
                                {isLoading ? (
                                    <div className="flex justify-center py-12">
                                        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                ) : filteredRequests.length === 0 ? (
                                    <div className="text-center py-12 text-white/50">
                                        No incidents found
                                    </div>
                                ) : (
                                    <div className="divide-y divide-white/5">
                                        {filteredRequests.map((request) => (
                                            <motion.button
                                                key={request.id}
                                                onClick={() => loadRequestDetail(request.service_request_id)}
                                                className={`w-full text-left p-4 hover:bg-white/5 transition-colors ${selectedRequest?.service_request_id === request.service_request_id
                                                    ? 'bg-white/10'
                                                    : ''
                                                    }`}
                                                whileTap={{ scale: 0.98 }}
                                            >
                                                <div className="flex items-start justify-between mb-2">
                                                    <span className="font-mono text-xs text-white/50">
                                                        {request.service_request_id}
                                                    </span>
                                                    <StatusBadge status={request.status} />
                                                </div>
                                                <h3 className="font-medium text-white mb-1">{request.service_name}</h3>
                                                <p className="text-sm text-white/50 line-clamp-2">{request.description}</p>
                                                <div className="flex items-center gap-2 mt-2 text-xs text-white/40">
                                                    <Clock className="w-3 h-3" />
                                                    {new Date(request.requested_datetime).toLocaleDateString()}
                                                </div>
                                            </motion.button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Detail Panel */}
                        <div className="hidden lg:flex flex-1 flex-col">
                            {selectedRequest ? (
                                <div className="flex-1 overflow-auto p-6">
                                    <div className="max-w-2xl mx-auto space-y-6">
                                        {/* Header */}
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <Badge variant="info" size="md">
                                                    {selectedRequest.service_request_id}
                                                </Badge>
                                                <h1 className="text-2xl font-bold text-white mt-2">
                                                    {selectedRequest.service_name}
                                                </h1>
                                                {selectedRequest.address && (
                                                    <div className="flex items-center gap-2 mt-2 text-white/60">
                                                        <MapPin className="w-4 h-4" />
                                                        <span>{selectedRequest.address}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Status Actions */}
                                        <Card>
                                            <div className="flex flex-wrap gap-3">
                                                <Button
                                                    variant={selectedRequest.status === 'open' ? 'primary' : 'secondary'}
                                                    size="sm"
                                                    onClick={() => handleStatusChange('open')}
                                                >
                                                    Open
                                                </Button>
                                                <Button
                                                    variant={selectedRequest.status === 'in_progress' ? 'primary' : 'secondary'}
                                                    size="sm"
                                                    onClick={() => handleStatusChange('in_progress')}
                                                >
                                                    In Progress
                                                </Button>
                                                <Button
                                                    variant={selectedRequest.status === 'closed' ? 'primary' : 'secondary'}
                                                    size="sm"
                                                    onClick={() => handleStatusChange('closed')}
                                                >
                                                    Closed
                                                </Button>
                                            </div>
                                        </Card>

                                        {/* Description */}
                                        <Card>
                                            <h3 className="font-semibold text-white mb-3">Description</h3>
                                            <p className="text-white/70 whitespace-pre-wrap">
                                                {selectedRequest.description}
                                            </p>
                                        </Card>

                                        {/* Reporter Info */}
                                        <Card>
                                            <h3 className="font-semibold text-white mb-4">Reporter Information</h3>
                                            <div className="space-y-3">
                                                {(selectedRequest.first_name || selectedRequest.last_name) && (
                                                    <div className="flex items-center gap-3 text-white/70">
                                                        <User className="w-4 h-4 text-white/40" />
                                                        <span>
                                                            {selectedRequest.first_name} {selectedRequest.last_name}
                                                        </span>
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-3 text-white/70">
                                                    <Mail className="w-4 h-4 text-white/40" />
                                                    <span>{selectedRequest.email}</span>
                                                </div>
                                                {selectedRequest.phone && (
                                                    <div className="flex items-center gap-3 text-white/70">
                                                        <Phone className="w-4 h-4 text-white/40" />
                                                        <span>{selectedRequest.phone}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </Card>

                                        {/* Matched Asset (from map layers) */}
                                        {(selectedRequest as any).matched_asset && (
                                            <Card>
                                                <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                                                    <MapPin className="w-4 h-4 text-primary-400" />
                                                    Matched Asset
                                                </h3>
                                                <div className="p-4 rounded-xl bg-primary-500/10 border border-primary-500/20">
                                                    <div className="space-y-2">
                                                        <div className="flex justify-between">
                                                            <span className="text-white/50">Layer:</span>
                                                            <span className="text-white font-medium">{(selectedRequest as any).matched_asset.layer_name}</span>
                                                        </div>
                                                        {(selectedRequest as any).matched_asset.asset_id && (
                                                            <div className="flex justify-between">
                                                                <span className="text-white/50">Asset ID:</span>
                                                                <span className="text-white font-mono">{(selectedRequest as any).matched_asset.asset_id}</span>
                                                            </div>
                                                        )}
                                                        {(selectedRequest as any).matched_asset.asset_type && (
                                                            <div className="flex justify-between">
                                                                <span className="text-white/50">Type:</span>
                                                                <span className="text-white">{(selectedRequest as any).matched_asset.asset_type}</span>
                                                            </div>
                                                        )}
                                                        {(selectedRequest as any).matched_asset.distance_meters !== undefined && (
                                                            <div className="flex justify-between">
                                                                <span className="text-white/50">Distance:</span>
                                                                <span className="text-white">{(selectedRequest as any).matched_asset.distance_meters}m away</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {/* Additional properties */}
                                                    {Object.keys((selectedRequest as any).matched_asset.properties || {}).filter(k => !['asset_id', 'asset_type', 'name'].includes(k)).length > 0 && (
                                                        <div className="mt-4 pt-3 border-t border-white/10">
                                                            <p className="text-xs text-white/40 mb-2">Additional Properties:</p>
                                                            <div className="grid grid-cols-2 gap-2 text-sm">
                                                                {Object.entries((selectedRequest as any).matched_asset.properties || {})
                                                                    .filter(([k]) => !['asset_id', 'asset_type', 'name'].includes(k))
                                                                    .map(([key, value]) => (
                                                                        <div key={key} className="flex justify-between gap-2">
                                                                            <span className="text-white/50 capitalize">{key.replace(/_/g, ' ')}:</span>
                                                                            <span className="text-white truncate">{String(value)}</span>
                                                                        </div>
                                                                    ))
                                                                }
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </Card>
                                        )}

                                        {/* Timeline */}
                                        <Card>
                                            <h3 className="font-semibold text-white mb-4">Timeline</h3>
                                            <div className="space-y-3">
                                                <div className="flex items-center gap-3 text-white/70">
                                                    <Calendar className="w-4 h-4 text-white/40" />
                                                    <span>Created: {new Date(selectedRequest.requested_datetime).toLocaleString()}</span>
                                                </div>
                                                {selectedRequest.updated_datetime && (
                                                    <div className="flex items-center gap-3 text-white/70">
                                                        <Clock className="w-4 h-4 text-white/40" />
                                                        <span>Updated: {new Date(selectedRequest.updated_datetime).toLocaleString()}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </Card>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex-1 flex items-center justify-center text-white/40">
                                    <div className="text-center">
                                        <FileText className="w-16 h-16 mx-auto mb-4 opacity-50" />
                                        <p>Select an incident to view details</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Manual Intake Modal */}
            <Modal isOpen={showIntakeModal} onClose={() => setShowIntakeModal(false)} title="New Manual Intake">
                <form onSubmit={handleCreateIntake} className="space-y-4">
                    <Select
                        label="Service Category"
                        options={[
                            { value: '', label: 'Select a category...' },
                            ...services.map((s) => ({ value: s.service_code, label: s.service_name })),
                        ]}
                        value={intakeData.service_code}
                        onChange={(e) => setIntakeData((prev) => ({ ...prev, service_code: e.target.value }))}
                        required
                    />
                    <Input
                        label="Location"
                        placeholder="Address or intersection"
                        value={intakeData.address}
                        onChange={(e) => setIntakeData((prev) => ({ ...prev, address: e.target.value }))}
                    />
                    <Textarea
                        label="Description"
                        placeholder="Describe the issue..."
                        value={intakeData.description}
                        onChange={(e) => setIntakeData((prev) => ({ ...prev, description: e.target.value }))}
                        required
                    />
                    <Select
                        label="Source"
                        options={[
                            { value: 'phone', label: 'Phone Call' },
                            { value: 'walk_in', label: 'Walk-In' },
                            { value: 'email', label: 'Email' },
                        ]}
                        value={intakeData.source}
                        onChange={(e) => setIntakeData((prev) => ({ ...prev, source: e.target.value }))}
                    />
                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="ghost" onClick={() => setShowIntakeModal(false)}>
                            Cancel
                        </Button>
                        <Button type="submit">Create Intake</Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
