import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useParams } from 'react-router-dom';
import {
    Search,
    ArrowLeft,
    MapPin,
    CheckCircle2,
    Send,
    AlertCircle,
    Circle,
    Lightbulb,
    Trash2,
    Footprints,
    SignpostBig,
    Volume2,
    HelpCircle,
    Sparkles,
    Camera,
    X,
    Phone,
    ExternalLink,
    ClipboardList,
} from 'lucide-react';
import { Button, Input, Textarea, Card } from '../components/ui';
import GoogleMapsLocationPicker from '../components/GoogleMapsLocationPicker';
import TrackRequests from '../components/TrackRequests';
import ResidentMapView from '../components/ResidentMapView';
import { useSettings } from '../context/SettingsContext';
import { api, MapLayer } from '../services/api';
import { ServiceDefinition, ServiceRequestCreate, ServiceRequest } from '../types';

// Icon mapping for service categories
const iconMap: Record<string, React.FC<{ className?: string }>> = {
    Circle,
    Lightbulb,
    Trash2,
    Footprints,
    SignpostBig,
    Volume2,
    HelpCircle,
    AlertCircle,
    Spray: AlertCircle, // Fallback
};

type Step = 'categories' | 'form' | 'success';

export default function ResidentPortal() {
    const { settings } = useSettings();
    const { requestId: urlRequestId } = useParams<{ requestId?: string }>();
    const pathname = window.location.pathname;
    const isTrackRoute = pathname.startsWith('/track');
    const [showTrackingView, setShowTrackingView] = useState(urlRequestId || isTrackRoute ? true : false);
    const [step, setStep] = useState<Step>('categories');
    const [services, setServices] = useState<ServiceDefinition[]>([]);
    const [selectedService, setSelectedService] = useState<ServiceDefinition | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submittedId, setSubmittedId] = useState<string | null>(null);

    // Requests for staff map
    const [allRequests, setAllRequests] = useState<ServiceRequest[]>([]);

    // Form state
    const [formData, setFormData] = useState<ServiceRequestCreate>({
        service_code: '',
        description: '',
        address: '',
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
    });
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});

    // Blocking state for third-party/road-based services
    const [isBlocked, setIsBlocked] = useState(false);
    const [blockMessage, setBlockMessage] = useState('');
    const [blockContacts, setBlockContacts] = useState<{ name: string; phone: string; url: string }[]>([]);

    // Custom question answers
    const [customAnswers, setCustomAnswers] = useState<Record<string, string | string[]>>({});

    // Photo upload state
    const [photos, setPhotos] = useState<File[]>([]);
    const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);

    const [mapLayers, setMapLayers] = useState<MapLayer[]>([]);
    // Selected asset from map layer (for report logging)
    const [selectedAsset, setSelectedAsset] = useState<{ layerName: string; properties: Record<string, any>; lat: number; lng: number } | null>(null);

    // Location/GPS state  
    const [location, setLocation] = useState<{ address: string; lat: number | null; lng: number | null }>({
        address: '',
        lat: null,
        lng: null
    });
    const [mapsApiKey, setMapsApiKey] = useState<string | null>(null);
    const [townshipBoundary, setTownshipBoundary] = useState<object | null>(null);
    const [isLocationOutOfBounds, setIsLocationOutOfBounds] = useState(false);


    // Load Maps API key and configuration
    useEffect(() => {
        api.getMapsConfig().then((config) => {
            if (config.google_maps_api_key) {
                setMapsApiKey(config.google_maps_api_key);
            }
            if (config.township_boundary) {
                setTownshipBoundary(config.township_boundary);
            }
        }).catch(() => { });

        // Load custom map layers (public endpoint)
        api.getMapLayers().then((layers) => {
            setMapLayers(layers);
        }).catch(() => { });
    }, []);



    useEffect(() => {
        loadServices();
    }, []);

    const loadServices = async () => {
        try {
            const data = await api.getServices();
            setServices(data);
        } catch (err) {
            console.error('Failed to load services:', err);
        } finally {
            setIsLoading(false);
        }
    };

    // Load requests for the map
    useEffect(() => {
        api.getPublicRequests().then((requests) => {
            setAllRequests(requests as unknown as ServiceRequest[]);
        }).catch(() => { });
    }, []);

    const filteredServices = services.filter(
        (s) =>
            s.service_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleSelectService = (service: ServiceDefinition) => {
        setSelectedService(service);
        setFormData((prev) => ({ ...prev, service_code: service.service_code }));

        // Clear any previous blocking state and selected asset
        setIsBlocked(false);
        setBlockMessage('');
        setBlockContacts([]);
        setSelectedAsset(null); // Reset asset selection for new category

        // Check if third-party only service - block immediately
        if (service.routing_mode === 'third_party') {
            setIsBlocked(true);
            setBlockMessage(service.routing_config?.message || 'This service is handled by a third party.');
            setBlockContacts(service.routing_config?.contacts || []);
        }

        setStep('form');
    };

    // Check if address matches road-based blocking rules
    const checkRoadBasedBlocking = (address: string, service: ServiceDefinition) => {
        console.log('checkRoadBasedBlocking called:', { address, routing_mode: service.routing_mode, routing_config: service.routing_config });

        if (service.routing_mode !== 'road_based' || !address) {
            console.log('Skipping road-based check - not road_based mode or no address');
            return;
        }

        const config = service.routing_config;
        if (!config) {
            console.log('No routing_config found');
            return;
        }

        const addressLower = address.toLowerCase();
        const defaultHandler = config.default_handler || 'township';
        console.log('Road-based check:', { addressLower, defaultHandler, exclusion_list: config.exclusion_list, inclusion_list: config.inclusion_list });

        if (defaultHandler === 'township') {
            // Check exclusion list - if address matches, block
            const exclusionList = config.exclusion_list || [];
            console.log('Checking exclusion list:', exclusionList);

            // Flexible matching: check if key words from the road name appear in address
            const matchesExclusion = exclusionList.some(road => {
                const roadLower = road.toLowerCase().trim();
                // Simple substring check first
                if (addressLower.includes(roadLower)) return true;
                // Also try matching significant words (more than 3 chars) from the road name
                const roadWords = roadLower.split(/[\s,]+/).filter(w => w.length > 3);
                const matchCount = roadWords.filter(word => addressLower.includes(word)).length;
                // Match if at least half the significant words are found
                const threshold = Math.max(1, Math.floor(roadWords.length * 0.5));
                return matchCount >= threshold;
            });
            console.log('Matches exclusion:', matchesExclusion);

            if (matchesExclusion) {
                setIsBlocked(true);
                setBlockMessage(config.third_party_message || 'This road is handled by a third party.');
                setBlockContacts(config.third_party_contacts || []);
            } else {
                setIsBlocked(false);
                setBlockMessage('');
                setBlockContacts([]);
            }
        } else {
            // Third party default - check inclusion list - if NOT in list, block
            const inclusionList = config.inclusion_list || [];
            console.log('Checking inclusion list:', inclusionList);

            // Flexible matching: check if key words from the road name appear in address
            const matchesInclusion = inclusionList.some(road => {
                const roadLower = road.toLowerCase().trim();
                // Simple substring check first
                if (addressLower.includes(roadLower)) return true;
                // Also try matching significant words (more than 3 chars) from the road name
                const roadWords = roadLower.split(/[\s,]+/).filter(w => w.length > 3);
                const matchCount = roadWords.filter(word => addressLower.includes(word)).length;
                // Match if at least half the significant words are found
                const threshold = Math.max(1, Math.floor(roadWords.length * 0.5));
                return matchCount >= threshold;
            });
            console.log('Matches inclusion:', matchesInclusion);

            if (!matchesInclusion) {
                setIsBlocked(true);
                setBlockMessage(config.third_party_message || 'This road is handled by a third party.');
                setBlockContacts(config.third_party_contacts || []);
            } else {
                setIsBlocked(false);
                setBlockMessage('');
                setBlockContacts([]);
            }
        }
    };

    const validateForm = (): boolean => {
        const errors: Record<string, string> = {};

        if (!formData.description || formData.description.length < 10) {
            errors.description = 'Please provide a detailed description (at least 10 characters)';
        }
        if (!formData.email || !/\S+@\S+\.\S+/.test(formData.email)) {
            errors.email = 'Please enter a valid email address';
        }

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm()) return;

        setIsSubmitting(true);
        try {
            // Matched asset: ONLY use user-selected asset (no automatic proximity detection)
            let matchedAsset: typeof formData.matched_asset = undefined;

            // User explicitly clicked "Select this..." on an asset marker
            if (selectedAsset) {
                matchedAsset = {
                    layer_name: selectedAsset.layerName,
                    layer_id: 0, // Will be filled in by backend
                    asset_id: selectedAsset.properties.asset_id || selectedAsset.properties.id,
                    asset_type: selectedAsset.properties.asset_type || selectedAsset.layerName,
                    properties: selectedAsset.properties,
                    distance_meters: 0, // Exact selection, no distance
                };
                console.log('User selected asset:', matchedAsset);
            }
            // Note: No automatic proximity detection - user must explicitly select an asset

            const result = await api.createRequest({
                ...formData,
                media_urls: photoPreviewUrls.slice(0, 3),  // Include photos (max 3)
                matched_asset: matchedAsset,
            });
            setSubmittedId(result.service_request_id);
            setStep('success');
        } catch (err) {
            console.error('Failed to submit request:', err);
            setFormErrors({ submit: 'Failed to submit request. Please try again.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Haversine distance calculation (meters)
    const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
        const R = 6371000; // Earth radius in meters
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };


    const handleReset = () => {
        setStep('categories');
        setSelectedService(null);
        setFormData({
            service_code: '',
            description: '',
            address: '',
            first_name: '',
            last_name: '',
            email: '',
            phone: '',
        });
        setFormErrors({});
        setSubmittedId(null);
        setPhotos([]);
        setPhotoPreviewUrls([]);
        setLocation({ address: '', lat: null, lng: null });
        // Clear blocking state
        setIsBlocked(false);
        setBlockMessage('');
        setBlockContacts([]);
        // Clear custom answers
        setCustomAnswers({});
    };

    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        const newPhotos = Array.from(files).slice(0, 3 - photos.length); // Max 3 photos
        setPhotos((prev) => [...prev, ...newPhotos]);

        // Create preview URLs
        newPhotos.forEach((file) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                setPhotoPreviewUrls((prev) => [...prev, reader.result as string]);
            };
            reader.readAsDataURL(file);
        });
    };

    const handleRemovePhoto = (index: number) => {
        setPhotos((prev) => prev.filter((_, i) => i !== index));
        setPhotoPreviewUrls((prev) => prev.filter((_, i) => i !== index));
    };

    const getIcon = (iconName: string) => {
        const IconComponent = iconMap[iconName] || AlertCircle;
        return <IconComponent className="w-8 h-8" />;
    };

    return (
        <div className="min-h-screen flex flex-col">
            {/* Navigation */}
            <nav className="glass-sidebar py-4 px-6 flex items-center justify-between sticky top-0 z-40">
                <div className="flex items-center gap-3">
                    {settings?.logo_url ? (
                        <img src={settings.logo_url} alt="Logo" className="h-10 w-auto" />
                    ) : (
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
                            <Sparkles className="w-6 h-6 text-white" />
                        </div>
                    )}
                    <h1 className="text-xl font-semibold text-white hidden sm:block">
                        {settings?.township_name || 'Township 311'}
                    </h1>
                </div>

                <Link
                    to="/login"
                    className="text-white/60 hover:text-white text-sm font-medium transition-colors"
                >
                    Staff Login
                </Link>
            </nav>

            {/* Main Content */}
            <main className="flex-1 px-4 py-8 md:px-8 max-w-6xl mx-auto w-full">
                {/* Tracking View */}
                {showTrackingView ? (
                    <div className="space-y-6">
                        <button
                            onClick={() => setShowTrackingView(false)}
                            className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5" />
                            <span>Back to Home</span>
                        </button>
                        <TrackRequests initialRequestId={urlRequestId} />
                    </div>
                ) : (
                    <AnimatePresence mode="wait">
                        {step === 'categories' && (
                            <motion.div
                                key="categories"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="space-y-8"
                            >
                                {/* Hero Section */}
                                <div className="text-center space-y-6">
                                    <motion.div
                                        initial={{ scale: 0.9, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        transition={{ delay: 0.1 }}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-500/20 border border-primary-500/30"
                                    >
                                        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                                        <span className="text-sm font-medium text-primary-200">
                                            Community Support Active
                                        </span>
                                    </motion.div>

                                    <motion.h1
                                        initial={{ y: 20, opacity: 0 }}
                                        animate={{ y: 0, opacity: 1 }}
                                        transition={{ delay: 0.2 }}
                                        className="text-4xl md:text-5xl lg:text-6xl font-bold text-gradient"
                                    >
                                        {settings?.hero_text || 'How can we help?'}
                                    </motion.h1>

                                    <motion.p
                                        initial={{ y: 20, opacity: 0 }}
                                        animate={{ y: 0, opacity: 1 }}
                                        transition={{ delay: 0.3 }}
                                        className="text-lg text-white/60 max-w-xl mx-auto"
                                    >
                                        Report issues, request services, and help make our community better.
                                        Select a category below to get started.
                                    </motion.p>

                                    {/* Search */}
                                    <motion.div
                                        initial={{ y: 20, opacity: 0 }}
                                        animate={{ y: 0, opacity: 1 }}
                                        transition={{ delay: 0.4 }}
                                        className="max-w-md mx-auto"
                                    >
                                        <div className="relative">
                                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                                            <input
                                                type="text"
                                                placeholder="Search services..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                className="glass-input pl-12"
                                            />
                                        </div>
                                    </motion.div>
                                </div>

                                {/* Service Categories Grid */}
                                {isLoading ? (
                                    <div className="flex justify-center py-12">
                                        <div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                ) : (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: 0.5 }}
                                        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                                    >
                                        {filteredServices.map((service, index) => (
                                            <motion.div
                                                key={service.id}
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: 0.1 * index }}
                                            >
                                                <Card
                                                    hover
                                                    onClick={() => handleSelectService(service)}
                                                    className="h-full"
                                                >
                                                    <div className="flex flex-col items-center text-center space-y-3">
                                                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500/30 to-primary-600/30 flex items-center justify-center text-primary-300">
                                                            {getIcon(service.icon)}
                                                        </div>
                                                        <h3 className="font-semibold text-white">
                                                            {service.service_name}
                                                        </h3>
                                                        <p className="text-sm text-white/50 line-clamp-2">
                                                            {service.description}
                                                        </p>
                                                    </div>
                                                </Card>
                                            </motion.div>
                                        ))}
                                    </motion.div>
                                )}

                                {filteredServices.length === 0 && !isLoading && (
                                    <div className="text-center py-12">
                                        <p className="text-white/60">No services found matching your search.</p>
                                    </div>
                                )}

                                {/* Community Map Section */}
                                <div className="border-t border-white/10 my-10" />
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.6 }}
                                    className="space-y-4"
                                >
                                    <h2 className="text-2xl font-bold text-white text-center">
                                        Community Requests Map
                                    </h2>
                                    <p className="text-white/60 text-center mb-6">
                                        View all reported issues and service requests in our community
                                    </p>
                                    <div className="h-[500px] rounded-2xl overflow-hidden">
                                        <ResidentMapView
                                            apiKey={mapsApiKey || ''}
                                            requests={allRequests}
                                            townshipBoundary={townshipBoundary}
                                            onRequestSelect={() => { }}
                                        />
                                    </div>
                                </motion.div>

                                {/* Track Requests Button */}
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.7 }}
                                    className="text-center pt-8"
                                >
                                    <Button
                                        onClick={() => setShowTrackingView(true)}
                                        variant="secondary"
                                        size="lg"
                                        className="px-8 py-4"
                                    >
                                        <ClipboardList className="w-5 h-5 mr-2" />
                                        Track My Requests
                                    </Button>
                                </motion.div>
                            </motion.div>
                        )}

                        {step === 'form' && selectedService && (
                            <motion.div
                                key="form"
                                initial={{ opacity: 0, x: 50 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -50 }}
                                className="max-w-2xl mx-auto space-y-6"
                            >
                                {/* Back button */}
                                <button
                                    onClick={() => setStep('categories')}
                                    className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
                                >
                                    <ArrowLeft className="w-5 h-5" />
                                    <span>Back to categories</span>
                                </button>

                                {/* Selected service indicator */}
                                <div className="flex items-center gap-4 p-4 glass-card">
                                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500/30 to-primary-600/30 flex items-center justify-center text-primary-300">
                                        {getIcon(selectedService.icon)}
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-semibold text-white">
                                            {selectedService.service_name}
                                        </h2>
                                        <p className="text-sm text-white/50">{selectedService.description}</p>
                                    </div>
                                </div>

                                {/* Third-Party Service Blocking Notice - shown when entire service is third-party */}
                                {isBlocked && selectedService.routing_mode === 'third_party' && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="p-6 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30"
                                    >
                                        <div className="flex items-start gap-4">
                                            <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                                                <AlertCircle className="w-6 h-6 text-amber-400" />
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="text-lg font-semibold text-amber-300 mb-2">
                                                    Third-Party Service
                                                </h3>
                                                <p className="text-white/70 mb-4">
                                                    {blockMessage}
                                                </p>

                                                {blockContacts.length > 0 && (
                                                    <div className="space-y-3 p-4 rounded-xl bg-white/5">
                                                        <p className="text-sm text-white/50 font-medium">Please contact:</p>
                                                        {blockContacts.map((contact, idx) => (
                                                            <div key={idx} className="flex flex-wrap gap-4 text-sm">
                                                                {contact.name && (
                                                                    <span className="text-white font-semibold">{contact.name}</span>
                                                                )}
                                                                {contact.phone && (
                                                                    <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-2 text-primary-400 hover:text-primary-300 font-medium">
                                                                        <Phone className="w-4 h-4" />
                                                                        {contact.phone}
                                                                    </a>
                                                                )}
                                                                {contact.url && (
                                                                    <a
                                                                        href={contact.url.startsWith('http') ? contact.url : `https://${contact.url}`}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="inline-flex items-center gap-2 text-primary-400 hover:text-primary-300 font-medium underline"
                                                                    >
                                                                        <ExternalLink className="w-4 h-4" />
                                                                        Visit Website
                                                                    </a>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </motion.div>
                                )}

                                {/* Form - only show if NOT blocked OR if road-based (need address first) */}
                                {(!isBlocked || selectedService.routing_mode === 'road_based') && (
                                    <form onSubmit={handleSubmit} className="space-y-6">
                                        <Card>
                                            <div className="space-y-5">
                                                <Textarea
                                                    label="Description *"
                                                    placeholder="Please describe the issue in detail..."
                                                    value={formData.description}
                                                    onChange={(e) =>
                                                        setFormData((prev) => ({ ...prev, description: e.target.value }))
                                                    }
                                                    error={formErrors.description}
                                                    required
                                                />

                                                {/* Google Maps Location Picker */}
                                                {mapsApiKey ? (
                                                    <div>
                                                        <label className="block text-sm font-medium text-white/70 mb-2">
                                                            Location / Address
                                                        </label>
                                                        <GoogleMapsLocationPicker
                                                            apiKey={mapsApiKey}
                                                            townshipBoundary={townshipBoundary}
                                                            customLayers={mapLayers.filter(layer => {
                                                                // Check if layer is visible
                                                                if ((layer as any).visible_on_map === false) return false;
                                                                // Layer applies if: no service_codes (applies to all) OR includes current category
                                                                const codes = layer.service_codes || [];
                                                                return codes.length === 0 || codes.includes(selectedService.service_code);
                                                            })}
                                                            value={location}
                                                            onOutOfBounds={() => setIsLocationOutOfBounds(true)}
                                                            onAssetSelect={(asset) => {
                                                                setSelectedAsset(asset);
                                                                console.log('Asset selected for report:', asset);
                                                            }}
                                                            onChange={(newLocation) => {
                                                                setLocation(newLocation);
                                                                setIsLocationOutOfBounds(false); // Reset when location changes
                                                                // Save both address AND coordinates
                                                                setFormData((prev) => ({
                                                                    ...prev,
                                                                    address: newLocation.address,
                                                                    lat: newLocation.lat ?? undefined,
                                                                    long: newLocation.lng ?? undefined,
                                                                }));
                                                                // Check road-based blocking when address changes
                                                                if (selectedService.routing_mode === 'road_based') {
                                                                    checkRoadBasedBlocking(newLocation.address, selectedService);
                                                                }
                                                            }}
                                                            placeholder="Search for an address or click on the map..."
                                                        />


                                                    </div>
                                                ) : (
                                                    <>
                                                        <Input
                                                            label="Location / Address"
                                                            placeholder="Street address or intersection"
                                                            leftIcon={<MapPin className="w-5 h-5" />}
                                                            value={formData.address}
                                                            onChange={(e) => {
                                                                const newAddress = e.target.value;
                                                                setFormData((prev) => ({ ...prev, address: newAddress }));
                                                                // Check road-based blocking when address changes
                                                                if (selectedService.routing_mode === 'road_based') {
                                                                    checkRoadBasedBlocking(newAddress, selectedService);
                                                                }
                                                            }}
                                                        />
                                                        <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center text-white/40">
                                                            <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                                            <p className="text-sm">Interactive map requires Google Maps API key</p>
                                                        </div>
                                                    </>
                                                )}

                                                {/* Blocking Notice for Road-Based Services - shown after map */}
                                                {isBlocked && (
                                                    <motion.div
                                                        initial={{ opacity: 0, scale: 0.95 }}
                                                        animate={{ opacity: 1, scale: 1 }}
                                                        className="p-6 rounded-2xl bg-gradient-to-br from-red-500/20 to-orange-500/20 border border-red-500/30"
                                                    >
                                                        <div className="flex items-start gap-4">
                                                            <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                                                                <AlertCircle className="w-6 h-6 text-red-400" />
                                                            </div>
                                                            <div className="flex-1">
                                                                <h3 className="text-lg font-semibold text-red-300 mb-2">
                                                                    Cannot Submit This Request
                                                                </h3>
                                                                <p className="text-white/70 mb-4">
                                                                    {blockMessage}
                                                                </p>

                                                                {blockContacts.length > 0 && (
                                                                    <div className="space-y-2">
                                                                        <p className="text-sm text-white/50 font-medium">Contact Information:</p>
                                                                        {blockContacts.map((contact, idx) => (
                                                                            <div key={idx} className="flex flex-wrap gap-3 text-sm">
                                                                                {contact.name && (
                                                                                    <span className="text-white font-medium">{contact.name}</span>
                                                                                )}
                                                                                {contact.phone && (
                                                                                    <a href={`tel:${contact.phone}`} className="text-primary-400 hover:text-primary-300">
                                                                                        📞 {contact.phone}
                                                                                    </a>
                                                                                )}
                                                                                {contact.url && (
                                                                                    <a
                                                                                        href={contact.url.startsWith('http') ? contact.url : `https://${contact.url}`}
                                                                                        target="_blank"
                                                                                        rel="noopener noreferrer"
                                                                                        className="text-primary-400 hover:text-primary-300 underline"
                                                                                    >
                                                                                        🔗 Visit Website
                                                                                    </a>
                                                                                )}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                )}

                                                {/* Photo Upload */}
                                                <div className="space-y-3">
                                                    <label className="block text-sm font-medium text-white/70">
                                                        Photos (optional, max 3)
                                                    </label>

                                                    <div className="flex gap-3 flex-wrap">
                                                        {photoPreviewUrls.map((url, idx) => (
                                                            <div key={idx} className="relative group">
                                                                <img
                                                                    src={url}
                                                                    alt={`Photo ${idx + 1}`}
                                                                    className="w-24 h-24 object-cover rounded-xl border border-white/20"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRemovePhoto(idx)}
                                                                    className="absolute -top-2 -right-2 p-1 bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                                                >
                                                                    <X className="w-4 h-4 text-white" />
                                                                </button>
                                                            </div>
                                                        ))}

                                                        {photos.length < 3 && (
                                                            <label className="w-24 h-24 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/20 hover:border-white/40 cursor-pointer transition-colors">
                                                                <Camera className="w-6 h-6 text-white/40" />
                                                                <span className="text-xs text-white/40 mt-1">Add Photo</span>
                                                                <input
                                                                    type="file"
                                                                    accept="image/*"
                                                                    multiple
                                                                    onChange={handlePhotoUpload}
                                                                    className="hidden"
                                                                />
                                                            </label>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </Card>

                                        {/* Custom Questions - Dynamic */}
                                        {selectedService.routing_config?.custom_questions &&
                                            selectedService.routing_config.custom_questions.length > 0 && (
                                                <Card>
                                                    <h3 className="text-lg font-semibold text-white mb-4">
                                                        Additional Information
                                                    </h3>
                                                    <div className="space-y-4">
                                                        {selectedService.routing_config.custom_questions.map((q) => (
                                                            <div key={q.id} className="space-y-2">
                                                                <label className="block text-sm font-medium text-white/70">
                                                                    {q.label} {q.required && <span className="text-red-400">*</span>}
                                                                </label>

                                                                {/* Text Input */}
                                                                {q.type === 'text' && (
                                                                    <input
                                                                        type="text"
                                                                        placeholder={q.placeholder || ''}
                                                                        value={(customAnswers[q.id] as string) || ''}
                                                                        onChange={(e) => setCustomAnswers(p => ({ ...p, [q.id]: e.target.value }))}
                                                                        className="w-full h-10 rounded-lg bg-white/10 border border-white/20 text-white px-3"
                                                                        required={q.required}
                                                                    />
                                                                )}

                                                                {/* Textarea */}
                                                                {q.type === 'textarea' && (
                                                                    <textarea
                                                                        rows={3}
                                                                        placeholder={q.placeholder || ''}
                                                                        value={(customAnswers[q.id] as string) || ''}
                                                                        onChange={(e) => setCustomAnswers(p => ({ ...p, [q.id]: e.target.value }))}
                                                                        className="w-full rounded-lg bg-white/10 border border-white/20 text-white px-3 py-2"
                                                                        required={q.required}
                                                                    />
                                                                )}

                                                                {/* Number */}
                                                                {q.type === 'number' && (
                                                                    <input
                                                                        type="number"
                                                                        placeholder={q.placeholder || ''}
                                                                        value={(customAnswers[q.id] as string) || ''}
                                                                        onChange={(e) => setCustomAnswers(p => ({ ...p, [q.id]: e.target.value }))}
                                                                        className="w-full h-10 rounded-lg bg-white/10 border border-white/20 text-white px-3"
                                                                        required={q.required}
                                                                    />
                                                                )}

                                                                {/* Date */}
                                                                {q.type === 'date' && (
                                                                    <input
                                                                        type="date"
                                                                        value={(customAnswers[q.id] as string) || ''}
                                                                        onChange={(e) => setCustomAnswers(p => ({ ...p, [q.id]: e.target.value }))}
                                                                        className="w-full h-10 rounded-lg bg-white/10 border border-white/20 text-white px-3"
                                                                        required={q.required}
                                                                    />
                                                                )}

                                                                {/* Yes/No */}
                                                                {q.type === 'yes_no' && (
                                                                    <div className="flex gap-3">
                                                                        {['Yes', 'No'].map(opt => (
                                                                            <button
                                                                                key={opt}
                                                                                type="button"
                                                                                onClick={() => setCustomAnswers(p => ({ ...p, [q.id]: opt }))}
                                                                                className={`flex-1 py-2 rounded-lg border transition-colors ${customAnswers[q.id] === opt
                                                                                    ? 'bg-primary-500/30 border-primary-500 text-white'
                                                                                    : 'bg-white/5 border-white/20 text-white/70 hover:border-white/40'
                                                                                    }`}
                                                                            >
                                                                                {opt}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                )}

                                                                {/* Select Dropdown */}
                                                                {q.type === 'select' && (
                                                                    <select
                                                                        value={(customAnswers[q.id] as string) || ''}
                                                                        onChange={(e) => setCustomAnswers(p => ({ ...p, [q.id]: e.target.value }))}
                                                                        className="w-full h-10 rounded-lg bg-white/10 border border-white/20 text-white px-3"
                                                                        required={q.required}
                                                                    >
                                                                        <option value="">Select...</option>
                                                                        {q.options?.map(opt => (
                                                                            <option key={opt} value={opt}>{opt}</option>
                                                                        ))}
                                                                    </select>
                                                                )}

                                                                {/* Radio Buttons */}
                                                                {q.type === 'radio' && (
                                                                    <div className="space-y-2">
                                                                        {q.options?.map(opt => (
                                                                            <label key={opt} className="flex items-center gap-3 text-white/80 cursor-pointer">
                                                                                <input
                                                                                    type="radio"
                                                                                    name={q.id}
                                                                                    value={opt}
                                                                                    checked={customAnswers[q.id] === opt}
                                                                                    onChange={(e) => setCustomAnswers(p => ({ ...p, [q.id]: e.target.value }))}
                                                                                    className="w-4 h-4"
                                                                                />
                                                                                {opt}
                                                                            </label>
                                                                        ))}
                                                                    </div>
                                                                )}

                                                                {/* Checkboxes */}
                                                                {q.type === 'checkbox' && (
                                                                    <div className="space-y-2">
                                                                        {q.options?.map(opt => (
                                                                            <label key={opt} className="flex items-center gap-3 text-white/80 cursor-pointer">
                                                                                <input
                                                                                    type="checkbox"
                                                                                    value={opt}
                                                                                    checked={(customAnswers[q.id] as string[] || []).includes(opt)}
                                                                                    onChange={(e) => {
                                                                                        const current = (customAnswers[q.id] as string[]) || [];
                                                                                        const updated = e.target.checked
                                                                                            ? [...current, opt]
                                                                                            : current.filter(v => v !== opt);
                                                                                        setCustomAnswers(p => ({ ...p, [q.id]: updated }));
                                                                                    }}
                                                                                    className="w-4 h-4 rounded"
                                                                                />
                                                                                {opt}
                                                                            </label>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </Card>
                                            )}

                                        <Card>
                                            <h3 className="text-lg font-semibold text-white mb-4">
                                                Contact Information
                                            </h3>
                                            <div className="space-y-4">
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    <Input
                                                        label="First Name"
                                                        placeholder="John"
                                                        value={formData.first_name}
                                                        onChange={(e) =>
                                                            setFormData((prev) => ({ ...prev, first_name: e.target.value }))
                                                        }
                                                    />
                                                    <Input
                                                        label="Last Name"
                                                        placeholder="Doe"
                                                        value={formData.last_name}
                                                        onChange={(e) =>
                                                            setFormData((prev) => ({ ...prev, last_name: e.target.value }))
                                                        }
                                                    />
                                                </div>

                                                <Input
                                                    label="Email *"
                                                    type="email"
                                                    placeholder="you@example.com"
                                                    value={formData.email}
                                                    onChange={(e) =>
                                                        setFormData((prev) => ({ ...prev, email: e.target.value }))
                                                    }
                                                    error={formErrors.email}
                                                    required
                                                />

                                                <Input
                                                    label="Phone (optional)"
                                                    type="tel"
                                                    placeholder="(555) 123-4567"
                                                    value={formData.phone}
                                                    onChange={(e) =>
                                                        setFormData((prev) => ({ ...prev, phone: e.target.value }))
                                                    }
                                                />
                                            </div>
                                        </Card>

                                        {formErrors.submit && (
                                            <div className="p-4 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300">
                                                {formErrors.submit}
                                            </div>
                                        )}

                                        {!isBlocked && !isLocationOutOfBounds ? (
                                            <Button
                                                type="submit"
                                                size="lg"
                                                className="w-full"
                                                isLoading={isSubmitting}
                                                rightIcon={<Send className="w-5 h-5" />}
                                            >
                                                Submit Request
                                            </Button>
                                        ) : isLocationOutOfBounds ? (
                                            <div className="p-4 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-center">
                                                <strong>Cannot submit:</strong> The selected location is outside the township boundary. Please choose a location within the jurisdiction.
                                            </div>
                                        ) : (
                                            <div className="p-4 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-300 text-center">
                                                Submission blocked - see notice above
                                            </div>
                                        )}

                                    </form>
                                )}
                            </motion.div>
                        )}

                        {step === 'success' && (
                            <motion.div
                                key="success"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="max-w-lg mx-auto text-center space-y-8 py-12"
                            >
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: 'spring', delay: 0.2 }}
                                    className="w-24 h-24 mx-auto rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center glow-effect"
                                    style={{ boxShadow: '0 0 60px rgba(34, 197, 94, 0.4)' }}
                                >
                                    <CheckCircle2 className="w-12 h-12 text-green-400" />
                                </motion.div>

                                <div className="space-y-4">
                                    <h2 className="text-3xl font-bold text-white">Request Submitted!</h2>
                                    <p className="text-white/60">
                                        Thank you for helping improve our community. Your request has been
                                        received and will be reviewed shortly.
                                    </p>
                                    {submittedId && (
                                        <div className="inline-block px-4 py-2 rounded-lg bg-white/10 border border-white/20">
                                            <span className="text-white/50 text-sm">Request ID: </span>
                                            <span className="font-mono text-white font-medium">{submittedId}</span>
                                        </div>
                                    )}
                                </div>

                                <Button onClick={handleReset} size="lg">
                                    Submit Another Request
                                </Button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                )}
            </main>

            {/* Footer */}
            <footer className="glass-sidebar py-6 px-4 mt-auto">
                <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p className="text-white/40 text-sm">
                        © {new Date().getFullYear()} {settings?.township_name || 'Township 311'}. All rights reserved.
                    </p>
                    <div className="flex items-center gap-6 text-sm">
                        <a href="#" className="text-white/40 hover:text-white/80 transition-colors">
                            Privacy Policy
                        </a>
                        <a href="#" className="text-white/40 hover:text-white/80 transition-colors">
                            Accessibility
                        </a>
                        <a href="#" className="text-white/40 hover:text-white/80 transition-colors">
                            Terms of Service
                        </a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
