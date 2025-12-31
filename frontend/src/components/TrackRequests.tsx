import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
    MapPin,
    Clock,
    CheckCircle,
    AlertCircle,
    Search,
    MessageSquare,
    Send,
    Image,
    Calendar,
    ArrowLeft,
    Share2,
    Copy,
    Check,
    ExternalLink,
    Shield,
    User,
} from 'lucide-react';
import { Card, Input, Button, Textarea } from './ui';
import { api } from '../services/api';
import { PublicServiceRequest, RequestComment } from '../types';

type StatusFilter = 'all' | 'open' | 'in_progress' | 'closed';

interface TrackRequestsProps {
    initialRequestId?: string;
}

const statusColors: Record<string, { bg: string; text: string; border: string; label: string; icon: React.ReactNode }> = {
    open: {
        bg: 'bg-gradient-to-r from-amber-500/20 to-yellow-500/20',
        text: 'text-amber-300',
        border: 'border-amber-500/30',
        label: 'Open',
        icon: <AlertCircle className="w-4 h-4" />
    },
    in_progress: {
        bg: 'bg-gradient-to-r from-blue-500/20 to-cyan-500/20',
        text: 'text-blue-300',
        border: 'border-blue-500/30',
        label: 'In Progress',
        icon: <Clock className="w-4 h-4" />
    },
    closed: {
        bg: 'bg-gradient-to-r from-emerald-500/20 to-green-500/20',
        text: 'text-emerald-300',
        border: 'border-emerald-500/30',
        label: 'Resolved',
        icon: <CheckCircle className="w-4 h-4" />
    },
};

