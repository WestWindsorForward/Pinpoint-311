import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Clock, CheckCircle, AlertCircle, Search, Filter } from 'lucide-react';
import { Card, Input, Button } from './ui';
import { api } from '../services/api';
import { PublicServiceRequest } from '../types';

type StatusFilter = 'all' | 'open' | 'in_progress' | 'closed';

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
    open: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Open' },
    in_progress: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'In Progress' },
    closed: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Resolved' },
};

export default function TrackRequests() {
    const [requests, setRequests] = useState<PublicServiceRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedRequest, setSelectedRequest] = useState<PublicServiceRequest | null>(null);

    useEffect(() => {
        loadRequests();
    }, [statusFilter]);

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
        });
    };

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
                    {filteredRequests.map((request) => (
                        <motion.div
                            key={request.service_request_id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            onClick={() => setSelectedRequest(selectedRequest?.service_request_id === request.service_request_id ? null : request)}
                            className="cursor-pointer"
                        >
                            <Card className={`transition-all ${selectedRequest?.service_request_id === request.service_request_id ? 'ring-2 ring-primary-500' : ''}`}>
                                <div className="flex flex-col sm:flex-row gap-4">
                                    {/* Status Badge */}
                                    <div className="flex-shrink-0">
                                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${statusColors[request.status]?.bg || 'bg-white/10'} ${statusColors[request.status]?.text || 'text-white'}`}>
                                            {request.status === 'open' && <AlertCircle className="w-3 h-3 mr-1" />}
                                            {request.status === 'in_progress' && <Clock className="w-3 h-3 mr-1" />}
                                            {request.status === 'closed' && <CheckCircle className="w-3 h-3 mr-1" />}
                                            {statusColors[request.status]?.label || request.status}
                                        </span>
                                    </div>

                                    {/* Main Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <h3 className="font-semibold text-white">{request.service_name}</h3>
                                                <p className="text-sm text-white/50 mt-1">{request.service_request_id}</p>
                                            </div>
                                            <span className="text-xs text-white/40 whitespace-nowrap">
                                                {formatDate(request.requested_datetime)}
                                            </span>
                                        </div>

                                        {request.address && (
                                            <div className="flex items-center gap-2 mt-2 text-sm text-white/60">
                                                <MapPin className="w-4 h-4 flex-shrink-0" />
                                                <span className="truncate">{request.address}</span>
                                            </div>
                                        )}

                                        {/* Expanded Details */}
                                        {selectedRequest?.service_request_id === request.service_request_id && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="mt-4 pt-4 border-t border-white/10"
                                            >
                                                <p className="text-white/70 text-sm">{request.description}</p>

                                                {request.closed_substatus && (
                                                    <div className="mt-3 p-2 rounded-lg bg-white/5">
                                                        <span className="text-xs text-white/50">Resolution: </span>
                                                        <span className="text-sm text-white">
                                                            {request.closed_substatus === 'no_action' ? 'No Action Needed' :
                                                                request.closed_substatus === 'resolved' ? 'Resolved' :
                                                                    request.closed_substatus === 'third_party' ? 'Referred to Third Party' :
                                                                        request.closed_substatus}
                                                        </span>
                                                    </div>
                                                )}

                                                {request.updated_datetime && (
                                                    <p className="text-xs text-white/40 mt-3">
                                                        Last updated: {formatDate(request.updated_datetime)}
                                                    </p>
                                                )}
                                            </motion.div>
                                        )}
                                    </div>
                                </div>
                            </Card>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Stats Summary */}
            <div className="mt-8 grid grid-cols-3 gap-4">
                <Card className="text-center">
                    <div className="text-2xl font-bold text-yellow-400">
                        {requests.filter(r => r.status === 'open').length}
                    </div>
                    <div className="text-xs text-white/50 mt-1">Open</div>
                </Card>
                <Card className="text-center">
                    <div className="text-2xl font-bold text-blue-400">
                        {requests.filter(r => r.status === 'in_progress').length}
                    </div>
                    <div className="text-xs text-white/50 mt-1">In Progress</div>
                </Card>
                <Card className="text-center">
                    <div className="text-2xl font-bold text-green-400">
                        {requests.filter(r => r.status === 'closed').length}
                    </div>
                    <div className="text-xs text-white/50 mt-1">Resolved</div>
                </Card>
            </div>
        </div>
    );
}
