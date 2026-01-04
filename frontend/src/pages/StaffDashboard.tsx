import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
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
    MapPin,
    Mail,
    Phone,
    User,
    Calendar,
    BarChart3,
    MessageSquare,
    Trash2,
    Eye,
    EyeOff,
    Send,
    Camera,
    Link,
    Brain,
    LayoutDashboard,
    Users,
    ChevronDown,
    Check,
    ExternalLink,
} from 'lucide-react';
import { Button, Card, Modal, Input, Textarea, Select, StatusBadge, Badge } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { api, MapLayer } from '../services/api';
import { ServiceRequest, ServiceRequestDetail, ServiceDefinition, Statistics, RequestComment, ClosedSubstatus, User as UserType, Department, AuditLogEntry } from '../types';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import StaffDashboardMap from '../components/StaffDashboardMap';
import RequestDetailMap from '../components/RequestDetailMap';

type View = 'dashboard' | 'active' | 'in_progress' | 'resolved' | 'statistics';

export default function StaffDashboard() {
    const navigate = useNavigate();
    const { requestId: urlRequestId } = useParams<{ requestId?: string }>();
    const { user, logout } = useAuth();
    const { settings } = useSettings();

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [currentView, setCurrentView] = useState<View>('dashboard');
    const [requests, setRequests] = useState<ServiceRequest[]>([]);
    const [allRequests, setAllRequests] = useState<ServiceRequest[]>([]); // For dashboard map
    const [selectedRequest, setSelectedRequest] = useState<ServiceRequestDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showIntakeModal, setShowIntakeModal] = useState(false);
    const [services, setServices] = useState<ServiceDefinition[]>([]);
    const [statistics, setStatistics] = useState<Statistics | null>(null);

    // Dashboard-specific state
    const [departments, setDepartments] = useState<Department[]>([]);
    const [users, setUsers] = useState<UserType[]>([]);
    const [mapLayers, setMapLayers] = useState<MapLayer[]>([]);
    const [mapsConfig, setMapsConfig] = useState<{ google_maps_api_key: string | null; township_boundary: object | null; default_center?: { lat: number; lng: number } } | null>(null);

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

    // Comments state
    const [comments, setComments] = useState<RequestComment[]>([]);
    const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
    const [newComment, setNewComment] = useState('');
    const [commentVisibility, setCommentVisibility] = useState<'internal' | 'external'>('internal');
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);

    // Delete modal state
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteJustification, setDeleteJustification] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    // Closed substatus state
    const [showClosedModal, setShowClosedModal] = useState(false);
    const [closedSubstatus, setClosedSubstatus] = useState<ClosedSubstatus>('resolved');
    const [completionMessage, setCompletionMessage] = useState('');
    const [completionPhotoUrl, setCompletionPhotoUrl] = useState('');

    // Lightbox modal state
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

    // Assignment editing state
    const [editAssignment, setEditAssignment] = useState<{ departmentId: number | null; assignedTo: string | null } | null>(null);
    const [isSavingAssignment, setIsSavingAssignment] = useState(false);

    // Filter states
    const [filterDepartment, setFilterDepartment] = useState<number | null>(null);
    const [filterService, setFilterService] = useState<string | null>(null);
    const [filterAssignment, setFilterAssignment] = useState<'all' | 'me' | 'department'>('all');
    const [showFilters, setShowFilters] = useState(false);

    // Share link state
    const [showShareMenu, setShowShareMenu] = useState(false);
    const [copiedLink, setCopiedLink] = useState<'staff' | 'resident' | null>(null);

    // Get current user's department IDs
    const userDepartmentIds = useMemo(() => {
        return user?.departments?.map(d => d.id) || [];
    }, [user]);

    // Filtered and sorted requests based on current view and filters
    const filteredSortedRequests = useMemo(() => {
        // First, filter by status based on current view
        let filtered = allRequests.filter(r => {
            if (currentView === 'active') return r.status === 'open';
            if (currentView === 'in_progress') return r.status === 'in_progress';
            if (currentView === 'resolved') return r.status === 'closed';
            return true; // dashboard shows all
        });

        // Apply search filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(r =>
                r.service_request_id.toLowerCase().includes(query) ||
                r.description?.toLowerCase().includes(query) ||
                r.address?.toLowerCase().includes(query) ||
                r.service_name?.toLowerCase().includes(query)
            );
        }

        // Apply department filter
        if (filterDepartment !== null) {
            filtered = filtered.filter(r => r.assigned_department_id === filterDepartment);
        }

        // Apply service filter
        if (filterService !== null) {
            filtered = filtered.filter(r => r.service_code === filterService);
        }

        // Apply assignment filter
        if (filterAssignment === 'me' && user) {
            filtered = filtered.filter(r => r.assigned_to === user.username);
        } else if (filterAssignment === 'department' && userDepartmentIds.length > 0) {
            // Only show in "dept" if assigned to my department but NOT to a specific person
            filtered = filtered.filter(r =>
                r.assigned_department_id &&
                userDepartmentIds.includes(r.assigned_department_id) &&
                !r.assigned_to  // No specific staff assigned = All Department Staff
            );
        }

        // Sort by priority: assigned to me -> my department -> others, then by date
        filtered.sort((a, b) => {
            // Priority score: lower is higher priority
            const getPriority = (r: ServiceRequest) => {
                if (user && r.assigned_to === user.username) return 0; // Assigned specifically to me
                // My department, but no specific person assigned (All Department Staff)
                if (r.assigned_department_id && userDepartmentIds.includes(r.assigned_department_id) && !r.assigned_to) return 1;
                return 2; // Others (including requests assigned to specific people in my dept who are not me)
            };

            const priorityDiff = getPriority(a) - getPriority(b);
            if (priorityDiff !== 0) return priorityDiff;

            // Secondary sort by requested_datetime (newest first)
            return new Date(b.requested_datetime).getTime() - new Date(a.requested_datetime).getTime();
        });

        return filtered;
    }, [allRequests, currentView, searchQuery, filterDepartment, filterService, filterAssignment, user, userDepartmentIds]);

    // Quick stats for the current view
    const quickStats = useMemo(() => {
        const viewRequests = allRequests.filter(r => {
            if (currentView === 'active') return r.status === 'open';
            if (currentView === 'in_progress') return r.status === 'in_progress';
            if (currentView === 'resolved') return r.status === 'closed';
            return true;
        });

        const assignedToMe = viewRequests.filter(r => user && r.assigned_to === user.username).length;
        // Only count as "dept" if no specific person assigned (All Department Staff)
        const inMyDepartment = viewRequests.filter(r =>
            r.assigned_department_id && userDepartmentIds.includes(r.assigned_department_id) && !r.assigned_to
        ).length;
        const total = viewRequests.length;

        return { assignedToMe, inMyDepartment, total };
    }, [allRequests, currentView, user, userDepartmentIds]);

    // Clear all filters
    const clearFilters = () => {
        setSearchQuery('');
        setFilterDepartment(null);
        setFilterService(null);
        setFilterAssignment('all');
    };

    const hasActiveFilters = searchQuery.trim() || filterDepartment !== null || filterService !== null || filterAssignment !== 'all';

    useEffect(() => {
        // Initial load - only fetch once
        loadInitialData();
    }, []);

    // Separate effect for statistics (only loads when needed)
    useEffect(() => {
        if (currentView === 'statistics' && !statistics) {
            loadStatistics();
        }
    }, [currentView]);

    // Auto-load request if URL contains requestId
    useEffect(() => {
        if (urlRequestId) {
            loadRequestDetail(urlRequestId);
        }
    }, [urlRequestId]);

    const loadInitialData = async () => {
        setIsLoading(true);
        try {
            const [allRequestsData, servicesData, depts, usersData, layers, config] = await Promise.all([
                api.getRequests(), // Fetch ALL requests once
                api.getServices(),
                api.getDepartments(),
                api.getStaffMembers(), // Staff-accessible endpoint
                api.getMapLayers(),
                api.getMapsConfig(),
            ]);
            setAllRequests(allRequestsData);
            setRequests(allRequestsData); // Initial set
            setServices(servicesData);
            setDepartments(depts);
            setUsers(usersData);
            console.log('Loaded users:', usersData.length, usersData);  // Debug log
            setMapLayers(layers);
            setMapsConfig(config);
        } catch (err) {
            console.error('Failed to load data:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const loadStatistics = async () => {
        try {
            const statsData = await api.getStatistics();
            setStatistics(statsData);
        } catch (err) {
            console.error('Failed to load statistics:', err);
        }
    };

    const loadRequestDetail = async (requestId: string) => {
        try {
            const detail = await api.getRequestDetail(requestId);
            setSelectedRequest(detail);
            // Load comments and audit log for this request
            loadComments(detail.id);
            loadAuditLog(requestId);
        } catch (err) {
            console.error('Failed to load request detail:', err);
        }
    };

    const handleStatusChange = async (status: string) => {
        if (!selectedRequest) return;

        // If closing, show modal to select substatus
        if (status === 'closed') {
            setShowClosedModal(true);
            return;
        }

        try {
            const updated = await api.updateRequest(selectedRequest.service_request_id, { status });
            setSelectedRequest(updated);
            // Optimistic update: update list immediately without full reload
            setAllRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
            setRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
            loadAuditLog(selectedRequest.service_request_id);
        } catch (err) {
            console.error('Failed to update status:', err);
        }
    };

    const handleCloseWithSubstatus = async () => {
        if (!selectedRequest) return;
        try {
            const updated = await api.updateRequest(selectedRequest.service_request_id, {
                status: 'closed',
                closed_substatus: closedSubstatus,
                completion_message: completionMessage || undefined,
                completion_photo_url: closedSubstatus === 'resolved' ? completionPhotoUrl || undefined : undefined,
            });
            setSelectedRequest(updated);
            // Optimistic update: update list immediately without full reload
            setAllRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
            setRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
            setShowClosedModal(false);
            setClosedSubstatus('resolved');
            setCompletionMessage('');
            setCompletionPhotoUrl('');
            loadAuditLog(selectedRequest.service_request_id);
        } catch (err) {
            console.error('Failed to close request:', err);
        }
    };

    const loadComments = async (requestId: number) => {
        try {
            const commentsData = await api.getComments(requestId);
            setComments(commentsData);
        } catch (err) {
            console.error('Failed to load comments:', err);
        }
    };

    const loadAuditLog = async (requestId: string) => {
        try {
            const logData = await api.getAuditLog(requestId);
            setAuditLog(logData);
        } catch (err) {
            // Fallback - audit log may not exist for older requests
            console.log('Audit log not available (may be older request):', err);
            setAuditLog([]);
        }
    };

    const handleAddComment = async () => {
        if (!selectedRequest || !newComment.trim()) return;
        setIsSubmittingComment(true);
        try {
            await api.createComment(selectedRequest.id, newComment.trim(), commentVisibility);
            setNewComment('');
            loadComments(selectedRequest.id);
        } catch (err) {
            console.error('Failed to add comment:', err);
        } finally {
            setIsSubmittingComment(false);
        }
    };

    const handleDeleteRequest = async () => {
        if (!selectedRequest || !deleteJustification.trim()) return;
        setIsDeleting(true);
        try {
            await api.deleteRequest(selectedRequest.service_request_id, deleteJustification.trim());
            setShowDeleteModal(false);
            setDeleteJustification('');
            setSelectedRequest(null);
            loadInitialData();
        } catch (err) {
            console.error('Failed to delete request:', err);
        } finally {
            setIsDeleting(false);
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
            loadInitialData();
        } catch (err) {
            console.error('Failed to create intake:', err);
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    // Old simple search filter removed - now using filteredSortedRequests above

    const getCounts = () => {
        const open = requests.filter((r) => r.status === 'open').length;
        const inProgress = requests.filter((r) => r.status === 'in_progress').length;
        const closed = requests.filter((r) => r.status === 'closed').length;
        return { open, inProgress, closed, total: requests.length };
    };

    const counts = getCounts();

    const menuItems = [
        { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', count: null },
        { id: 'active', icon: AlertCircle, label: 'Open', count: counts.open },
        { id: 'in_progress', icon: Clock, label: 'In Progress', count: counts.inProgress },
        { id: 'resolved', icon: CheckCircle, label: 'Completed', count: counts.closed },
        { id: 'statistics', icon: BarChart3, label: 'Statistics', count: null },
    ];

    // Use the comprehensive filteredSortedRequests (defined above) for the list
    const sortedRequests = filteredSortedRequests;

    // Calculate dashboard stats
    const dashboardStats = useMemo(() => {
        const myRequests = allRequests.filter(r => (r as any).assigned_to === user?.username);
        const myActive = myRequests.filter(r => r.status === 'open').length;
        const myInProgress = myRequests.filter(r => r.status === 'in_progress').length;

        // Department requests would need department_id on requests - using total for now
        return {
            myActive,
            myInProgress,
            deptActive: counts.open, // Would filter by department if available
            totalActive: counts.open,
            totalInProgress: counts.inProgress,
        };
    }, [allRequests, user, counts]);

    const handleMapRequestSelect = (requestId: string) => {
        loadRequestDetail(requestId);
        setCurrentView('active'); // Switch to list view to see details
    };

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

                {/* Dashboard View */}
                {currentView === 'dashboard' && (
                    <div className="flex-1 flex flex-col p-4 lg:p-6 overflow-auto">
                        {/* Map Section */}
                        <div className="flex-1 min-h-[400px] lg:min-h-[500px] mb-6 rounded-xl overflow-hidden">
                            {mapsConfig?.google_maps_api_key ? (
                                <StaffDashboardMap
                                    apiKey={mapsConfig.google_maps_api_key}
                                    requests={allRequests}
                                    services={services}
                                    departments={departments}
                                    users={users}
                                    mapLayers={mapLayers}
                                    townshipBoundary={mapsConfig.township_boundary}
                                    defaultCenter={mapsConfig.default_center}
                                    onRequestSelect={handleMapRequestSelect}
                                />
                            ) : (
                                <div className="h-full flex items-center justify-center bg-white/5 rounded-xl border border-white/10">
                                    <div className="text-center p-8">
                                        <Map className="w-12 h-12 mx-auto mb-4 text-white/30" />
                                        <p className="text-white/60">Google Maps API key not configured</p>
                                        <p className="text-white/40 text-sm mt-2">Configure in Admin Console → API Keys</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Stats Cards - Clickable */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <button
                                onClick={() => setCurrentView('active')}
                                className="text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
                            >
                                <Card className="text-center border-primary-500/30 hover:border-primary-500/60 cursor-pointer transition-colors">
                                    <p className="text-3xl font-bold text-primary-400">{dashboardStats.myActive}</p>
                                    <p className="text-white/60 text-sm">Assigned to You</p>
                                </Card>
                            </button>
                            <button
                                onClick={() => setCurrentView('active')}
                                className="text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
                            >
                                <Card className="text-center border-blue-500/30 hover:border-blue-500/60 cursor-pointer transition-colors">
                                    <p className="text-3xl font-bold text-blue-400">{dashboardStats.deptActive}</p>
                                    <p className="text-white/60 text-sm">Your Department</p>
                                </Card>
                            </button>
                            <button
                                onClick={() => setCurrentView('active')}
                                className="text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
                            >
                                <Card className="text-center border-red-500/30 hover:border-red-500/60 cursor-pointer transition-colors">
                                    <p className="text-3xl font-bold text-red-400">{dashboardStats.totalActive}</p>
                                    <p className="text-white/60 text-sm">All Open</p>
                                </Card>
                            </button>
                            <button
                                onClick={() => setCurrentView('in_progress')}
                                className="text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
                            >
                                <Card className="text-center border-amber-500/30 hover:border-amber-500/60 cursor-pointer transition-colors">
                                    <p className="text-3xl font-bold text-amber-400">{dashboardStats.totalInProgress}</p>
                                    <p className="text-white/60 text-sm">In Progress</p>
                                </Card>
                            </button>
                        </div>
                    </div>
                )}

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
                {currentView !== 'statistics' && currentView !== 'dashboard' && (
                    <div className="flex-1 flex min-h-0">
                        {/* Request List Panel */}
                        <div className="w-full lg:w-96 flex flex-col border-r border-white/10">
                            {/* List Header with Quick Stats */}
                            <div className="p-4 border-b border-white/10 space-y-3">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-lg font-semibold text-white">Incidents</h2>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => setShowFilters(!showFilters)}
                                            className={hasActiveFilters ? 'text-primary-400' : ''}
                                        >
                                            <Search className="w-4 h-4" />
                                            {hasActiveFilters && <span className="ml-1 text-xs">•</span>}
                                        </Button>
                                    </div>
                                </div>

                                {/* Assignment Filter Buttons - Premium Styling */}
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setFilterAssignment('me')}
                                        className={`flex-1 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${filterAssignment === 'me'
                                            ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/40 ring-2 ring-primary-400/60'
                                            : 'bg-white/5 border border-white/15 text-white/80 hover:bg-white/10 hover:text-white hover:border-white/25'
                                            }`}
                                    >
                                        My Requests ({quickStats.assignedToMe})
                                    </button>
                                    <button
                                        onClick={() => setFilterAssignment('department')}
                                        className={`flex-1 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${filterAssignment === 'department'
                                            ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-lg shadow-purple-500/40 ring-2 ring-purple-400/60'
                                            : 'bg-white/5 border border-white/15 text-white/80 hover:bg-white/10 hover:text-white hover:border-white/25'
                                            }`}
                                    >
                                        My Department ({quickStats.inMyDepartment})
                                    </button>
                                    <button
                                        onClick={() => setFilterAssignment('all')}
                                        className={`flex-1 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${filterAssignment === 'all'
                                            ? 'bg-gradient-to-r from-slate-500 to-slate-600 text-white shadow-lg shadow-slate-500/40 ring-2 ring-slate-400/60'
                                            : 'bg-white/5 border border-white/15 text-white/80 hover:bg-white/10 hover:text-white hover:border-white/25'
                                            }`}
                                    >
                                        All Requests ({quickStats.total})
                                    </button>
                                </div>

                                {/* Search Input */}
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                                    <input
                                        type="text"
                                        placeholder="Search by ID, description, address..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="glass-input pl-10 py-2 text-sm"
                                    />
                                    {searchQuery && (
                                        <button
                                            onClick={() => setSearchQuery('')}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>

                                {/* Advanced Filters Panel */}
                                {showFilters && (
                                    <div className="space-y-3 pt-2 border-t border-white/10">
                                        {/* Department Filter */}
                                        <div>
                                            <label className="text-xs text-white/50 mb-1 block">Department</label>
                                            <select
                                                value={filterDepartment ?? ''}
                                                onChange={(e) => setFilterDepartment(e.target.value ? Number(e.target.value) : null)}
                                                className="glass-input text-sm py-2"
                                            >
                                                <option value="">All Departments</option>
                                                {departments.map(d => (
                                                    <option key={d.id} value={d.id}>{d.name}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Service Category Filter */}
                                        <div>
                                            <label className="text-xs text-white/50 mb-1 block">Category</label>
                                            <select
                                                value={filterService ?? ''}
                                                onChange={(e) => setFilterService(e.target.value || null)}
                                                className="glass-input text-sm py-2"
                                            >
                                                <option value="">All Categories</option>
                                                {services.map(s => (
                                                    <option key={s.service_code} value={s.service_code}>{s.service_name}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Clear Filters */}
                                        {hasActiveFilters && (
                                            <button
                                                onClick={clearFilters}
                                                className="text-xs text-primary-400 hover:text-primary-300"
                                            >
                                                Clear all filters
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Request List */}
                            <div className="flex-1 overflow-auto">
                                {isLoading ? (
                                    <div className="flex justify-center py-12">
                                        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                ) : sortedRequests.length === 0 ? (
                                    <div className="text-center py-12 text-white/50">
                                        No incidents found
                                    </div>
                                ) : (
                                    <div className="divide-y divide-white/5">
                                        {sortedRequests.map((request) => (
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
                                                <div className="flex items-center justify-between mt-2">
                                                    <div className="flex items-center gap-2 text-xs text-white/40">
                                                        <Clock className="w-3 h-3" />
                                                        {new Date(request.requested_datetime).toLocaleDateString()}
                                                    </div>
                                                    {/* Priority indicator */}
                                                    {request.assigned_to === user?.username ? (
                                                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary-500/20 text-primary-400">
                                                            🎯 Mine
                                                        </span>
                                                    ) : request.assigned_department_id && userDepartmentIds.includes(request.assigned_department_id) && !request.assigned_to ? (
                                                        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400">
                                                            🏢 Dept
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </motion.button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Detail Panel - Simplified Unified Layout */}
                        <div className="hidden lg:flex flex-1 flex-col">
                            {selectedRequest ? (
                                <div className="flex-1 flex flex-col">
                                    {/* Sticky Header with Actions & Assignment - Premium Glass Style */}
                                    <div className="sticky top-0 z-10 bg-gradient-to-b from-slate-900/95 via-slate-800/95 to-slate-800/90 backdrop-blur-md border-b border-white/10 p-4 space-y-3">
                                        {/* Row 1: Title and ID */}
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-mono text-xs text-white/50 bg-white/5 px-2 py-0.5 rounded">{selectedRequest.service_request_id}</span>
                                                    <StatusBadge status={selectedRequest.status} />
                                                </div>
                                                <h1 className="text-lg font-semibold text-white truncate">{selectedRequest.service_name}</h1>
                                            </div>
                                        </div>

                                        {/* Row 2: Assignment Dropdowns */}
                                        <div className="flex items-center gap-2">
                                            <select
                                                value={editAssignment?.departmentId ?? selectedRequest.assigned_department_id ?? ''}
                                                onChange={(e) => { const val = e.target.value ? Number(e.target.value) : null; setEditAssignment(prev => ({ departmentId: val, assignedTo: prev?.assignedTo ?? selectedRequest.assigned_to ?? null })); }}
                                                className="flex-1 py-2 px-3 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/25 transition-all [&>option]:bg-slate-800 [&>option]:text-white"
                                            >
                                                <option value="" className="text-white/50">Select a department...</option>
                                                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                            </select>
                                            <select
                                                value={editAssignment?.assignedTo ?? selectedRequest.assigned_to ?? ''}
                                                onChange={(e) => { const val = e.target.value; setEditAssignment(prev => ({ departmentId: prev?.departmentId ?? selectedRequest.assigned_department_id ?? null, assignedTo: val })); }}
                                                className="flex-1 py-2 px-3 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/25 transition-all [&>option]:bg-slate-800 [&>option]:text-white"
                                            >
                                                <option value="">All staff in department</option>
                                                {(() => {
                                                    const deptId = editAssignment?.departmentId ?? selectedRequest.assigned_department_id;
                                                    const filteredUsers = deptId ? users.filter(u => u.departments?.some(d => d.id === deptId)) : users;
                                                    return filteredUsers.map(u => (
                                                        <option key={u.id} value={u.username}>
                                                            {u.full_name || u.username} (@{u.username})
                                                        </option>
                                                    ));
                                                })()}
                                            </select>
                                            {editAssignment && (
                                                <button onClick={async () => {
                                                    setIsSavingAssignment(true);
                                                    try {
                                                        const updated = await api.updateRequest(selectedRequest.service_request_id, {
                                                            assigned_department_id: editAssignment.departmentId ?? undefined,
                                                            assigned_to: editAssignment.assignedTo === null ? '' : editAssignment.assignedTo
                                                        });
                                                        setSelectedRequest(updated);
                                                        // Optimistic update: update the request in both lists
                                                        setAllRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
                                                        setRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
                                                        setEditAssignment(null);
                                                        loadAuditLog(selectedRequest.service_request_id);
                                                    } catch (err) {
                                                        console.error(err);
                                                    } finally {
                                                        setIsSavingAssignment(false);
                                                    }
                                                }} disabled={isSavingAssignment} className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium disabled:opacity-50 transition-all shadow-lg shadow-primary-500/20">{isSavingAssignment ? 'Saving...' : 'Save'}</button>
                                            )}
                                        </div>

                                        {/* Row 3: Status Actions */}
                                        <div className="flex gap-2">
                                            <button onClick={() => handleStatusChange('open')} className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${selectedRequest.status === 'open' ? 'bg-gradient-to-r from-purple-500 to-violet-600 text-white shadow-lg shadow-purple-500/30 ring-2 ring-white/20' : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white'}`}>Open</button>
                                            <button onClick={() => handleStatusChange('in_progress')} className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${selectedRequest.status === 'in_progress' ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30 ring-2 ring-white/20' : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white'}`}>In Progress</button>
                                            <button onClick={() => handleStatusChange('closed')} className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${selectedRequest.status === 'closed' ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30 ring-2 ring-white/20' : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white'}`}>Closed</button>
                                        </div>
                                    </div>

                                    {/* Scrollable Content - Professional Government Styling */}
                                    <div className="flex-1 overflow-auto p-4 space-y-4">

                                        {/* ═══ SECTION 1: Request Details (Description + AI + Photos) ═══ */}
                                        <div className="p-4 rounded-lg bg-slate-800/50 border border-white/10">
                                            {/* Description */}
                                            <p className="text-white/90 leading-relaxed mb-4">{selectedRequest.description}</p>

                                            {/* AI Analysis - Integrated */}
                                            {selectedRequest.vertex_ai_summary && (
                                                <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 mb-4">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Brain className="w-4 h-4 text-purple-400" />
                                                        <span className="text-xs font-medium text-purple-400 uppercase">AI Analysis</span>
                                                    </div>
                                                    <p className="text-white/80 text-sm mb-2">{selectedRequest.vertex_ai_summary}</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {selectedRequest.vertex_ai_classification && (
                                                            <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-xs">{selectedRequest.vertex_ai_classification}</span>
                                                        )}
                                                        {selectedRequest.vertex_ai_priority_score && (
                                                            <span className="text-xs text-white/50">Priority: {selectedRequest.vertex_ai_priority_score.toFixed(1)}/10</span>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Photos */}
                                            {selectedRequest.media_urls && selectedRequest.media_urls.length > 0 && (
                                                <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
                                                    {selectedRequest.media_urls.map((url, i) => (
                                                        <img key={i} src={url} alt={`Photo ${i + 1}`} className="w-28 h-20 flex-shrink-0 object-cover rounded-lg cursor-pointer hover:opacity-80" onClick={() => setLightboxUrl(url)} />
                                                    ))}
                                                </div>
                                            )}

                                            {/* Completion info */}
                                            {selectedRequest.status === 'closed' && (selectedRequest.completion_message || selectedRequest.completion_photo_url) && (
                                                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 mb-4">
                                                    <p className="text-green-400 font-medium text-sm mb-1">✓ {selectedRequest.closed_substatus === 'resolved' ? 'Resolved' : selectedRequest.closed_substatus === 'no_action' ? 'No Action Needed' : 'Referred'}</p>
                                                    {selectedRequest.completion_message && (
                                                        <p className="text-white/70 text-sm mb-2">{selectedRequest.completion_message}</p>
                                                    )}
                                                    {selectedRequest.completion_photo_url && (
                                                        <img
                                                            src={selectedRequest.completion_photo_url}
                                                            alt="Completion photo"
                                                            className="rounded-lg max-h-64 object-contain cursor-pointer hover:opacity-90 transition-opacity"
                                                            onClick={() => selectedRequest.completion_photo_url && window.open(selectedRequest.completion_photo_url, '_blank')}
                                                        />
                                                    )}
                                                </div>
                                            )}

                                            {/* Reporter Info - Simple inline */}
                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/60 pt-3 border-t border-white/10">
                                                {(selectedRequest.first_name || selectedRequest.last_name) && (
                                                    <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> {selectedRequest.first_name} {selectedRequest.last_name}</span>
                                                )}
                                                <a href={`mailto:${selectedRequest.email}`} className="flex items-center gap-1 hover:text-primary-400"><Mail className="w-3.5 h-3.5" /> {selectedRequest.email}</a>
                                                {selectedRequest.phone && (
                                                    <a href={`tel:${selectedRequest.phone}`} className="flex items-center gap-1 hover:text-primary-400"><Phone className="w-3.5 h-3.5" /> {selectedRequest.phone}</a>
                                                )}
                                            </div>
                                        </div>

                                        {/* ═══ SECTION 2: Location & Map ═══ */}
                                        {(selectedRequest.address || selectedRequest.lat) && (
                                            <div className="p-4 rounded-lg bg-slate-800/50 border border-white/10">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <MapPin className="w-4 h-4 text-blue-400" />
                                                    <span className="font-medium text-white">Location</span>
                                                </div>
                                                {selectedRequest.address && (
                                                    <p className="text-white/80 mb-3">{selectedRequest.address}</p>
                                                )}
                                                {/* Interactive Google Maps with Asset Overlay */}
                                                {selectedRequest.lat && selectedRequest.long && mapsConfig?.google_maps_api_key && (
                                                    <div className="rounded-lg overflow-hidden h-64 bg-slate-900">
                                                        <RequestDetailMap
                                                            lat={selectedRequest.lat}
                                                            lng={selectedRequest.long}
                                                            matchedAsset={(selectedRequest as any).matched_asset}
                                                            mapLayers={mapLayers}
                                                            apiKey={mapsConfig.google_maps_api_key}
                                                        />
                                                    </div>
                                                )}
                                                {/* Fallback for no API key */}
                                                {selectedRequest.lat && selectedRequest.long && !mapsConfig?.google_maps_api_key && (
                                                    <div className="rounded-lg overflow-hidden h-48 bg-slate-900">
                                                        <iframe
                                                            width="100%"
                                                            height="100%"
                                                            style={{ border: 0 }}
                                                            loading="lazy"
                                                            src={`https://www.google.com/maps?q=${selectedRequest.lat},${selectedRequest.long}&z=17&output=embed`}
                                                        />
                                                    </div>
                                                )}

                                                {/* Matched Asset Info - Below Map */}
                                                {(selectedRequest as any).matched_asset && (
                                                    <div className="mt-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                                                        {/* Clear header label */}
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500/70">🔗 Matched Asset</span>
                                                            {(selectedRequest as any).matched_asset.distance_meters && (
                                                                <span className="text-xs text-white/40 ml-auto">
                                                                    {(selectedRequest as any).matched_asset.distance_meters < 1
                                                                        ? '<1m away'
                                                                        : `${Math.round((selectedRequest as any).matched_asset.distance_meters)}m away`}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <div className="w-3 h-3 rounded bg-emerald-500" />
                                                            <span className="text-sm font-medium text-emerald-400">
                                                                {(selectedRequest as any).matched_asset.layer_name}
                                                            </span>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                                                            {(selectedRequest as any).matched_asset.asset_id && (
                                                                <>
                                                                    <span className="text-white/40">Asset ID</span>
                                                                    <span className="text-white/80 font-mono">{(selectedRequest as any).matched_asset.asset_id}</span>
                                                                </>
                                                            )}
                                                            {(selectedRequest as any).matched_asset.asset_type && (
                                                                <>
                                                                    <span className="text-white/40">Type</span>
                                                                    <span className="text-white/80">{(selectedRequest as any).matched_asset.asset_type}</span>
                                                                </>
                                                            )}
                                                            {(selectedRequest as any).matched_asset.properties &&
                                                                Object.entries((selectedRequest as any).matched_asset.properties)
                                                                    .filter(([key, value]) => {
                                                                        // Exclude common ID fields
                                                                        if (['id', 'asset_id', 'name', 'layer_name', 'objectid', 'fid', 'gid'].includes(key.toLowerCase())) return false;
                                                                        // Exclude purely numeric values (likely IDs)
                                                                        if (typeof value === 'number' && String(value).match(/^\d+$/)) return false;
                                                                        // Exclude null/undefined/empty
                                                                        if (value === null || value === undefined || value === '') return false;
                                                                        return true;
                                                                    })
                                                                    .slice(0, 6)
                                                                    .map(([key, value]) => (
                                                                        <React.Fragment key={key}>
                                                                            <span className="text-white/40 truncate">
                                                                                {key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim()}
                                                                            </span>
                                                                            <span className="text-white/80 truncate">
                                                                                {String(value)}
                                                                            </span>
                                                                        </React.Fragment>
                                                                    ))
                                                            }
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}


                                        {/* ═══ SECTION 4: Timeline ═══ */}
                                        <div className="p-4 rounded-lg bg-slate-800/50 border border-white/10">
                                            <div className="flex items-center gap-2 mb-4">
                                                <Clock className="w-4 h-4 text-blue-400" />
                                                <span className="font-medium text-white">Timeline</span>
                                                {auditLog.length > 0 && (
                                                    <span className="px-2 py-0.5 rounded-full text-xs bg-white/10 text-white/60">{auditLog.length} events</span>
                                                )}
                                            </div>

                                            {/* Timeline */}
                                            <div className="relative">
                                                <div className="space-y-3">
                                                    {/* Always show submitted event first, even if not in audit log */}
                                                    {(() => {
                                                        const hasSubmittedEvent = auditLog.some(e => e.action === 'submitted');
                                                        const timelineEntries = hasSubmittedEvent ? auditLog : [
                                                            {
                                                                id: -1,
                                                                service_request_id: 0,
                                                                action: 'submitted' as const,
                                                                new_value: 'open',
                                                                old_value: null,
                                                                actor_type: 'resident' as const,
                                                                actor_name: 'Resident',
                                                                created_at: selectedRequest.requested_datetime,
                                                                extra_data: null
                                                            },
                                                            ...auditLog
                                                        ];

                                                        return timelineEntries.map((entry, idx) => {
                                                            // Determine color and text based on action - simple circles, no emojis
                                                            let actionConfig: { color: string; text: string };

                                                            if (entry.action === 'submitted') {
                                                                actionConfig = { color: 'bg-emerald-500', text: 'Request submitted' };
                                                            } else if (entry.action === 'status_change') {
                                                                // Show both old and new status for clarity
                                                                const oldStatus = entry.old_value || 'unknown';
                                                                const newStatus = entry.new_value || 'unknown';
                                                                let statusText = '';

                                                                if (newStatus === 'closed') {
                                                                    const substatus = entry.extra_data?.substatus;
                                                                    statusText = `Closed ${substatus === 'resolved' ? '- Resolved' : substatus === 'no_action' ? '- No Action Needed' : substatus === 'third_party' ? '- Third Party' : ''}`;
                                                                } else if (newStatus === 'in_progress') {
                                                                    statusText = oldStatus === 'closed' ? 'Reopened as In Progress' : 'Marked as In Progress';
                                                                } else if (newStatus === 'open') {
                                                                    statusText = oldStatus === 'closed' ? 'Reopened' : oldStatus === 'in_progress' ? 'Reverted to Open' : 'Status set to Open';
                                                                } else {
                                                                    statusText = `Status: ${oldStatus} → ${newStatus}`;
                                                                }

                                                                actionConfig = {
                                                                    color: newStatus === 'closed' ? 'bg-emerald-500' : newStatus === 'in_progress' ? 'bg-blue-500' : 'bg-purple-500',
                                                                    text: statusText
                                                                };
                                                            } else if (entry.action === 'department_assigned') {
                                                                actionConfig = { color: 'bg-purple-500', text: `Assigned to ${entry.new_value}` };
                                                            } else if (entry.action === 'staff_assigned') {
                                                                actionConfig = { color: 'bg-indigo-500', text: `Assigned to ${entry.new_value}` };
                                                            } else if (entry.action === 'comment_added') {
                                                                actionConfig = { color: 'bg-teal-500', text: 'Comment added' };
                                                            } else {
                                                                actionConfig = { color: 'bg-gray-500', text: entry.action };
                                                            }

                                                            const isLast = idx === auditLog.length - 1;

                                                            return (
                                                                <div key={entry.id} className="relative flex items-start gap-3 pl-0">
                                                                    {/* Simple circle indicator - centered on line */}
                                                                    <div className={`w-3.5 h-3.5 rounded-full ${actionConfig.color} shadow-sm ${isLast ? 'ring-2 ring-white/30' : ''}`} />

                                                                    {/* Content */}
                                                                    <div className="flex-1 min-w-0 -mt-0.5">
                                                                        <div className="flex items-center gap-2 flex-wrap">
                                                                            <span className="text-white/90 text-sm font-medium">{actionConfig.text}</span>
                                                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${entry.actor_type === 'staff' ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/20 text-blue-300'}`}>
                                                                                {entry.actor_type === 'staff' ? entry.actor_name || 'Staff' : 'Resident'}
                                                                            </span>
                                                                        </div>
                                                                        <div className="text-white/40 text-xs mt-0.5">
                                                                            {entry.created_at ? new Date(entry.created_at).toLocaleString() : 'No timestamp'}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        });
                                                    })()}
                                                </div>
                                            </div>
                                        </div>

                                        {/* ═══ SECTION 5: Comments ═══ */}
                                        <div className="p-4 rounded-lg bg-slate-800/50 border border-white/10">
                                            <div className="flex items-center gap-2 mb-4">
                                                <MessageSquare className="w-4 h-4 text-blue-400" />
                                                <span className="font-medium text-white">Comments</span>
                                                {comments.length > 0 && (
                                                    <span className="px-2 py-0.5 rounded-full text-xs bg-white/10 text-white/60">{comments.length}</span>
                                                )}
                                            </div>

                                            {/* Comments List */}
                                            {comments.length > 0 && (
                                                <div className="space-y-3 max-h-64 overflow-y-auto mb-4 pr-1">
                                                    {comments.map(c => (
                                                        <div key={c.id} className={`rounded-lg overflow-hidden ${c.visibility === 'internal' ? 'bg-orange-500/5' : 'bg-slate-700/30'}`}>
                                                            {/* Comment Header */}
                                                            <div className={`px-3 py-2 flex items-center gap-2 text-xs ${c.visibility === 'internal' ? 'bg-orange-500/10 border-b border-orange-500/20' : 'bg-slate-600/30 border-b border-white/5'}`}>
                                                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${c.visibility === 'internal' ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                                                    {c.username?.charAt(0).toUpperCase() || '?'}
                                                                </div>
                                                                <span className="font-medium text-white/90">{c.username}</span>
                                                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${c.visibility === 'internal' ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400'}`}>
                                                                    {c.visibility === 'internal' ? 'Internal' : 'Public'}
                                                                </span>
                                                                <span className="text-white/30 ml-auto">{c.created_at ? new Date(c.created_at).toLocaleString() : ''}</span>
                                                            </div>
                                                            {/* Comment Body */}
                                                            <div className="px-3 py-2.5">
                                                                <p className="text-sm text-white/80 leading-relaxed">{c.content}</p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {comments.length === 0 && (
                                                <div className="text-center py-6 text-white/30 text-sm mb-4">
                                                    No comments yet
                                                </div>
                                            )}

                                            {/* Add Comment */}
                                            <div className={`rounded-lg overflow-hidden ${commentVisibility === 'internal' ? 'bg-orange-950/20 border border-orange-500/20' : 'bg-green-950/20 border border-green-500/20'}`}>
                                                <div className="px-3 py-2 flex items-center gap-2 border-b border-white/5">
                                                    <span className={`text-xs font-semibold ${commentVisibility === 'internal' ? 'text-orange-400' : 'text-green-400'}`}>
                                                        {commentVisibility === 'internal' ? '🔒 Internal Note - Staff Only' : '🌐 Public Reply - Visible to Reporter'}
                                                    </span>
                                                    <button
                                                        onClick={() => setCommentVisibility(commentVisibility === 'internal' ? 'external' : 'internal')}
                                                        className={`ml-auto px-2 py-1 rounded text-xs font-medium transition-all ${commentVisibility === 'internal' ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'}`}
                                                    >
                                                        Switch to {commentVisibility === 'internal' ? 'Public' : 'Internal'}
                                                    </button>
                                                </div>
                                                <div className="p-3 flex gap-2">
                                                    <input
                                                        type="text"
                                                        placeholder={commentVisibility === 'internal' ? 'Add internal note...' : 'Reply to reporter...'}
                                                        value={newComment}
                                                        onChange={(e) => setNewComment(e.target.value)}
                                                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAddComment()}
                                                        className="flex-1 py-2 px-3 rounded-lg bg-slate-900/50 border border-white/10 text-white text-sm placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                    />
                                                    <button
                                                        onClick={handleAddComment}
                                                        disabled={!newComment.trim() || isSubmittingComment}
                                                        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-2 transition-colors"
                                                    >
                                                        <Send className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* ═══ Actions Footer ═══ */}
                                        <div className="p-4 rounded-lg bg-slate-800/50 border border-white/10">
                                            <div className="flex gap-3">
                                                {/* Share Link Dropdown */}
                                                <div className="relative flex-1">
                                                    <button
                                                        onClick={() => setShowShareMenu(!showShareMenu)}
                                                        className="w-full py-2.5 px-4 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                                                    >
                                                        <Link className="w-4 h-4" />
                                                        Share Link
                                                        <ChevronDown className={`w-4 h-4 transition-transform ${showShareMenu ? 'rotate-180' : ''}`} />
                                                    </button>

                                                    {showShareMenu && (
                                                        <div className="absolute bottom-full left-0 right-0 mb-2 bg-slate-800 rounded-lg border border-white/10 shadow-xl overflow-hidden z-20">
                                                            <button
                                                                onClick={() => {
                                                                    navigator.clipboard.writeText(`${window.location.origin}/staff/request/${selectedRequest.service_request_id}`);
                                                                    setCopiedLink('staff');
                                                                    setTimeout(() => { setCopiedLink(null); setShowShareMenu(false); }, 1500);
                                                                }}
                                                                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors text-left"
                                                            >
                                                                <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                                                                    {copiedLink === 'staff' ? <Check className="w-4 h-4 text-green-400" /> : <Link className="w-4 h-4 text-purple-400" />}
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="text-sm font-medium text-white">
                                                                        {copiedLink === 'staff' ? 'Copied!' : 'Staff Portal Link'}
                                                                    </div>
                                                                    <div className="text-xs text-white/40 truncate">For internal staff use</div>
                                                                </div>
                                                            </button>
                                                            <div className="border-t border-white/5" />
                                                            <button
                                                                onClick={() => {
                                                                    navigator.clipboard.writeText(`${window.location.origin}/track/${selectedRequest.service_request_id}`);
                                                                    setCopiedLink('resident');
                                                                    setTimeout(() => { setCopiedLink(null); setShowShareMenu(false); }, 1500);
                                                                }}
                                                                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors text-left"
                                                            >
                                                                <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                                                                    {copiedLink === 'resident' ? <Check className="w-4 h-4 text-green-400" /> : <ExternalLink className="w-4 h-4 text-blue-400" />}
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="text-sm font-medium text-white">
                                                                        {copiedLink === 'resident' ? 'Copied!' : 'Resident Portal Link'}
                                                                    </div>
                                                                    <div className="text-xs text-white/40 truncate">Share with the reporter</div>
                                                                </div>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                <button onClick={() => setShowDeleteModal(true)} className="py-2.5 px-4 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-medium flex items-center gap-2 transition-colors">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex-1 flex items-center justify-center text-white/40">
                                    <div className="text-center">
                                        <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                        <p className="text-sm">Select an incident</p>
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

            {/* Close Request Modal - Substatus Selection */}
            <Modal isOpen={showClosedModal} onClose={() => setShowClosedModal(false)} title="Close Request">
                <div className="space-y-6">
                    <p className="text-white/70 text-sm">Select a resolution type for this request:</p>

                    <div className="space-y-3">
                        <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${closedSubstatus === 'no_action' ? 'bg-orange-500/10 border-orange-500/30' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                            <input
                                type="radio"
                                name="closedSubstatus"
                                value="no_action"
                                checked={closedSubstatus === 'no_action'}
                                onChange={() => setClosedSubstatus('no_action')}
                                className="mt-1"
                            />
                            <div>
                                <p className="font-medium text-white">No Action Needed</p>
                                <p className="text-sm text-white/50">Issue doesn't require township intervention</p>
                            </div>
                        </label>

                        <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${closedSubstatus === 'resolved' ? 'bg-green-500/10 border-green-500/30' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                            <input
                                type="radio"
                                name="closedSubstatus"
                                value="resolved"
                                checked={closedSubstatus === 'resolved'}
                                onChange={() => setClosedSubstatus('resolved')}
                                className="mt-1"
                            />
                            <div>
                                <p className="font-medium text-white">Resolved</p>
                                <p className="text-sm text-white/50">Issue has been fixed by township staff</p>
                            </div>
                        </label>

                        <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${closedSubstatus === 'third_party' ? 'bg-blue-500/10 border-blue-500/30' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                            <input
                                type="radio"
                                name="closedSubstatus"
                                value="third_party"
                                checked={closedSubstatus === 'third_party'}
                                onChange={() => setClosedSubstatus('third_party')}
                                className="mt-1"
                            />
                            <div>
                                <p className="font-medium text-white">Third Party Contacted</p>
                                <p className="text-sm text-white/50">Referred to utility company, state agency, etc.</p>
                            </div>
                        </label>
                    </div>

                    <Textarea
                        label="Completion Message (optional)"
                        placeholder="Add a message about the resolution..."
                        value={completionMessage}
                        onChange={(e) => setCompletionMessage(e.target.value)}
                    />

                    {closedSubstatus === 'resolved' && (
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-white/70">Completion Photo (optional)</label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="file"
                                    accept="image/*"
                                    id="completion-photo-upload"
                                    className="hidden"
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            try {
                                                const result = await api.uploadImage(file);
                                                setCompletionPhotoUrl(result.url);
                                            } catch (err) {
                                                console.error('Upload failed:', err);
                                                alert('Failed to upload image');
                                            }
                                        }
                                    }}
                                />
                                <label
                                    htmlFor="completion-photo-upload"
                                    className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm cursor-pointer hover:bg-white/20 transition-colors flex items-center gap-2"
                                >
                                    <Camera className="w-4 h-4" />
                                    {completionPhotoUrl ? 'Change Photo' : 'Upload Photo'}
                                </label>
                                {completionPhotoUrl && (
                                    <div className="flex items-center gap-2">
                                        <img src={completionPhotoUrl} alt="Completion" className="h-12 w-12 object-cover rounded-lg" />
                                        <button
                                            onClick={() => setCompletionPhotoUrl('')}
                                            className="text-red-400 hover:text-red-300 text-sm"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="ghost" onClick={() => setShowClosedModal(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleCloseWithSubstatus}>
                            Close Request
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Delete Request Modal */}
            <Modal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Delete Request">
                <div className="space-y-4">
                    <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                        <p className="text-red-400 font-medium flex items-center gap-2">
                            <Trash2 className="w-5 h-5" />
                            This will soft-delete the request
                        </p>
                        <p className="text-white/60 text-sm mt-2">
                            The request will be hidden from the normal view but will remain accessible to administrators.
                        </p>
                    </div>

                    <Textarea
                        label="Justification *"
                        placeholder="Explain why this request should be deleted (minimum 10 characters)..."
                        value={deleteJustification}
                        onChange={(e) => setDeleteJustification(e.target.value)}
                        required
                    />

                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="ghost" onClick={() => setShowDeleteModal(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="danger"
                            onClick={handleDeleteRequest}
                            disabled={deleteJustification.length < 10 || isDeleting}
                        >
                            {isDeleting ? 'Deleting...' : 'Delete Request'}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Premium Photo Lightbox Modal */}
            {lightboxUrl && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8"
                    onClick={() => setLightboxUrl(null)}
                >
                    {/* Backdrop with blur */}
                    <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" />

                    {/* Close button */}
                    <button
                        onClick={() => setLightboxUrl(null)}
                        className="absolute top-4 right-4 md:top-6 md:right-6 z-20 p-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 transition-all duration-300 group"
                    >
                        <X className="w-6 h-6 text-white group-hover:rotate-90 transition-transform duration-300" />
                    </button>

                    {/* Image container with premium styling */}
                    <div
                        className="relative z-10 max-w-[90vw] max-h-[85vh] rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/20"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Gradient glow effect behind image */}
                        <div className="absolute -inset-1 bg-gradient-to-r from-primary-500/30 via-purple-500/30 to-primary-500/30 blur-xl opacity-50" />

                        {/* Image */}
                        <img
                            src={lightboxUrl}
                            alt="Full size preview"
                            className="relative max-w-full max-h-[85vh] object-contain bg-gray-900/50 rounded-2xl"
                        />
                    </div>

                    {/* Instructions */}
                    <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/50 text-sm">
                        Click anywhere to close
                    </p>
                </div>
            )}
        </div>
    );
}
