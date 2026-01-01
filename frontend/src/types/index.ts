// User types
export interface User {
    id: number;
    username: string;
    email: string;
    full_name: string | null;
    role: 'admin' | 'staff';
    is_active: boolean;
    created_at?: string;
    departments?: { id: number; name: string }[];
}

export interface UserCreate {
    username: string;
    email: string;
    full_name?: string;
    role: 'admin' | 'staff';
    password: string;
    department_ids?: number[];
}

// Department types
export interface Department {
    id: number;
    name: string;
    description: string | null;
    routing_email: string | null;
    is_active: boolean;
}

// Custom Question types
export interface CustomQuestion {
    id: string;           // UUID for tracking
    label: string;        // Question text
    type: 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'number' | 'date' | 'yes_no';
    options?: string[];   // For select/radio/checkbox types
    required: boolean;
    placeholder?: string;
}

// Service types
export interface ServiceDefinition {
    id: number;
    service_code: string;
    service_name: string;
    description: string | null;
    icon: string;
    is_active: boolean;
    departments: Department[];
    routing_mode?: 'township' | 'third_party' | 'road_based';
    routing_config?: {
        // Township mode
        route_to?: 'all_staff' | 'specific_staff';
        staff_ids?: number[];
        // Third party mode
        message?: string;
        contacts?: { name: string; phone: string; url: string }[];
        // Road-based mode
        default_handler?: 'township' | 'third_party';
        exclusion_list?: string[];
        inclusion_list?: string[];
        third_party_message?: string;
        third_party_contacts?: { name: string; phone: string; url: string }[];
        // Custom questions (applies to all modes)
        custom_questions?: CustomQuestion[];
    };
    assigned_department_id?: number;
    assigned_department?: Department;
}

export interface ServiceCreate {
    service_code: string;
    service_name: string;
    description?: string;
    icon?: string;
    department_ids?: number[];
    routing_mode?: string;
    routing_config?: Record<string, any>;
    assigned_department_id?: number;
}

// Service Request types
export type RequestStatus = 'open' | 'in_progress' | 'closed';
export type ClosedSubstatus = 'no_action' | 'resolved' | 'third_party';
export type CommentVisibility = 'internal' | 'external';

export interface ServiceRequest {
    id: number;
    service_request_id: string;
    service_code: string;
    service_name: string;
    description: string;
    status: RequestStatus;
    priority: number;
    address: string | null;
    lat: number | null;
    long: number | null;
    requested_datetime: string;
    updated_datetime: string | null;
    source: string;
    flagged: boolean;
    // Closed sub-status
    closed_substatus: ClosedSubstatus | null;
    // Soft delete
    deleted_at: string | null;
    deleted_by: string | null;
}

// Public-facing request (no personal information)
export interface PublicServiceRequest {
    service_request_id: string;
    service_code: string;
    service_name: string;
    description: string;
    status: RequestStatus;
    address: string | null;
    lat: number | null;
    long: number | null;
    requested_datetime: string;
    updated_datetime: string | null;
    closed_substatus: ClosedSubstatus | null;
    media_urls: string[];  // Array of photo URLs
    photo_count?: number;  // Number of photos (from list response)
    completion_message: string | null;
    completion_photo_url: string | null;
    assigned_to: string | null;
    assigned_department_name: string | null;
}

export interface ServiceRequestDetail extends ServiceRequest {
    first_name: string | null;
    last_name: string | null;
    email: string;
    phone: string | null;
    media_urls: string[];  // Array of photo URLs
    ai_analysis: Record<string, unknown> | null;
    flag_reason: string | null;
    staff_notes: string | null;
    assigned_department_id: number | null;
    assigned_department: Department | null;  // Full department info
    assigned_to: string | null;
    closed_datetime: string | null;
    // Completion fields
    completion_message: string | null;
    completion_photo_url: string | null;
    delete_justification: string | null;
    // Vertex AI Analysis placeholders
    vertex_ai_summary: string | null;
    vertex_ai_classification: string | null;
    vertex_ai_priority_score: number | null;
    vertex_ai_analyzed_at: string | null;
}

export interface RequestComment {
    id: number;
    service_request_id: number;
    user_id: number | null;
    username: string;
    content: string;
    visibility: CommentVisibility;
    created_at: string | null;
    updated_at: string | null;
}

export interface ServiceRequestCreate {
    service_code: string;
    description: string;
    address?: string;
    lat?: number;
    long?: number;
    first_name?: string;
    last_name?: string;
    email: string;
    phone?: string;
    media_urls?: string[];  // Up to 3 photo URLs/base64
    matched_asset?: {
        layer_name: string;
        layer_id: number;
        asset_id?: string;
        asset_type?: string;
        properties: Record<string, any>;
        distance_meters?: number;
    };
}


export interface ManualIntakeCreate {
    service_code: string;
    description: string;
    address?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    source: 'phone' | 'walk_in' | 'email';
}

// System Settings types
export interface SystemSettings {
    id: number;
    township_name: string;
    logo_url: string | null;
    favicon_url: string | null;
    hero_text: string;
    primary_color: string;
    modules: {
        ai_analysis: boolean;
        sms_alerts: boolean;
        email_notifications?: boolean;
    };
    updated_at: string | null;
}

// System Secret types
export interface SystemSecret {
    id: number;
    key_name: string;
    key_value?: string;  // Only returned for some secrets (not sensitive ones)
    description: string | null;
    is_configured: boolean;
}

// Statistics types
export interface Statistics {
    total_requests: number;
    open_requests: number;
    in_progress_requests: number;
    closed_requests: number;
    requests_by_category: Record<string, number>;
    requests_by_status: Record<string, number>;
    recent_requests: ServiceRequest[];
}

// Auth types
export interface LoginCredentials {
    username: string;
    password: string;
}

export interface AuthToken {
    access_token: string;
    token_type: string;
}

export interface AuthState {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
}
