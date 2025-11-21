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
};

export type ResidentConfig = {
  branding: Branding;
  assets: Record<string, string>;
  integrations: {
    google_maps_api_key?: string | null;
  };
  categories: IssueCategory[];
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
};

export type AuthUser = {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  department?: string | null;
};

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
};
