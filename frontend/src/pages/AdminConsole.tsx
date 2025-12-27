import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
    Menu,
    X,
    Palette,
    Users,
    Grid3X3,
    Key,
    Puzzle,
    LogOut,
    Save,
    Trash2,
    Plus,
    RefreshCw,
    Sparkles,
    Check,
    AlertTriangle,
    RotateCcw,
    Mail,
    MessageSquare,
    Building2,
    Edit,
} from 'lucide-react';
import { Button, Card, Modal, Input, Select, Badge } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { api } from '../services/api';
import { User, ServiceDefinition, SystemSettings, SystemSecret, Department } from '../types';

type Tab = 'branding' | 'users' | 'departments' | 'services' | 'secrets' | 'modules';

export default function AdminConsole() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const { settings, refreshSettings } = useSettings();

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [currentTab, setCurrentTab] = useState<Tab>('branding');
    const [isLoading, setIsLoading] = useState(false);
    const [saveMessage, setSaveMessage] = useState<string | null>(null);

    // Branding state
    const [brandingForm, setBrandingForm] = useState<Partial<SystemSettings>>({});

    // Users state
    const [users, setUsers] = useState<User[]>([]);
    const [showUserModal, setShowUserModal] = useState(false);
    const [newUser, setNewUser] = useState({
        username: '',
        email: '',
        full_name: '',
        password: '',
        role: 'staff' as 'staff' | 'admin',
        department_ids: [] as number[],
    });

    // Services state
    const [services, setServices] = useState<ServiceDefinition[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [showServiceModal, setShowServiceModal] = useState(false);
    const [editingService, setEditingService] = useState<ServiceDefinition | null>(null);
    const [newService, setNewService] = useState({
        service_code: '',
        service_name: '',
        description: '',
        icon: 'AlertCircle',
    });

    // Service routing edit state
    const [showServiceEditModal, setShowServiceEditModal] = useState(false);
    const [serviceRouting, setServiceRouting] = useState({
        routing_mode: 'township' as 'township' | 'third_party' | 'road_based',
        assigned_department_id: null as number | null,
        routing_config: {
            url: '',
            message: '',
            default: 'township' as 'township' | 'third_party',
            township_roads: '',
            county_roads: '',
            third_party_url: '',
            third_party_message: '',
        },
    });

    // Department management state
    const [showDepartmentModal, setShowDepartmentModal] = useState(false);
    const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
    const [newDepartment, setNewDepartment] = useState({
        name: '',
        description: '',
        routing_email: '',
    });

    // Secrets state
    const [secrets, setSecrets] = useState<SystemSecret[]>([]);
    const [secretValues, setSecretValues] = useState<Record<string, string>>({});

    // Modules state
    const [modules, setModules] = useState({ ai_analysis: false, sms_alerts: false, email_notifications: false });

    // Password reset state
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [passwordResetUser, setPasswordResetUser] = useState<User | null>(null);
    const [newPassword, setNewPassword] = useState('');

    // Update in progress
    const [isUpdating, setIsUpdating] = useState(false);
    const [updateMessage, setUpdateMessage] = useState<string | null>(null);

    useEffect(() => {
        if (settings) {
            setBrandingForm({
                township_name: settings.township_name,
                logo_url: settings.logo_url || '',
                favicon_url: settings.favicon_url || '',
                hero_text: settings.hero_text,
                primary_color: settings.primary_color,
            });
            setModules({
                ai_analysis: settings.modules?.ai_analysis || false,
                sms_alerts: settings.modules?.sms_alerts || false,
                email_notifications: settings.modules?.email_notifications || false,
            });
        }
    }, [settings]);

    useEffect(() => {
        loadTabData();
    }, [currentTab]);

    const loadTabData = async () => {
        setIsLoading(true);
        try {
            switch (currentTab) {
                case 'users':
                    const [usersData, userDepts] = await Promise.all([
                        api.getUsers(),
                        api.getDepartments(),
                    ]);
                    setUsers(usersData);
                    setDepartments(userDepts);
                    break;
                case 'departments':
                    const deptsOnly = await api.getDepartments();
                    setDepartments(deptsOnly);
                    break;
                case 'services':
                    const [servicesData, deptsData] = await Promise.all([
                        api.getServices(),
                        api.getDepartments(),
                    ]);
                    setServices(servicesData);
                    setDepartments(deptsData);
                    break;
                case 'secrets':
                    const secretsData = await api.getSecrets();
                    setSecrets(secretsData);
                    break;
            }
        } catch (err) {
            console.error('Failed to load data:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveBranding = async () => {
        setIsLoading(true);
        try {
            await api.updateSettings(brandingForm);
            await refreshSettings();
            setSaveMessage('Branding saved successfully');
            setTimeout(() => setSaveMessage(null), 3000);
        } catch (err) {
            console.error('Failed to save branding:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            // Clean up data - remove empty strings and send proper format
            const userData = {
                username: newUser.username,
                email: newUser.email,
                password: newUser.password,
                role: newUser.role,
                full_name: newUser.full_name || undefined,
                department_ids: newUser.department_ids.length > 0 ? newUser.department_ids : undefined,
            };
            await api.createUser(userData as any);
            setShowUserModal(false);
            setNewUser({ username: '', email: '', full_name: '', password: '', role: 'staff', department_ids: [] });
            loadTabData();
        } catch (err: any) {
            console.error('Failed to create user:', err);
            alert(err.message || 'Failed to create user');
        }
    };

    const handleDeleteUser = async (userId: number) => {
        if (!confirm('Are you sure you want to delete this user?')) return;
        try {
            await api.deleteUser(userId);
            loadTabData();
        } catch (err) {
            console.error('Failed to delete user:', err);
        }
    };

    const handleCreateService = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.createService(newService);
            setShowServiceModal(false);
            setNewService({ service_code: '', service_name: '', description: '', icon: 'AlertCircle' });
            loadTabData();
        } catch (err) {
            console.error('Failed to create service:', err);
        }
    };

    const handleDeleteService = async (serviceId: number) => {
        if (!confirm('Are you sure you want to delete this service?')) return;
        try {
            await api.deleteService(serviceId);
            loadTabData();
        } catch (err) {
            console.error('Failed to delete service:', err);
        }
    };

    const handleEditService = (service: ServiceDefinition) => {
        setEditingService(service);
        const config = service.routing_config || {};
        setServiceRouting({
            routing_mode: service.routing_mode || 'township',
            assigned_department_id: service.assigned_department_id || null,
            routing_config: {
                url: config.url || '',
                message: config.message || '',
                default: config.default || 'township',
                township_roads: config.township_roads?.join(', ') || '',
                county_roads: config.county_roads?.join(', ') || '',
                third_party_url: config.third_party_url || '',
                third_party_message: config.third_party_message || '',
            },
        });
        setShowServiceEditModal(true);
    };

    const handleSaveServiceRouting = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingService) return;

        try {
            const config: Record<string, any> = {};
            if (serviceRouting.routing_mode === 'third_party') {
                config.url = serviceRouting.routing_config.url;
                config.message = serviceRouting.routing_config.message;
            } else if (serviceRouting.routing_mode === 'road_based') {
                config.default = serviceRouting.routing_config.default;
                config.township_roads = serviceRouting.routing_config.township_roads
                    .split(',').map(r => r.trim()).filter(Boolean);
                config.county_roads = serviceRouting.routing_config.county_roads
                    .split(',').map(r => r.trim()).filter(Boolean);
                config.third_party_url = serviceRouting.routing_config.third_party_url;
                config.third_party_message = serviceRouting.routing_config.third_party_message;
            }

            await api.updateService(editingService.id, {
                routing_mode: serviceRouting.routing_mode,
                routing_config: config,
                assigned_department_id: serviceRouting.assigned_department_id || undefined,
            });

            setShowServiceEditModal(false);
            setEditingService(null);
            loadTabData();
            setSaveMessage('Service routing updated!');
            setTimeout(() => setSaveMessage(''), 3000);
        } catch (err: any) {
            console.error('Failed to update service:', err);
            alert(err.message || 'Failed to update service');
        }
    };

    // Department handlers
    const handleCreateDepartment = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingDepartment) {
                await api.updateDepartment(editingDepartment.id, newDepartment);
            } else {
                await api.createDepartment(newDepartment);
            }
            setShowDepartmentModal(false);
            setEditingDepartment(null);
            setNewDepartment({ name: '', description: '', routing_email: '' });
            loadTabData();
        } catch (err) {
            console.error('Failed to save department:', err);
        }
    };

    const handleEditDepartment = (dept: Department) => {
        setEditingDepartment(dept);
        setNewDepartment({
            name: dept.name,
            description: dept.description || '',
            routing_email: dept.routing_email || '',
        });
        setShowDepartmentModal(true);
    };

    const handleDeleteDepartment = async (deptId: number) => {
        if (!confirm('Are you sure you want to delete this department?')) return;
        try {
            await api.deleteDepartment(deptId);
            loadTabData();
        } catch (err) {
            console.error('Failed to delete department:', err);
        }
    };

    const handleUpdateSecret = async (keyName: string) => {
        const value = secretValues[keyName];
        if (!value) return;
        try {
            await api.updateSecret(keyName, value);
            setSecretValues((prev) => ({ ...prev, [keyName]: '' }));
            loadTabData();
        } catch (err) {
            console.error('Failed to update secret:', err);
        }
    };

    const handleSaveSecretDirect = async (keyName: string, value: string) => {
        try {
            await api.updateSecret(keyName, value);
            loadTabData();
        } catch (err) {
            console.error('Failed to update secret:', err);
        }
    };

    const handleSaveModules = async () => {
        setIsLoading(true);
        try {
            await api.updateSettings({ modules });
            await refreshSettings();
            setSaveMessage('Modules saved successfully');
            setTimeout(() => setSaveMessage(null), 3000);
        } catch (err) {
            console.error('Failed to save modules:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSystemUpdate = async () => {
        if (!confirm('This will pull updates from GitHub and rebuild the system. Continue?')) return;
        setIsUpdating(true);
        setUpdateMessage('Pulling updates...');
        try {
            const result = await api.updateSystem();
            setUpdateMessage(result.message);
        } catch (err) {
            setUpdateMessage('Update failed: ' + (err as Error).message);
        } finally {
            setIsUpdating(false);
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!passwordResetUser || !newPassword) return;
        try {
            await api.resetUserPassword(passwordResetUser.id, newPassword);
            setShowPasswordModal(false);
            setPasswordResetUser(null);
            setNewPassword('');
            setSaveMessage(`Password reset for ${passwordResetUser.username}`);
            setTimeout(() => setSaveMessage(null), 3000);
        } catch (err) {
            console.error('Failed to reset password:', err);
        }
    };

    const openPasswordReset = (u: User) => {
        setPasswordResetUser(u);
        setNewPassword('');
        setShowPasswordModal(true);
    };

    const tabs = [
        { id: 'branding', icon: Palette, label: 'Branding' },
        { id: 'users', icon: Users, label: 'Users' },
        { id: 'departments', icon: Building2, label: 'Departments' },
        { id: 'services', icon: Grid3X3, label: 'Service Categories' },
        { id: 'secrets', icon: Key, label: 'API Keys' },
        { id: 'modules', icon: Puzzle, label: 'Modules' },
    ];

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
                    {/* Header */}
                    <div className="p-6 border-b border-white/10">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center">
                                    <Sparkles className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h2 className="font-semibold text-white">Admin Console</h2>
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

                    {/* Menu */}
                    <nav className="flex-1 p-4 space-y-2">
                        <p className="text-xs font-medium text-white/40 uppercase tracking-wider px-3 mb-3">
                            Configuration
                        </p>
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => {
                                    setCurrentTab(tab.id as Tab);
                                    setSidebarOpen(false);
                                }}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${currentTab === tab.id
                                    ? 'bg-primary-500/20 text-white'
                                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                                    }`}
                            >
                                <tab.icon className="w-5 h-5" />
                                <span className="font-medium">{tab.label}</span>
                            </button>
                        ))}

                        {/* System Update Button */}
                        <div className="pt-6">
                            <p className="text-xs font-medium text-white/40 uppercase tracking-wider px-3 mb-3">
                                System
                            </p>
                            <Button
                                variant="secondary"
                                size="sm"
                                className="w-full"
                                leftIcon={<RefreshCw className={`w-4 h-4 ${isUpdating ? 'animate-spin' : ''}`} />}
                                onClick={handleSystemUpdate}
                                disabled={isUpdating}
                            >
                                {isUpdating ? 'Updating...' : 'Pull Updates'}
                            </Button>
                            {updateMessage && (
                                <p className="mt-2 text-xs text-center text-white/60">{updateMessage}</p>
                            )}
                        </div>
                    </nav>

                    {/* User Footer */}
                    <div className="p-4 border-t border-white/10">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-amber-500/30 flex items-center justify-center text-white font-medium">
                                    A
                                </div>
                                <div>
                                    <p className="font-medium text-white text-sm">{user?.full_name || 'Administrator'}</p>
                                    <p className="text-xs text-amber-400">Admin</p>
                                </div>
                            </div>
                            <button
                                onClick={handleLogout}
                                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
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
                    <button onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-white/10 rounded-lg">
                        <Menu className="w-6 h-6 text-white" />
                    </button>
                    <h1 className="font-semibold text-white">Admin Console</h1>
                    <div className="w-10" />
                </header>

                {/* Content */}
                <div className="flex-1 p-6 overflow-auto">
                    <div className="max-w-4xl mx-auto">
                        {/* Save message */}
                        <AnimatePresence>
                            {saveMessage && (
                                <motion.div
                                    initial={{ opacity: 0, y: -20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    className="mb-6 flex items-center gap-3 p-4 rounded-xl bg-green-500/20 border border-green-500/30 text-green-300"
                                >
                                    <Check className="w-5 h-5" />
                                    {saveMessage}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Branding Tab */}
                        {currentTab === 'branding' && (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <h1 className="text-2xl font-bold text-white">Branding Settings</h1>
                                    <Button leftIcon={<Save className="w-4 h-4" />} onClick={handleSaveBranding} isLoading={isLoading}>
                                        Save Changes
                                    </Button>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    <Card>
                                        <div className="space-y-4">
                                            <Input
                                                label="Municipality Name"
                                                value={brandingForm.township_name || ''}
                                                onChange={(e) => setBrandingForm((p) => ({ ...p, township_name: e.target.value }))}
                                            />
                                            <Input
                                                label="Hero Text"
                                                value={brandingForm.hero_text || ''}
                                                onChange={(e) => setBrandingForm((p) => ({ ...p, hero_text: e.target.value }))}
                                            />
                                            <Input
                                                label="Logo URL"
                                                value={brandingForm.logo_url || ''}
                                                onChange={(e) => setBrandingForm((p) => ({ ...p, logo_url: e.target.value }))}
                                            />
                                            <Input
                                                label="Favicon URL"
                                                value={brandingForm.favicon_url || ''}
                                                onChange={(e) => setBrandingForm((p) => ({ ...p, favicon_url: e.target.value }))}
                                            />
                                            <div>
                                                <label className="block text-sm font-medium text-white/70 mb-2">
                                                    Primary Color
                                                </label>
                                                <div className="flex items-center gap-3">
                                                    <input
                                                        type="color"
                                                        value={brandingForm.primary_color || '#6366f1'}
                                                        onChange={(e) => setBrandingForm((p) => ({ ...p, primary_color: e.target.value }))}
                                                        className="w-12 h-12 rounded-lg cursor-pointer bg-transparent"
                                                    />
                                                    <Input
                                                        value={brandingForm.primary_color || '#6366f1'}
                                                        onChange={(e) => setBrandingForm((p) => ({ ...p, primary_color: e.target.value }))}
                                                        className="flex-1"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </Card>

                                    <Card>
                                        <h3 className="text-lg font-semibold text-white mb-4">Preview</h3>
                                        <div className="p-4 rounded-xl bg-black/20 space-y-4">
                                            {brandingForm.logo_url ? (
                                                <img src={brandingForm.logo_url} alt="Logo preview" className="h-16" />
                                            ) : (
                                                <div
                                                    className="w-16 h-16 rounded-2xl flex items-center justify-center"
                                                    style={{ background: `linear-gradient(135deg, ${brandingForm.primary_color}, ${brandingForm.primary_color}dd)` }}
                                                >
                                                    <Sparkles className="w-8 h-8 text-white" />
                                                </div>
                                            )}
                                            <h2 className="text-xl font-bold text-white">{brandingForm.township_name}</h2>
                                            <p className="text-white/60">{brandingForm.hero_text}</p>
                                        </div>
                                    </Card>
                                </div>
                            </div>
                        )}

                        {/* Users Tab */}
                        {currentTab === 'users' && (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <h1 className="text-2xl font-bold text-white">User Management</h1>
                                    <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowUserModal(true)}>
                                        Add User
                                    </Button>
                                </div>

                                <Card className="p-0 overflow-hidden">
                                    <table className="w-full">
                                        <thead className="border-b border-white/10">
                                            <tr>
                                                <th className="text-left p-4 text-white/60 font-medium">User</th>
                                                <th className="text-left p-4 text-white/60 font-medium">Email</th>
                                                <th className="text-left p-4 text-white/60 font-medium">Role</th>
                                                <th className="text-right p-4 text-white/60 font-medium">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {users.map((u) => (
                                                <tr key={u.id} className="hover:bg-white/5">
                                                    <td className="p-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-full bg-primary-500/30 flex items-center justify-center text-white font-medium">
                                                                {u.username.charAt(0).toUpperCase()}
                                                            </div>
                                                            <div>
                                                                <p className="font-medium text-white">{u.username}</p>
                                                                <p className="text-sm text-white/50">{u.full_name}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-white/70">{u.email}</td>
                                                    <td className="p-4">
                                                        <Badge variant={u.role === 'admin' ? 'warning' : 'info'}>
                                                            {u.role}
                                                        </Badge>
                                                    </td>
                                                    <td className="p-4 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => openPasswordReset(u)}
                                                                title="Reset password"
                                                            >
                                                                <RotateCcw className="w-4 h-4" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => handleDeleteUser(u.id)}
                                                                disabled={u.id === user?.id}
                                                                title="Delete user"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </Card>
                            </div>
                        )}
                        {/* Departments Tab */}
                        {currentTab === 'departments' && (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <h1 className="text-2xl font-bold text-white">Departments</h1>
                                    <Button
                                        leftIcon={<Plus className="w-4 h-4" />}
                                        onClick={() => {
                                            setEditingDepartment(null);
                                            setNewDepartment({ name: '', description: '', routing_email: '' });
                                            setShowDepartmentModal(true);
                                        }}
                                    >
                                        Add Department
                                    </Button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {departments.map((dept) => (
                                        <Card key={dept.id} className="relative group">
                                            <div className="flex items-start gap-4">
                                                <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-300">
                                                    <Building2 className="w-6 h-6" />
                                                </div>
                                                <div className="flex-1">
                                                    <h3 className="font-semibold text-white">{dept.name}</h3>
                                                    <p className="text-sm text-white/50 mt-1">{dept.description || 'No description'}</p>
                                                    {dept.routing_email && (
                                                        <p className="text-xs text-white/30 mt-2 font-mono">{dept.routing_email}</p>
                                                    )}
                                                </div>
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={() => handleEditDepartment(dept)}
                                                        className="opacity-0 group-hover:opacity-100 p-2 hover:bg-white/10 rounded-lg transition-all"
                                                    >
                                                        <Edit className="w-4 h-4 text-white/60" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteDepartment(dept.id)}
                                                        className="opacity-0 group-hover:opacity-100 p-2 hover:bg-red-500/20 rounded-lg transition-all"
                                                    >
                                                        <Trash2 className="w-4 h-4 text-red-400" />
                                                    </button>
                                                </div>
                                            </div>
                                        </Card>
                                    ))}
                                </div>

                                {departments.length === 0 && (
                                    <Card className="text-center py-8">
                                        <Building2 className="w-12 h-12 mx-auto text-white/20 mb-3" />
                                        <p className="text-white/50">No departments yet. Add your first department to organize staff.</p>
                                    </Card>
                                )}
                            </div>
                        )}

                        {/* Services Tab */}
                        {currentTab === 'services' && (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <h1 className="text-2xl font-bold text-white">Service Categories</h1>
                                    <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => setShowServiceModal(true)}>
                                        Add Category
                                    </Button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {services.map((service) => (
                                        <Card key={service.id} className="relative group">
                                            <div className="flex items-start gap-4">
                                                <div className="w-12 h-12 rounded-xl bg-primary-500/20 flex items-center justify-center text-primary-300">
                                                    <Grid3X3 className="w-6 h-6" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="font-semibold text-white">{service.service_name}</h3>
                                                    <p className="text-sm text-white/50 mt-1 line-clamp-2">{service.description}</p>
                                                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                                                        <span className="text-xs text-white/30 font-mono">{service.service_code}</span>
                                                        {service.routing_mode && service.routing_mode !== 'township' && (
                                                            <Badge variant={service.routing_mode === 'third_party' ? 'warning' : 'info'}>
                                                                {service.routing_mode === 'third_party' ? '3rd Party' : 'Road-Based'}
                                                            </Badge>
                                                        )}
                                                        {service.assigned_department && (
                                                            <Badge variant="default">{service.assigned_department.name}</Badge>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={() => handleEditService(service)}
                                                        className="opacity-0 group-hover:opacity-100 p-2 hover:bg-white/10 rounded-lg transition-all"
                                                        title="Configure routing"
                                                    >
                                                        <Edit className="w-4 h-4 text-white/60" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteService(service.id)}
                                                        className="opacity-0 group-hover:opacity-100 p-2 hover:bg-red-500/20 rounded-lg transition-all"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="w-4 h-4 text-red-400" />
                                                    </button>
                                                </div>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Secrets Tab */}
                        {currentTab === 'secrets' && (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <h1 className="text-2xl font-bold text-white">Integrations & API Keys</h1>
                                </div>

                                {/* SMS Provider Section */}
                                <Card>
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                                            <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                                                <Key className="w-5 h-5 text-green-400" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-white">SMS Notifications</h3>
                                                <p className="text-sm text-white/50">Send text message alerts to residents</p>
                                            </div>
                                        </div>

                                        {/* SMS Provider Selection */}
                                        <div className="space-y-4">
                                            <Select
                                                label="SMS Provider"
                                                options={[
                                                    { value: 'none', label: 'Disabled' },
                                                    { value: 'twilio', label: 'Twilio' },
                                                    { value: 'http', label: 'Custom HTTP API' },
                                                ]}
                                                value={secrets.find(s => s.key_name === 'SMS_PROVIDER')?.key_value || 'none'}
                                                onChange={(e) => {
                                                    handleSaveSecretDirect('SMS_PROVIDER', e.target.value);
                                                }}
                                            />

                                            {/* Twilio Fields */}
                                            {secrets.find(s => s.key_name === 'SMS_PROVIDER')?.key_value === 'twilio' && (
                                                <div className="space-y-4 p-4 rounded-xl bg-white/5 border border-white/10">
                                                    <div className="text-sm text-blue-300 flex items-start gap-2 mb-4">
                                                        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                                        <span>
                                                            Get your credentials at{' '}
                                                            <a href="https://console.twilio.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-200">
                                                                console.twilio.com
                                                            </a>
                                                            {' → Account Info'}
                                                        </span>
                                                    </div>
                                                    {['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'].map(key => {
                                                        const secret = secrets.find(s => s.key_name === key);
                                                        const isConfigured = secret?.is_configured;
                                                        return (
                                                            <div key={key} className="space-y-2">
                                                                <label className="block text-sm font-medium text-white/70">
                                                                    {key.replace('TWILIO_', '').replace(/_/g, ' ')}
                                                                </label>
                                                                {isConfigured && !secretValues[key] ? (
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="flex-1 h-10 rounded-lg bg-green-500/20 border border-green-500/30 flex items-center px-3">
                                                                            <Check className="w-4 h-4 text-green-400 mr-2" />
                                                                            <span className="text-green-300 text-sm">Saved securely</span>
                                                                        </div>
                                                                        <Button size="sm" variant="ghost" onClick={() => setSecretValues(p => ({ ...p, [key]: ' ' }))}>
                                                                            Change
                                                                        </Button>
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex gap-2">
                                                                        <Input
                                                                            type={key.includes('TOKEN') ? 'password' : 'text'}
                                                                            placeholder={key === 'TWILIO_PHONE_NUMBER' ? '+12125551234' : `Enter ${key.toLowerCase()}`}
                                                                            value={secretValues[key]?.trim() || ''}
                                                                            onChange={(e) => setSecretValues((p) => ({ ...p, [key]: e.target.value }))}
                                                                        />
                                                                        <Button size="sm" onClick={() => handleUpdateSecret(key)} disabled={!secretValues[key]?.trim()}>
                                                                            Save
                                                                        </Button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {/* HTTP API Fields */}
                                            {secrets.find(s => s.key_name === 'SMS_PROVIDER')?.key_value === 'http' && (
                                                <div className="space-y-4 p-4 rounded-xl bg-white/5 border border-white/10">
                                                    <div className="text-sm text-white/50 mb-4">
                                                        Configure any HTTP-based SMS API (MessageBird, Vonage, etc.)
                                                    </div>
                                                    {['SMS_HTTP_API_URL', 'SMS_HTTP_API_KEY', 'SMS_FROM_NUMBER'].map(key => {
                                                        const secret = secrets.find(s => s.key_name === key);
                                                        const isConfigured = secret?.is_configured;
                                                        return (
                                                            <div key={key} className="space-y-2">
                                                                <label className="block text-sm font-medium text-white/70">
                                                                    {key.replace('SMS_HTTP_', '').replace('SMS_', '').replace(/_/g, ' ')}
                                                                </label>
                                                                {isConfigured && !secretValues[key] ? (
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="flex-1 h-10 rounded-lg bg-green-500/20 border border-green-500/30 flex items-center px-3">
                                                                            <Check className="w-4 h-4 text-green-400 mr-2" />
                                                                            <span className="text-green-300 text-sm">Saved securely</span>
                                                                        </div>
                                                                        <Button size="sm" variant="ghost" onClick={() => setSecretValues(p => ({ ...p, [key]: ' ' }))}>
                                                                            Change
                                                                        </Button>
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex gap-2">
                                                                        <Input
                                                                            type={key.includes('KEY') ? 'password' : 'text'}
                                                                            placeholder={key === 'SMS_HTTP_API_URL' ? 'https://api.provider.com/sms' : ''}
                                                                            value={secretValues[key]?.trim() || ''}
                                                                            onChange={(e) => setSecretValues((p) => ({ ...p, [key]: e.target.value }))}
                                                                        />
                                                                        <Button size="sm" onClick={() => handleUpdateSecret(key)} disabled={!secretValues[key]?.trim()}>
                                                                            Save
                                                                        </Button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </Card>

                                {/* Email Provider Section */}
                                <Card>
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                                            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                                                <Mail className="w-5 h-5 text-blue-400" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-white">Email Notifications</h3>
                                                <p className="text-sm text-white/50">Send email updates to residents and staff</p>
                                            </div>
                                        </div>

                                        <Select
                                            label="Email Enabled"
                                            options={[
                                                { value: 'false', label: 'Disabled' },
                                                { value: 'true', label: 'Enabled' },
                                            ]}
                                            value={secrets.find(s => s.key_name === 'EMAIL_ENABLED')?.key_value || 'false'}
                                            onChange={(e) => {
                                                handleSaveSecretDirect('EMAIL_ENABLED', e.target.value);
                                            }}
                                        />

                                        {secrets.find(s => s.key_name === 'EMAIL_ENABLED')?.key_value === 'true' && (
                                            <div className="space-y-4 p-4 rounded-xl bg-white/5 border border-white/10">
                                                <div className="text-sm text-blue-300 flex items-start gap-2 mb-4">
                                                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                                    <div>
                                                        <strong>Gmail users:</strong> Enable 2FA, then create an App Password at{' '}
                                                        <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-200">
                                                            myaccount.google.com/apppasswords
                                                        </a>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {[
                                                        { key: 'SMTP_HOST', placeholder: 'smtp.gmail.com', label: 'SMTP Host' },
                                                        { key: 'SMTP_PORT', placeholder: '587', label: 'SMTP Port' },
                                                        { key: 'SMTP_USER', placeholder: 'you@example.com', label: 'Username' },
                                                        { key: 'SMTP_PASSWORD', placeholder: 'App password', label: 'Password', type: 'password' },
                                                        { key: 'SMTP_FROM_EMAIL', placeholder: 'noreply@township.gov', label: 'From Email' },
                                                        { key: 'SMTP_FROM_NAME', placeholder: 'Township 311', label: 'From Name' },
                                                    ].map(({ key, placeholder, label, type }) => {
                                                        const secret = secrets.find(s => s.key_name === key);
                                                        const isConfigured = secret?.is_configured;
                                                        return (
                                                            <div key={key} className="space-y-2">
                                                                <label className="block text-sm font-medium text-white/70">
                                                                    {label}
                                                                </label>
                                                                {isConfigured && !secretValues[key] ? (
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="flex-1 h-10 rounded-lg bg-green-500/20 border border-green-500/30 flex items-center px-3">
                                                                            <Check className="w-4 h-4 text-green-400 mr-2" />
                                                                            <span className="text-green-300 text-sm">Saved</span>
                                                                        </div>
                                                                        <Button size="sm" variant="ghost" onClick={() => setSecretValues(p => ({ ...p, [key]: ' ' }))}>
                                                                            Change
                                                                        </Button>
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex gap-2">
                                                                        <Input
                                                                            type={type || 'text'}
                                                                            placeholder={placeholder}
                                                                            value={secretValues[key]?.trim() || ''}
                                                                            onChange={(e) => setSecretValues((p) => ({ ...p, [key]: e.target.value }))}
                                                                        />
                                                                        <Button size="sm" onClick={() => handleUpdateSecret(key)} disabled={!secretValues[key]?.trim()}>
                                                                            Save
                                                                        </Button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                <Select
                                                    label="Use TLS"
                                                    options={[
                                                        { value: 'true', label: 'Yes (Port 587)' },
                                                        { value: 'false', label: 'No / Use SSL (Port 465)' },
                                                    ]}
                                                    value={secrets.find(s => s.key_name === 'SMTP_USE_TLS')?.key_value || 'true'}
                                                    onChange={(e) => {
                                                        handleSaveSecretDirect('SMTP_USE_TLS', e.target.value);
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </Card>

                                {/* AI & Maps Section */}
                                <Card>
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                                            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                                                <Sparkles className="w-5 h-5 text-purple-400" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-white">AI & Maps</h3>
                                                <p className="text-sm text-white/50">Google Cloud services for AI triage and geocoding</p>
                                            </div>
                                        </div>

                                        <div className="space-y-4 p-4 rounded-xl bg-white/5 border border-white/10">
                                            <div className="text-sm text-blue-300 flex items-start gap-2 mb-4">
                                                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                                <div>
                                                    <strong>Google Cloud:</strong> Enable Maps Geocoding API at{' '}
                                                    <a href="https://console.cloud.google.com/apis/library/geocoding-backend.googleapis.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-200">
                                                        Google Cloud Console
                                                    </a>
                                                    {' '}then create an API key.
                                                </div>
                                            </div>

                                            {['GOOGLE_MAPS_API_KEY', 'VERTEX_AI_PROJECT'].map(key => {
                                                const secret = secrets.find(s => s.key_name === key);
                                                const isConfigured = secret?.is_configured;
                                                const label = key === 'GOOGLE_MAPS_API_KEY' ? 'Google Maps API Key' : 'Vertex AI Project ID';
                                                return (
                                                    <div key={key} className="space-y-2">
                                                        <label className="block text-sm font-medium text-white/70">
                                                            {label}
                                                        </label>
                                                        {isConfigured && !secretValues[key] ? (
                                                            <div className="flex items-center gap-3">
                                                                <div className="flex-1 h-10 rounded-lg bg-green-500/20 border border-green-500/30 flex items-center px-3">
                                                                    <Check className="w-4 h-4 text-green-400 mr-2" />
                                                                    <span className="text-green-300 text-sm">Saved securely</span>
                                                                </div>
                                                                <Button size="sm" variant="ghost" onClick={() => setSecretValues(p => ({ ...p, [key]: ' ' }))}>
                                                                    Change
                                                                </Button>
                                                            </div>
                                                        ) : (
                                                            <div className="flex gap-2">
                                                                <Input
                                                                    type={key === 'GOOGLE_MAPS_API_KEY' ? 'password' : 'text'}
                                                                    placeholder={key === 'GOOGLE_MAPS_API_KEY' ? 'AIza...' : 'my-gcp-project'}
                                                                    value={secretValues[key]?.trim() || ''}
                                                                    onChange={(e) => setSecretValues((p) => ({ ...p, [key]: e.target.value }))}
                                                                />
                                                                <Button size="sm" onClick={() => handleUpdateSecret(key)} disabled={!secretValues[key]?.trim()}>
                                                                    Save
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </Card>
                            </div>
                        )}

                        {/* Modules Tab */}
                        {currentTab === 'modules' && (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <h1 className="text-2xl font-bold text-white">Feature Modules</h1>
                                    <Button leftIcon={<Save className="w-4 h-4" />} onClick={handleSaveModules} isLoading={isLoading}>
                                        Save Changes
                                    </Button>
                                </div>

                                <div className="space-y-4">
                                    <Card>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                                                    <Sparkles className="w-6 h-6 text-blue-400" />
                                                </div>
                                                <div>
                                                    <h3 className="font-semibold text-white">AI Analysis</h3>
                                                    <p className="text-sm text-white/50">Enable Vertex AI triage for submissions</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setModules((p) => ({ ...p, ai_analysis: !p.ai_analysis }))}
                                                className={`w-14 h-8 rounded-full transition-colors ${modules.ai_analysis ? 'bg-primary-500' : 'bg-white/20'
                                                    }`}
                                            >
                                                <div
                                                    className={`w-6 h-6 rounded-full bg-white transition-transform ${modules.ai_analysis ? 'translate-x-7' : 'translate-x-1'
                                                        }`}
                                                />
                                            </button>
                                        </div>
                                    </Card>

                                    <Card>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                                                    <MessageSquare className="w-6 h-6 text-green-400" />
                                                </div>
                                                <div>
                                                    <h3 className="font-semibold text-white">SMS Alerts</h3>
                                                    <p className="text-sm text-white/50">Enable SMS notifications to residents</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setModules((p) => ({ ...p, sms_alerts: !p.sms_alerts }))}
                                                className={`w-14 h-8 rounded-full transition-colors ${modules.sms_alerts ? 'bg-primary-500' : 'bg-white/20'
                                                    }`}
                                            >
                                                <div
                                                    className={`w-6 h-6 rounded-full bg-white transition-transform ${modules.sms_alerts ? 'translate-x-7' : 'translate-x-1'
                                                        }`}
                                                />
                                            </button>
                                        </div>
                                    </Card>

                                    <Card>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                                                    <Mail className="w-6 h-6 text-blue-400" />
                                                </div>
                                                <div>
                                                    <h3 className="font-semibold text-white">Email Notifications</h3>
                                                    <p className="text-sm text-white/50">Send email updates to residents</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setModules((p) => ({ ...p, email_notifications: !p.email_notifications }))}
                                                className={`w-14 h-8 rounded-full transition-colors ${modules.email_notifications ? 'bg-primary-500' : 'bg-white/20'
                                                    }`}
                                            >
                                                <div
                                                    className={`w-6 h-6 rounded-full bg-white transition-transform ${modules.email_notifications ? 'translate-x-7' : 'translate-x-1'
                                                        }`}
                                                />
                                            </button>
                                        </div>
                                    </Card>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Add/Edit Department Modal */}
            <Modal
                isOpen={showDepartmentModal}
                onClose={() => {
                    setShowDepartmentModal(false);
                    setEditingDepartment(null);
                }}
                title={editingDepartment ? 'Edit Department' : 'Add New Department'}
            >
                <form onSubmit={handleCreateDepartment} className="space-y-4">
                    <Input
                        label="Department Name"
                        value={newDepartment.name}
                        onChange={(e) => setNewDepartment((p) => ({ ...p, name: e.target.value }))}
                        placeholder="e.g., Public Works"
                        required
                    />
                    <Input
                        label="Description"
                        value={newDepartment.description}
                        onChange={(e) => setNewDepartment((p) => ({ ...p, description: e.target.value }))}
                        placeholder="Handles roads, parks, infrastructure..."
                    />
                    <Input
                        label="Routing Email"
                        type="email"
                        value={newDepartment.routing_email}
                        onChange={(e) => setNewDepartment((p) => ({ ...p, routing_email: e.target.value }))}
                        placeholder="publicworks@township.gov"
                    />
                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="ghost" onClick={() => setShowDepartmentModal(false)}>Cancel</Button>
                        <Button type="submit">{editingDepartment ? 'Save Changes' : 'Create Department'}</Button>
                    </div>
                </form>
            </Modal>

            {/* Add User Modal */}
            <Modal isOpen={showUserModal} onClose={() => setShowUserModal(false)} title="Add New User">
                <form onSubmit={handleCreateUser} className="space-y-4">
                    <Input
                        label="Username"
                        value={newUser.username}
                        onChange={(e) => setNewUser((p) => ({ ...p, username: e.target.value }))}
                        required
                    />
                    <Input
                        label="Full Name"
                        value={newUser.full_name}
                        onChange={(e) => setNewUser((p) => ({ ...p, full_name: e.target.value }))}
                    />
                    <Input
                        label="Email"
                        type="email"
                        value={newUser.email}
                        onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
                        required
                    />
                    <Input
                        label="Password"
                        type="password"
                        value={newUser.password}
                        onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
                        required
                    />
                    <Select
                        label="Role"
                        options={[
                            { value: 'staff', label: 'Staff' },
                            { value: 'admin', label: 'Admin' },
                        ]}
                        value={newUser.role}
                        onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value as 'staff' | 'admin' }))}
                    />

                    {/* Department Assignment */}
                    {newUser.role === 'staff' && departments.length > 0 && (
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-white/70">Assign to Departments</label>
                            <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 rounded-lg bg-white/5 border border-white/10">
                                {departments.map((dept) => (
                                    <label key={dept.id} className="flex items-center gap-2 cursor-pointer hover:bg-white/5 p-1 rounded">
                                        <input
                                            type="checkbox"
                                            checked={newUser.department_ids.includes(dept.id)}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setNewUser((p) => ({ ...p, department_ids: [...p.department_ids, dept.id] }));
                                                } else {
                                                    setNewUser((p) => ({ ...p, department_ids: p.department_ids.filter(id => id !== dept.id) }));
                                                }
                                            }}
                                            className="w-4 h-4 rounded border-white/20 bg-white/10 text-primary-500 focus:ring-primary-500"
                                        />
                                        <span className="text-sm text-white/80">{dept.name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="ghost" onClick={() => setShowUserModal(false)}>Cancel</Button>
                        <Button type="submit">Create User</Button>
                    </div>
                </form>
            </Modal>

            {/* Add Service Modal */}
            <Modal isOpen={showServiceModal} onClose={() => setShowServiceModal(false)} title="Add Service Category">
                <form onSubmit={handleCreateService} className="space-y-4">
                    <Input
                        label="Service Name"
                        value={newService.service_name}
                        onChange={(e) => setNewService((p) => ({ ...p, service_name: e.target.value }))}
                        required
                    />
                    <Input
                        label="Service Code"
                        placeholder="POTHOLE, STREETLIGHT, etc."
                        value={newService.service_code}
                        onChange={(e) => setNewService((p) => ({ ...p, service_code: e.target.value.toUpperCase() }))}
                        required
                    />
                    <Input
                        label="Description"
                        value={newService.description}
                        onChange={(e) => setNewService((p) => ({ ...p, description: e.target.value }))}
                    />
                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="ghost" onClick={() => setShowServiceModal(false)}>Cancel</Button>
                        <Button type="submit">Create Category</Button>
                    </div>
                </form>
            </Modal>

            {/* Service Routing Edit Modal */}
            <Modal
                isOpen={showServiceEditModal}
                onClose={() => {
                    setShowServiceEditModal(false);
                    setEditingService(null);
                }}
                title={`Configure Routing: ${editingService?.service_name || ''}`}
            >
                <form onSubmit={handleSaveServiceRouting} className="space-y-5">
                    {/* Department Assignment */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-white/70">Assigned Department</label>
                        <select
                            value={serviceRouting.assigned_department_id || ''}
                            onChange={(e) => setServiceRouting(p => ({
                                ...p,
                                assigned_department_id: e.target.value ? parseInt(e.target.value) : null
                            }))}
                            className="w-full h-10 rounded-lg bg-white/10 border border-white/20 text-white px-3 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                            <option value="">No department assigned</option>
                            {departments.map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Routing Mode */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-white/70">Routing Mode</label>
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { value: 'township', label: 'Township Handles', desc: 'Standard - we process this' },
                                { value: 'third_party', label: '3rd Party', desc: 'Redirect to external service' },
                                { value: 'road_based', label: 'Road-Based', desc: 'Route by road name' },
                            ].map(mode => (
                                <button
                                    type="button"
                                    key={mode.value}
                                    onClick={() => setServiceRouting(p => ({ ...p, routing_mode: mode.value as any }))}
                                    className={`p-3 rounded-lg border text-left transition-colors ${serviceRouting.routing_mode === mode.value
                                            ? 'bg-primary-500/20 border-primary-500 text-white'
                                            : 'bg-white/5 border-white/10 text-white/70 hover:border-white/30'
                                        }`}
                                >
                                    <div className="font-medium text-sm">{mode.label}</div>
                                    <div className="text-xs text-white/50 mt-1">{mode.desc}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Third Party Config */}
                    {serviceRouting.routing_mode === 'third_party' && (
                        <div className="space-y-4 p-4 rounded-lg bg-white/5 border border-white/10">
                            <h4 className="font-medium text-white">Third Party Redirect</h4>
                            <Input
                                label="Redirect URL"
                                placeholder="https://county.gov/roads"
                                value={serviceRouting.routing_config.url}
                                onChange={(e) => setServiceRouting(p => ({
                                    ...p,
                                    routing_config: { ...p.routing_config, url: e.target.value }
                                }))}
                            />
                            <Input
                                label="Message to Show"
                                placeholder="This is handled by the County..."
                                value={serviceRouting.routing_config.message}
                                onChange={(e) => setServiceRouting(p => ({
                                    ...p,
                                    routing_config: { ...p.routing_config, message: e.target.value }
                                }))}
                            />
                        </div>
                    )}

                    {/* Road-Based Config */}
                    {serviceRouting.routing_mode === 'road_based' && (
                        <div className="space-y-4 p-4 rounded-lg bg-white/5 border border-white/10">
                            <h4 className="font-medium text-white">Road-Based Routing</h4>

                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-white/70">Default if road not matched</label>
                                <select
                                    value={serviceRouting.routing_config.default}
                                    onChange={(e) => setServiceRouting(p => ({
                                        ...p,
                                        routing_config: { ...p.routing_config, default: e.target.value as any }
                                    }))}
                                    className="w-full h-10 rounded-lg bg-white/10 border border-white/20 text-white px-3"
                                >
                                    <option value="township">Township handles (default)</option>
                                    <option value="third_party">Redirect to 3rd party</option>
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-green-300">Township Roads (we handle)</label>
                                <textarea
                                    rows={3}
                                    placeholder="Main St, Oak Ave, Elm Rd..."
                                    value={serviceRouting.routing_config.township_roads}
                                    onChange={(e) => setServiceRouting(p => ({
                                        ...p,
                                        routing_config: { ...p.routing_config, township_roads: e.target.value }
                                    }))}
                                    className="w-full rounded-lg bg-white/10 border border-white/20 text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                                />
                                <p className="text-xs text-white/40">Comma-separated list of roads the township maintains</p>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-amber-300">County/State Roads (redirect)</label>
                                <textarea
                                    rows={3}
                                    placeholder="County Rd 1, Route 206, State Hwy 27..."
                                    value={serviceRouting.routing_config.county_roads}
                                    onChange={(e) => setServiceRouting(p => ({
                                        ...p,
                                        routing_config: { ...p.routing_config, county_roads: e.target.value }
                                    }))}
                                    className="w-full rounded-lg bg-white/10 border border-white/20 text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                                />
                                <p className="text-xs text-white/40">Comma-separated list of roads that should be redirected</p>
                            </div>

                            <Input
                                label="Third Party URL (for county roads)"
                                placeholder="https://county.gov/roads"
                                value={serviceRouting.routing_config.third_party_url}
                                onChange={(e) => setServiceRouting(p => ({
                                    ...p,
                                    routing_config: { ...p.routing_config, third_party_url: e.target.value }
                                }))}
                            />
                            <Input
                                label="Redirect Message"
                                placeholder="This road is maintained by the County..."
                                value={serviceRouting.routing_config.third_party_message}
                                onChange={(e) => setServiceRouting(p => ({
                                    ...p,
                                    routing_config: { ...p.routing_config, third_party_message: e.target.value }
                                }))}
                            />
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="ghost" onClick={() => setShowServiceEditModal(false)}>Cancel</Button>
                        <Button type="submit">Save Routing Config</Button>
                    </div>
                </form>
            </Modal>

            {/* Password Reset Modal */}
            <Modal isOpen={showPasswordModal} onClose={() => setShowPasswordModal(false)} title={`Reset Password for ${passwordResetUser?.username}`}>
                <form onSubmit={handleResetPassword} className="space-y-4">
                    <p className="text-white/70">
                        Enter a new password for {passwordResetUser?.full_name || passwordResetUser?.username}. They will need to use this password to log in.
                    </p>
                    <Input
                        label="New Password"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        minLength={6}
                        placeholder="Minimum 6 characters"
                    />
                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="ghost" onClick={() => setShowPasswordModal(false)}>Cancel</Button>
                        <Button type="submit">Reset Password</Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
