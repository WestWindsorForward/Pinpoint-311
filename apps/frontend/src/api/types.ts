export type RequestStatus = "new" | "in_progress" | "resolved" | "closed";
export type RequestPriority = "low" | "medium" | "high" | "emergency";
export type NoteVisibility = "public" | "internal";
export type NotificationMethod = "email" | "sms";
export type AttachmentType = "initial" | "completion" | "other";

export interface TownshipConfigResponse {
  township: {
    name: string;
    primary_color: string;
    secondary_color: string;
    timezone: string;
    logo_path?: string | null;
  };
  branding?: {
    hero_headline?: string;
    hero_subtitle?: string;
  } | null;
  feature_flags: Record<string, boolean>;
  issue_categories: IssueCategory[];
}

export interface IssueCategory {
  code: string;
  label: string;
  description?: string | null;
  default_priority?: string | null;
  default_department?: string | null;
}

export interface ResidentRequestSummary {
  public_id: string;
  status: RequestStatus;
  priority: RequestPriority;
  category_code?: string | null;
  created_at: string;
  updated_at: string;
  jurisdiction?: string | null;
  assigned_department?: string | null;
}

export interface ResidentTimelineEntry {
  status: RequestStatus;
  note?: string | null;
  timestamp: string;
  changed_by?: string | null;
}

export interface RequestNotePublic {
  body: string;
  created_at: string;
}

export interface ResidentRequestDetail extends ResidentRequestSummary {
  title: string;
  description: string;
  public_notes: RequestNotePublic[];
  timeline: ResidentTimelineEntry[];
}

export interface StaffRequestListItem {
  id: string;
  public_id: string;
  title: string;
  status: RequestStatus;
  priority: RequestPriority;
  category_code?: string | null;
  submitter_name?: string | null;
  created_at: string;
  assigned_department?: string | null;
  assigned_to?: StaffUser | null;
}

export interface StaffUser {
  id: string;
  email: string;
  full_name?: string | null;
  phone_number?: string | null;
  role: "admin" | "manager" | "worker";
  is_active: boolean;
}

export interface StaffRequestDetail extends StaffRequestListItem {
  description: string;
  submitter_email?: string | null;
  submitter_phone?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_address?: string | null;
  notes: StaffNote[];
  attachments: Attachment[];
  notifications: NotificationOptIn[];
  history: StatusHistory[];
}

export interface RequestNoteCreate {
  visibility: NoteVisibility;
  body: string;
}

export interface RequestAssignmentUpdate {
  assigned_to_id?: string | null;
  assigned_department?: string | null;
}

export interface StaffNote {
  id: number;
  visibility: NoteVisibility;
  body: string;
  created_at: string;
  updated_at: string;
  author?: StaffUser | null;
}

export interface Attachment {
  id: number;
  file_path: string;
  file_type: AttachmentType;
  label?: string | null;
  created_at: string;
}

export interface NotificationOptIn {
  id: number;
  method: NotificationMethod;
  target: string;
  created_at: string;
  is_verified: boolean;
}

export interface StatusHistory {
  from_status?: RequestStatus | null;
  to_status: RequestStatus;
  note?: string | null;
  created_at: string;
  changed_by?: StaffUser | null;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export interface DashboardSummary {
  summary: Record<RequestStatus, number>;
}
