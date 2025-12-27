import {
    AuthToken,
    User,
    ServiceDefinition,
    ServiceRequest,
    ServiceRequestDetail,
    ServiceRequestCreate,
    ManualIntakeCreate,
    SystemSettings,
    SystemSecret,
    Statistics,
    UserCreate,
    ServiceCreate,
    Department,
} from '../types';

const API_BASE = '/api';

class ApiClient {
    private token: string | null = null;

    setToken(token: string | null) {
        this.token = token;
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Request failed' }));
            // Handle FastAPI validation errors (422)
            if (error.detail && Array.isArray(error.detail)) {
                const messages = error.detail.map((e: any) => e.msg || e.message || JSON.stringify(e)).join(', ');
                throw new Error(messages || 'Validation error');
            }
            throw new Error(error.detail || error.message || 'Request failed');
        }

        if (response.status === 204) {
            return undefined as T;
        }

        return response.json();
    }

    // Auth
    async login(username: string, password: string): Promise<AuthToken> {
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);

        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Login failed' }));
            throw new Error(error.detail || 'Login failed');
        }

        return response.json();
    }

    async getMe(): Promise<User> {
        return this.request<User>('/auth/me');
    }

    // Services (Public)
    async getServices(): Promise<ServiceDefinition[]> {
        return this.request<ServiceDefinition[]>('/services/');
    }

    // Services (Admin)
    async createService(data: ServiceCreate): Promise<ServiceDefinition> {
        return this.request<ServiceDefinition>('/services/', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async deleteService(id: number): Promise<void> {
        return this.request<void>(`/services/${id}`, { method: 'DELETE' });
    }

    async updateService(id: number, data: Partial<ServiceDefinition>): Promise<ServiceDefinition> {
        return this.request<ServiceDefinition>(`/services/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    // Departments
    async getDepartments(): Promise<Department[]> {
        return this.request<Department[]>('/departments/');
    }

    async createDepartment(data: Partial<Department>): Promise<Department> {
        return this.request<Department>('/departments/', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async updateDepartment(id: number, data: Partial<Department>): Promise<Department> {
        return this.request<Department>(`/departments/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    async deleteDepartment(id: number): Promise<void> {
        return this.request<void>(`/departments/${id}`, { method: 'DELETE' });
    }

    // Service Requests (Public)
    async createRequest(data: ServiceRequestCreate): Promise<ServiceRequest> {
        return this.request<ServiceRequest>('/open311/v2/requests.json', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    // Service Requests (Staff)
    async getRequests(status?: string): Promise<ServiceRequest[]> {
        const params = status ? `?status=${status}` : '';
        return this.request<ServiceRequest[]>(`/open311/v2/requests.json${params}`);
    }

    async getRequestDetail(requestId: string): Promise<ServiceRequestDetail> {
        return this.request<ServiceRequestDetail>(`/open311/v2/requests/${requestId}.json`);
    }

    async updateRequestStatus(
        requestId: string,
        status: string,
        notes?: string
    ): Promise<ServiceRequestDetail> {
        return this.request<ServiceRequestDetail>(`/open311/v2/requests/${requestId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status, staff_notes: notes }),
        });
    }

    async createManualIntake(data: ManualIntakeCreate): Promise<ServiceRequest> {
        return this.request<ServiceRequest>('/open311/v2/requests/manual', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    // Users (Admin)
    async getUsers(): Promise<User[]> {
        return this.request<User[]>('/users/');
    }

    async createUser(data: UserCreate): Promise<User> {
        return this.request<User>('/users/', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async deleteUser(id: number): Promise<void> {
        return this.request<void>(`/users/${id}`, { method: 'DELETE' });
    }

    async resetUserPassword(id: number, newPassword: string): Promise<User> {
        return this.request<User>(`/users/${id}/reset-password-json`, {
            method: 'POST',
            body: JSON.stringify({ new_password: newPassword }),
        });
    }

    // System Settings
    async getSettings(): Promise<SystemSettings> {
        return this.request<SystemSettings>('/system/settings');
    }

    async updateSettings(data: Partial<SystemSettings>): Promise<SystemSettings> {
        return this.request<SystemSettings>('/system/settings', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    // System Secrets (Admin)
    async getSecrets(): Promise<SystemSecret[]> {
        return this.request<SystemSecret[]>('/system/secrets');
    }

    async updateSecret(keyName: string, value: string): Promise<SystemSecret> {
        return this.request<SystemSecret>('/system/secrets', {
            method: 'POST',
            body: JSON.stringify({ key_name: keyName, key_value: value }),
        });
    }

    // Statistics
    async getStatistics(): Promise<Statistics> {
        return this.request<Statistics>('/system/statistics');
    }

    // System Update (Admin)
    async updateSystem(): Promise<{ status: string; message: string }> {
        return this.request<{ status: string; message: string }>('/system/update', {
            method: 'POST',
        });
    }

    // Domain Configuration (Admin)
    async configureDomain(domain: string): Promise<{
        status: string;
        message: string;
        domain?: string;
        nginx_config?: string;
        setup_script?: string;
        instructions?: string[];
    }> {
        return this.request(`/system/domain/configure?domain=${encodeURIComponent(domain)}`, {
            method: 'POST',
        });
    }

    async getDomainStatus(): Promise<{
        configured_domains: Array<{ domain: string; has_ssl: boolean }>;
        server_ip: string;
    }> {
        return this.request('/system/domain/status');
    }

    // GIS / Maps
    async getMapsConfig(): Promise<{
        has_google_maps: boolean;
        google_maps_api_key: string | null;
        default_center: { lat: number; lng: number };
        default_zoom: number;
    }> {
        return this.request('/gis/config');
    }

    async geocodeAddress(address: string): Promise<{
        lat: number;
        lng: number;
        formatted_address: string;
        place_id?: string;
    }> {
        return this.request(`/gis/geocode?address=${encodeURIComponent(address)}`);
    }

    async reverseGeocode(lat: number, lng: number): Promise<{
        lat: number;
        lng: number;
        formatted_address: string;
    }> {
        return this.request(`/gis/reverse-geocode?lat=${lat}&lng=${lng}`);
    }

    async searchCensusBoundary(townName: string, stateAbbr: string, layerType: string = 'township'): Promise<{
        results: Array<{
            name: string;
            full_name: string;
            geoid: string;
            state: string;
            layer_type: string;
            geometry: any;
        }>;
        message?: string;
    }> {
        return this.request(`/gis/census-boundary-search?town_name=${encodeURIComponent(townName)}&state_abbr=${stateAbbr}&layer_type=${layerType}`);
    }

    async saveCensusBoundary(name: string, geometry: any): Promise<{ status: string; message: string }> {
        return this.request(`/gis/boundaries/save-census?name=${encodeURIComponent(name)}`, {
            method: 'POST',
            body: JSON.stringify(geometry),
        });
    }
}

export const api = new ApiClient();
export default api;
