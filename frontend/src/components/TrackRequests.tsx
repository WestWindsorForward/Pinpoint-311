import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    MapPin,
    Clock,
    CheckCircle,
    AlertCircle,
    Search,
    X,
    MessageSquare,
    Send,
    Image,
    Calendar,
    ArrowLeft,
} from 'lucide-react';
import { Card, Input, Button, Textarea } from './ui';
import { api } from '../services/api';
import { PublicServiceRequest, RequestComment } from '../types';

type StatusFilter = 'all' | 'open' | 'in_progress' | 'closed';

const statusColors: Record<string, { bg: string; text: string; label: string; icon: React.ReactNode }> = {
    open: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Open', icon: <AlertCircle className="w-4 h-4" /> },
    in_progress: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'In Progress', icon: <Clock className="w-4 h-4" /> },
    closed: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Resolved', icon: <CheckCircle className="w-4 h-4" /> },
};

export default function TrackRequests() {
    const [requests, setRequests] = useState<PublicServiceRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedRequest, setSelectedRequest] = useState<PublicServiceRequest | null>(null);
    const [comments, setComments] = useState<RequestComment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);
    const [isLoadingComments, setIsLoadingComments] = useState(false);

    useEffect(() => {
        loadRequests();
    }, [statusFilter]);

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
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="min-h-screen"
            >
                {/* Back Button */}
                <button
                    onClick={() => setSelectedRequest(null)}
                    className="flex items-center gap-2 text-white/60 hover:text-white mb-6 transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span>Back to all requests</span>
                </button>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main Content - Left Column */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Header Card */}
                        <Card>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                                <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${status.bg} ${status.text}`}>
                                    {status.icon}
                                    {status.label}
                                </span>
                                <span className="text-white/50 text-sm flex items-center gap-2">
                                    <Calendar className="w-4 h-4" />
                                    {formatDate(selectedRequest.requested_datetime)}
                                </span>
                            </div>
                            <h1 className="text-2xl font-bold text-white mb-2">
                                {selectedRequest.service_name}
                            </h1>
                            <p className="text-sm text-primary-400 font-mono">
                                {selectedRequest.service_request_id}
                            </p>
                        </Card>

                        {/* Location & Map */}
                        {selectedRequest.address && (
                            <Card>
                                <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                                    <MapPin className="w-5 h-5 text-primary-400" />
                                    Location
                                </h3>
                                <p className="text-white/70 mb-4">{selectedRequest.address}</p>

                                {selectedRequest.lat && selectedRequest.long && (
                                    <div className="rounded-xl overflow-hidden h-64 bg-white/5">
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

                        {/* Description */}
                        <Card>
                            <h3 className="font-semibold text-white mb-3">Description</h3>
                            <p className="text-white/70 whitespace-pre-wrap">{selectedRequest.description}</p>
                        </Card>

                        {/* Comments Section */}
                        <Card>
                            <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                                <MessageSquare className="w-5 h-5 text-primary-400" />
                                Comments ({comments.length})
                            </h3>

                            {/* Comment List */}
                            <div className="space-y-4 mb-6 max-h-96 overflow-y-auto">
                                {isLoadingComments ? (
                                    <div className="flex justify-center py-6">
                                        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                ) : comments.length === 0 ? (
                                    <p className="text-white/40 text-center py-6">No comments yet. Be the first to comment!</p>
                                ) : (
                                    comments.map((comment) => (
                                        <div key={comment.id} className="p-4 rounded-lg bg-white/5 border border-white/10">
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="font-medium text-white text-sm">{comment.username}</span>
                                                <span className="text-white/40 text-xs">{formatDate(comment.created_at)}</span>
                                            </div>
                                            <p className="text-white/70 text-sm">{comment.content}</p>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Add Comment */}
                            <div className="pt-4 border-t border-white/10">
                                <Textarea
                                    placeholder="Add a public comment..."
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    rows={3}
                                    className="mb-3"
                                />
                                <Button
                                    onClick={handleAddComment}
                                    disabled={!newComment.trim() || isSubmittingComment}
                                    className="w-full sm:w-auto"
                                >
                                    <Send className="w-4 h-4 mr-2" />
                                    {isSubmittingComment ? 'Posting...' : 'Post Comment'}
                                </Button>
                            </div>
                        </Card>
                    </div>

                    {/* Sidebar - Right Column */}
                    <div className="space-y-6">
                        {/* Photo */}
                        {selectedRequest.media_url && (
                            <Card>
                                <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                                    <Image className="w-5 h-5 text-primary-400" />
                                    Submitted Photo
                                </h3>
                                <a
                                    href={selectedRequest.media_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block"
                                >
                                    <img
                                        src={selectedRequest.media_url}
                                        alt="Submitted photo"
                                        className="w-full rounded-lg hover:opacity-90 transition-opacity"
                                    />
                                </a>
                            </Card>
                        )}

                        {/* Resolution Info (if closed) */}
                        {selectedRequest.status === 'closed' && (
                            <Card className="border-green-500/30">
                                <h3 className="font-semibold text-green-400 mb-3 flex items-center gap-2">
                                    <CheckCircle className="w-5 h-5" />
                                    Resolution
                                </h3>
                                <div className="space-y-3">
                                    <div>
                                        <span className="text-white/50 text-sm">Status: </span>
                                        <span className="text-white">
                                            {selectedRequest.closed_substatus === 'no_action' ? 'No Action Needed' :
                                                selectedRequest.closed_substatus === 'resolved' ? 'Resolved' :
                                                    selectedRequest.closed_substatus === 'third_party' ? 'Referred to Third Party' :
                                                        'Closed'}
                                        </span>
                                    </div>
                                    {selectedRequest.completion_message && (
                                        <div>
                                            <span className="text-white/50 text-sm block mb-1">Message:</span>
                                            <p className="text-white/70 text-sm">{selectedRequest.completion_message}</p>
                                        </div>
                                    )}
                                    {selectedRequest.completion_photo_url && (
                                        <a
                                            href={selectedRequest.completion_photo_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            <img
                                                src={selectedRequest.completion_photo_url}
                                                alt="Completion photo"
                                                className="w-full rounded-lg mt-2 hover:opacity-90 transition-opacity"
                                            />
                                        </a>
                                    )}
                                </div>
                            </Card>
                        )}

                        {/* Timeline */}
                        <Card>
                            <h3 className="font-semibold text-white mb-3">Timeline</h3>
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-white/50">Created</span>
                                    <span className="text-white">{formatShortDate(selectedRequest.requested_datetime)}</span>
                                </div>
                                {selectedRequest.updated_datetime && (
                                    <div className="flex justify-between">
                                        <span className="text-white/50">Last Updated</span>
                                        <span className="text-white">{formatShortDate(selectedRequest.updated_datetime)}</span>
                                    </div>
                                )}
                            </div>
                        </Card>
                    </div>
                </div >
            </motion.div >
        );
    }

    // List View
    return (
        <div className="min-h-screen">
            {/* Header */}
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-white mb-2">Track Requests</h2>
                <p className="text-white/60">View the status of all reported issues in the community</p>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="flex-1">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                        <Input
                            placeholder="Search by ID, category, or address..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                    {(['all', 'open', 'in_progress', 'closed'] as StatusFilter[]).map((status) => (
                        <Button
                            key={status}
                            variant={statusFilter === status ? 'primary' : 'secondary'}
                            size="sm"
                            onClick={() => setStatusFilter(status)}
                        >
                            {status === 'all' ? 'All' : statusColors[status]?.label || status}
                        </Button>
                    ))}
                </div>
            </div>

            {/* Request List */}
            {isLoading ? (
                <div className="flex justify-center py-12">
                    <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : filteredRequests.length === 0 ? (
                <Card>
                    <div className="text-center py-12">
                        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-white/30" />
                        <p className="text-white/50">No requests found</p>
                    </div>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {filteredRequests.map((request) => {
                        const status = statusColors[request.status] || statusColors.open;
                        return (
                            <motion.div
                                key={request.service_request_id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                onClick={() => setSelectedRequest(request)}
                                className="cursor-pointer"
                            >
                                <Card className="hover:ring-2 hover:ring-primary-500/50 transition-all">
                                    <div className="flex flex-col sm:flex-row gap-4">
                                        {/* Thumbnail if has photo */}
                                        {request.media_url && (
                                            <div className="sm:w-24 sm:h-24 h-40 flex-shrink-0 rounded-lg overflow-hidden bg-white/5">
                                                <img
                                                    src={request.media_url}
                                                    alt=""
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                        )}

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-4 mb-2">
                                                <div>
                                                    <h3 className="font-semibold text-white text-lg">
                                                        {request.service_name}
                                                    </h3>
                                                    <p className="text-xs text-primary-400 font-mono">
                                                        {request.service_request_id}
                                                    </p>
                                                </div>
                                                <span className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>
                                                    {status.icon}
                                                    {status.label}
                                                </span>
                                            </div>

                                            {request.address && (
                                                <div className="flex items-center gap-2 text-sm text-white/60 mb-2">
                                                    <MapPin className="w-4 h-4 flex-shrink-0" />
                                                    <span className="truncate">{request.address}</span>
                                                </div>
                                            )}

                                            <p className="text-white/50 text-sm line-clamp-2 mb-3">
                                                {request.description}
                                            </p>

                                            <div className="flex items-center gap-4 text-xs text-white/40">
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="w-3.5 h-3.5" />
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

            {/* Stats Summary */}
            <div className="mt-8 grid grid-cols-3 gap-4">
                <Card className="text-center py-6">
                    <div className="text-3xl font-bold text-yellow-400">
                        {requests.filter(r => r.status === 'open').length}
                    </div>
                    <div className="text-sm text-white/50 mt-1">Open</div>
                </Card>
                <Card className="text-center py-6">
                    <div className="text-3xl font-bold text-blue-400">
                        {requests.filter(r => r.status === 'in_progress').length}
                    </div>
                    <div className="text-sm text-white/50 mt-1">In Progress</div>
                </Card>
                <Card className="text-center py-6">
                    <div className="text-3xl font-bold text-green-400">
                        {requests.filter(r => r.status === 'closed').length}
                    </div>
                    <div className="text-sm text-white/50 mt-1">Resolved</div>
                </Card>
            </div>
        </div>
    );
}
