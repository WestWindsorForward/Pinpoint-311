export type UserRole = "resident" | "staff" | "admin";

export type Branding = {
  town_name?: string;
  hero_text?: string;
  primary_color?: string;
  secondary_color?: string;
  logo_url?: string;
  seal_url?: string;
};

export type IssueCategory = {
  slug: string;
  name: string;
  description?: string | null;
  priority: string;
  default_department_slug?: string | null;
  department_name?: string | null;
};

export type ResidentConfig = {
  branding: Branding;
  assets: Record<string, string>;
  integrations: {
    google_maps_api_key?: string | null;
  };
  categories: IssueCategory[];
};

export type RequestAttachment = {
  id: number;
  file_path: string;
  content_type?: string | null;
  is_completion_photo: boolean;
  created_at: string;
};

export type RequestUpdate = {
  id: number;
  request_id: string;
  notes: string;
  public: boolean;
  status_override?: string | null;
  created_at: string;
  updated_at: string;
};

export type ServiceRequest = {
  id: string;
  external_id: string;
  service_code: string;
  description: string;
  status: string;
  priority: string;
  latitude?: number | null;
  longitude?: number | null;
  address_string?: string | null;
  ai_analysis?: Record<string, unknown> | null;
  jurisdiction_warning?: string | null;
  created_at: string;
  attachments?: RequestAttachment[];
  updates?: RequestUpdate[];
};

export type AuthUser = {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  department?: string | null;
};

export type Department = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  is_active: boolean;
};

export type GeoBoundary = {
  id: number;
  name: string;
  kind: "primary" | "exclusion";
  jurisdiction?: "township" | "county" | "state" | "federal" | "other" | null;
  redirect_url?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
};

export type SecretSummary = {
  id: string;
  provider: string;
  created_at: string;
  metadata: Record<string, unknown>;
};

export type StaffUser = AuthUser & {
  phone_number?: string | null;
  is_active: boolean;
};

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
};