export default function TrackRequests({ initialRequestId }: TrackRequestsProps) {
    const navigate = useNavigate();
    const [requests, setRequests] = useState<PublicServiceRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedRequest, setSelectedRequest] = useState<PublicServiceRequest | null>(null);
    const [comments, setComments] = useState<RequestComment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);
    const [isLoadingComments, setIsLoadingComments] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        loadRequests();
    }, [statusFilter]);

    // Auto-load request from URL
    useEffect(() => {
        if (initialRequestId && requests.length > 0) {
            const request = requests.find(r => r.service_request_id === initialRequestId);
            if (request) {
                setSelectedRequest(request);
            }
        }
    }, [initialRequestId, requests]);

    useEffect(() => {
        if (selectedRequest) {
            loadComments(selectedRequest.service_request_id);
        }
    }, [selectedRequest]);

    const loadRequests = async () => {
        setIsLoading(true);
        try {
            const data = await api.getPublicRequests(
                statusFilter === 'all' ? undefined : statusFilter
            );
            setRequests(data);
        } catch (err) {
            console.error('Failed to load requests:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const loadComments = async (requestId: string) => {
        setIsLoadingComments(true);
        try {
            const data = await api.getPublicComments(requestId);
            setComments(data);
        } catch (err) {
            console.error('Failed to load comments:', err);
            setComments([]);
        } finally {
            setIsLoadingComments(false);
        }
    };

    const handleAddComment = async () => {
        if (!selectedRequest || !newComment.trim()) return;

        setIsSubmittingComment(true);
        try {
            await api.addPublicComment(selectedRequest.service_request_id, newComment.trim());
            setNewComment('');
            await loadComments(selectedRequest.service_request_id);
        } catch (err) {
            console.error('Failed to add comment:', err);
        } finally {
            setIsSubmittingComment(false);
        }
    };

    const copyLink = () => {
        if (!selectedRequest) return;
        const url = `${window.location.origin}/track/${selectedRequest.service_request_id}`;
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleSelectRequest = (request: PublicServiceRequest) => {
        setSelectedRequest(request);
        // Update URL without full navigation
        navigate(`/track/${request.service_request_id}`, { replace: true });
    };

    const handleBackToList = () => {
        setSelectedRequest(null);
        navigate('/track', { replace: true });
    };


    const filteredRequests = requests.filter((r) => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            r.service_request_id.toLowerCase().includes(query) ||
            r.service_name.toLowerCase().includes(query) ||
            r.address?.toLowerCase().includes(query) ||
            r.description.toLowerCase().includes(query)
        );
    });

    const formatDate = (dateString: string | null) => {
        if (!dateString) return '';
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    };

    const formatShortDate = (dateString: string | null) => {
        if (!dateString) return '';
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    // Detail View
    if (selectedRequest) {
        const status = statusColors[selectedRequest.status] || statusColors.open;

        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="min-h-screen"
            >
                {/* Back Button & Actions Bar */}
                <div className="flex items-center justify-between mb-8">
                    <button
                        onClick={handleBackToList}
                        className="flex items-center gap-2 text-white/60 hover:text-white transition-colors group"
                    >
                        <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                        <span className="font-medium">Back to all requests</span>
                    </button>

                    <button
                        onClick={copyLink}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${copied
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-white/10 hover:bg-white/20 text-white border border-white/10 hover:border-white/20'
                            }`}
                    >
                        {copied ? (
                            <>
                                <Check className="w-4 h-4" />
                                <span className="font-medium">Link Copied!</span>
                            </>
                        ) : (
                            <>
                                <Share2 className="w-4 h-4" />
                                <span className="font-medium">Share</span>
                            </>
                        )}
                    </button>
                </div>

                {/* Hero Header */}
                <div className={`relative overflow-hidden rounded-2xl ${status.bg} ${status.border} border p-8 mb-8`}>
                    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
                    <div className="relative">
                        <div className="flex flex-wrap items-center gap-4 mb-4">
                            <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${status.bg} ${status.text} border ${status.border}`}>
                                {status.icon}
                                {status.label}
                            </span>
                            <span className="text-white/50 text-sm flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                {formatDate(selectedRequest.requested_datetime)}
                            </span>
                        </div>
                        <h1 className="text-3xl font-bold text-white mb-3">
                            {selectedRequest.service_name}
                        </h1>
                        <p className="text-primary-300 font-mono text-sm inline-flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg">
                            {selectedRequest.service_request_id}
                            <button
                                onClick={copyLink}
                                className="text-white/40 hover:text-white transition-colors"
                                title="Copy link"
                            >
                                <Copy className="w-3.5 h-3.5" />
                            </button>
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Location & Map */}
                    {selectedRequest.address && (
                        <Card className="overflow-hidden">
                            <div className="p-5">
                                <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                                    <div className="p-2 rounded-lg bg-primary-500/20">
                                        <MapPin className="w-5 h-5 text-primary-400" />
                                    </div>
                                    Location
                                </h3>
                                <p className="text-white/70">{selectedRequest.address}</p>
                            </div>

                            {selectedRequest.lat && selectedRequest.long && (
                                <div className="h-48 bg-white/5 border-t border-white/10">
                                    <iframe
                                        width="100%"
                                        height="100%"
                                        style={{ border: 0 }}
                                        loading="lazy"
                                        src={`https://www.google.com/maps/embed/v1/place?key=${(window as any).GOOGLE_MAPS_API_KEY || ''}&q=${selectedRequest.lat},${selectedRequest.long}&zoom=17`}
                                        allowFullScreen
                                    />
                                </div>
                            )}
                        </Card>
                    )}

                    {/* Timeline & Status */}
                    <Card className="p-5">
                        <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                            <Clock className="w-5 h-5 text-white/50" />
                            Timeline & Status
                        </h3>
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-primary-500" />
                                <div className="flex-1">
                                    <p className="text-white/50 text-xs">Submitted</p>
                                    <p className="text-white font-medium">{formatShortDate(selectedRequest.requested_datetime)}</p>
                                </div>
                            </div>
                            {selectedRequest.updated_datetime && (
                                <div className="flex items-center gap-3">
                                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                                    <div className="flex-1">
                                        <p className="text-white/50 text-xs">Last Updated</p>
                                        <p className="text-white font-medium">{formatShortDate(selectedRequest.updated_datetime)}</p>
                                    </div>
                                </div>
                            )}
                            {selectedRequest.status === 'closed' && (
                                <div className="mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                    <p className="text-emerald-300 font-medium flex items-center gap-2">
                                        <CheckCircle className="w-4 h-4" />
                                        {selectedRequest.closed_substatus === 'no_action' ? 'No Action Needed' :
                                            selectedRequest.closed_substatus === 'resolved' ? 'Issue Resolved' :
                                                selectedRequest.closed_substatus === 'third_party' ? 'Referred to Third Party' :
                                                    'Closed'}
                                    </p>
                                    {selectedRequest.completion_message && (
                                        <p className="text-white/60 text-sm mt-2">{selectedRequest.completion_message}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </Card>
                </div>

                {/* Photo if available */}
                {selectedRequest.media_url && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                        <Card className="overflow-hidden">
                            <div className="p-4 border-b border-white/10">
                                <h3 className="font-semibold text-white flex items-center gap-2">
                                    <Image className="w-5 h-5 text-primary-400" />
                                    Submitted Photo
                                </h3>
                            </div>
                            <a
                                href={selectedRequest.media_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block group"
                            >
                                <div className="relative overflow-hidden">
                                    <img
                                        src={selectedRequest.media_url}
                                        alt="Submitted photo"
                                        className="w-full max-h-64 object-cover transition-transform duration-300 group-hover:scale-105"
                                    />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                        <ExternalLink className="w-8 h-8 text-white" />
                                    </div>
                                </div>
                            </a>
                        </Card>
                        {selectedRequest.completion_photo_url && (
                            <Card className="overflow-hidden">
                                <div className="p-4 border-b border-white/10">
                                    <h3 className="font-semibold text-white flex items-center gap-2">
                                        <CheckCircle className="w-5 h-5 text-emerald-400" />
                                        Completion Photo
                                    </h3>
                                </div>
                                <a
                                    href={selectedRequest.completion_photo_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block group"
                                >
                                    <div className="relative overflow-hidden">
                                        <img
                                            src={selectedRequest.completion_photo_url}
                                            alt="Completion photo"
                                            className="w-full max-h-64 object-cover transition-transform duration-300 group-hover:scale-105"
                                        />
                                    </div>
                                </a>
                            </Card>
                        )}
                    </div>
                )}

                {/* Description - Full Width */}
                <Card className="p-6 mt-6">
                    <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-white/10">
                            <ExternalLink className="w-5 h-5 text-white/70" />
                        </div>
                        Description
                    </h3>
                    <p className="text-white/80 text-lg leading-relaxed whitespace-pre-wrap">
                        {selectedRequest.description}
                    </p>
                </Card>

                {/* Comments Section - Full Width */}
                <Card className="p-6 mt-6">
                    <h3 className="font-semibold text-white mb-6 flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-primary-500/20">
                            <MessageSquare className="w-5 h-5 text-primary-400" />
                        </div>
                        Community Discussion
                        <span className="ml-auto text-sm font-normal text-white/40">
                            {comments.length} comment{comments.length !== 1 ? 's' : ''}
                        </span>
                    </h3>

                    {/* Add Comment */}
                    <div className="mb-6 p-4 rounded-xl bg-white/5 border border-white/10">
                        <Textarea
                            placeholder="Share your thoughts or updates..."
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            rows={3}
                            className="mb-3 bg-transparent border-white/20 focus:border-primary-500"
                        />
                        <div className="flex justify-end">
                            <Button
                                onClick={handleAddComment}
                                disabled={!newComment.trim() || isSubmittingComment}
                                size="sm"
                            >
                                <Send className="w-4 h-4 mr-2" />
                                {isSubmittingComment ? 'Posting...' : 'Post Comment'}
                            </Button>
                        </div>
                    </div>

                    {/* Comment List */}
                    <div className="space-y-4 max-h-[500px] overflow-y-auto">
                        {isLoadingComments ? (
                            <div className="flex justify-center py-8">
                                <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : comments.length === 0 ? (
                            <div className="text-center py-8">
                                <MessageSquare className="w-12 h-12 mx-auto mb-3 text-white/20" />
                                <p className="text-white/40">No comments yet</p>
                                <p className="text-white/30 text-sm">Be the first to share an update!</p>
                            </div>
                        ) : (
                            comments.map((comment, index) => {
                                const isStaff = comment.username !== 'Resident';
                                return (
                                    <motion.div
                                        key={comment.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.05 }}
                                        className={`p-4 rounded-xl border ${isStaff ? 'bg-gradient-to-r from-purple-500/10 to-transparent border-purple-500/20' : 'bg-gradient-to-r from-white/5 to-transparent border-white/10'}`}
                                    >
                                        <div className="flex justify-between items-center mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isStaff ? 'bg-purple-500/20' : 'bg-primary-500/20'}`}>
                                                    {isStaff ? (
                                                        <Shield className="w-4 h-4 text-purple-300" />
                                                    ) : (
                                                        <User className="w-4 h-4 text-primary-300" />
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-white">{comment.username}</span>
                                                    {isStaff && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                                            <Shield className="w-3 h-3" />
                                                            Staff
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <span className="text-white/40 text-xs">{formatDate(comment.created_at)}</span>
                                        </div>
                                        <p className="text-white/70 pl-11">{comment.content}</p>
                                    </motion.div>
                                );
                            })
                        )}
                    </div>
                </Card>
            </motion.div>
        );
    }

    // List View
    return (
        <div className="min-h-screen">
            {/* Header */}
            <div className="mb-8">
                <h2 className="text-3xl font-bold text-white mb-2">Track Requests</h2>
                <p className="text-white/60 text-lg">View the status of community-reported issues</p>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <div className="flex-1">
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                        <Input
                            placeholder="Search by ID, category, or address..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-12 h-12 text-base"
                        />
                    </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                    {(['all', 'open', 'in_progress', 'closed'] as StatusFilter[]).map((filterStatus) => {
                        const colors = statusColors[filterStatus];
                        const isActive = statusFilter === filterStatus;
                        return (
                            <button
                                key={filterStatus}
                                onClick={() => setStatusFilter(filterStatus)}
                                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${isActive
                                    ? filterStatus === 'all'
                                        ? 'bg-primary-500 text-white'
                                        : `${colors?.bg} ${colors?.text} ${colors?.border} border`
                                    : 'bg-white/5 text-white/60 hover:bg-white/10 border border-transparent'
                                    }`}
                            >
                                {filterStatus === 'all' ? 'All Requests' : colors?.label || filterStatus}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Stats Summary - Moved above list */}
            <div className="grid grid-cols-3 gap-4 mb-8">
                {[
                    { status: 'open', color: 'amber', label: 'Open' },
                    { status: 'in_progress', color: 'blue', label: 'In Progress' },
                    { status: 'closed', color: 'emerald', label: 'Resolved' },
                ].map(({ status, color, label }) => (
                    <button
                        key={status}
                        onClick={() => setStatusFilter(status as StatusFilter)}
                        className={`p-4 rounded-2xl bg-gradient-to-br from-${color}-500/10 to-${color}-500/5 border border-${color}-500/20 hover:border-${color}-500/40 transition-all text-center group`}
                    >
                        <div className={`text-4xl font-bold text-${color}-400 group-hover:scale-110 transition-transform`}>
                            {requests.filter(r => r.status === status).length}
                        </div>
                        <div className="text-sm text-white/50 mt-1">{label}</div>
                    </button>
                ))}
            </div>

            {/* Request List */}
            {isLoading ? (
                <div className="flex justify-center py-16">
                    <div className="w-10 h-10 border-3 border-primary-500 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : filteredRequests.length === 0 ? (
                <Card className="p-12">
                    <div className="text-center">
                        <AlertCircle className="w-16 h-16 mx-auto mb-4 text-white/20" />
                        <p className="text-white/50 text-lg">No requests found</p>
                        <p className="text-white/30 text-sm mt-1">Try adjusting your search or filters</p>
                    </div>
                </Card>
            ) : (
                <div className="space-y-4">
                    {filteredRequests.map((request, index) => {
                        const status = statusColors[request.status] || statusColors.open;
                        return (
                            <motion.div
                                key={request.service_request_id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: Math.min(index * 0.01, 0.2) }}
                                onClick={() => handleSelectRequest(request)}
                                className="cursor-pointer group"
                            >
                                <Card className="p-5 hover:ring-2 hover:ring-primary-500/50 transition-all group-hover:bg-white/[0.03]">
                                    <div className="flex gap-5">
                                        {/* Thumbnail if has photo */}
                                        {request.media_url && (
                                            <div className="w-28 h-28 flex-shrink-0 rounded-xl overflow-hidden bg-white/5">
                                                <img
                                                    src={request.media_url}
                                                    alt=""
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                />
                                            </div>
                                        )}

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-4 mb-3">
                                                <div>
                                                    <h3 className="font-semibold text-white text-xl group-hover:text-primary-300 transition-colors">
                                                        {request.service_name}
                                                    </h3>
                                                    <p className="text-xs text-primary-400/70 font-mono mt-1">
                                                        {request.service_request_id}
                                                    </p>
                                                </div>
                                                <span className={`flex-shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${status.bg} ${status.text} ${status.border} border`}>
                                                    {status.icon}
                                                    {status.label}
                                                </span>
                                            </div>

                                            {request.address && (
                                                <div className="flex items-center gap-2 text-white/60 mb-3">
                                                    <MapPin className="w-4 h-4 flex-shrink-0" />
                                                    <span className="truncate">{request.address}</span>
                                                </div>
                                            )}

                                            <p className="text-white/50 line-clamp-2 mb-4">
                                                {request.description}
                                            </p>

                                            <div className="flex items-center gap-4 text-sm text-white/40">
                                                <span className="flex items-center gap-1.5">
                                                    <Calendar className="w-4 h-4" />
                                                    {formatShortDate(request.requested_datetime)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
