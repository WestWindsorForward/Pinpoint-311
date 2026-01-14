import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

interface TranslationContextType {
    t: (text: string) => string;
    language: string;
    setLanguage: (lang: string) => void;
    isLoading: boolean;
    refreshKey: number; // Used to trigger re-fetches in components
}

const TranslationContext = createContext<TranslationContextType | null>(null);

// All UI strings that need translation (excluding proper nouns like township name and Pinpoint 311)
const UI_STRINGS = [
    // Hero section
    'How can we help?',
    'Report issues, request services, and help make our community better. Select a category below to get started.',
    'Search services...',
    'Community Support Active',

    // Navigation & Actions
    'Track My Requests',
    'Staff Login',
    'Submit Request',
    'Back',
    'Next',
    'Submit',
    'Cancel',
    'Close',
    'Save',
    'Delete',
    'Edit',
    'View',
    'Loading...',

    // Map section
    'Community Requests Map',
    'View all reported issues and service requests in our community',
    'Filters',
    'Recent Status',
    'New',
    'In Progress',
    'Resolved',
    'On Hold',
    'Categories',
    'Departments',
    'Assigned Staff',
    'Priority Level',

    // Form steps
    'Step 1 of 4',
    'Step 2 of 4',
    'Step 3 of 4',
    'Step 4 of 4',
    'Select a Category',
    'Describe the Issue',
    'Choose Location',
    'Your Information',

    // Form fields
    'Description',
    'Location',
    'Photos',
    'Contact Information',
    'First Name',
    'Last Name',
    'Email',
    'Phone',
    'Phone (optional)',
    'Address',
    'Enter your address',
    'Describe the issue in detail...',
    'Add up to 3 photos',
    'Optional: Add photos to help us understand the issue',
    'Drag and drop or click to upload',

    // Validation messages
    'This field is required',
    'Please enter a valid email address',
    'Please select a location on the map',
    'Please describe the issue',

    // Success page
    'Request Submitted!',
    'Thank you for your submission',
    'Your request has been submitted successfully.',
    'We will review your request and get back to you soon.',
    'Request ID',
    'Submit Another Request',
    'Track This Request',

    // Service categories
    'No services found matching your search.',
    'Loading service categories...',
    'Select a service category to report an issue',

    // Footer
    'Privacy Policy',
    'Accessibility',
    'Terms of Service',
    'All rights reserved',
    'Free & Open Source Municipal Platform',
    'Powered by',

    // Tracking page
    'Track Requests',
    'Track Your Request',
    'View the status of community-reported issues',
    'Back to all requests',
    'Timeline & Status',
    'Community Discussion',
    'Enter your Request ID or Email',
    'Request ID or Email',
    'Track',
    'Request Status',
    'Submitted',
    'Updated',
    'Status',
    'Priority',
    'Category',
    'Department',
    'Assigned To',
    'Timeline',
    'Comments',
    'Add a Comment',
    'Post Comment',
    'Share',
    'Link Copied!',
    'No comments yet',
    'Be the first to share an update!',
    'No requests found',
    'All Requests',
    'Open',
    'Try adjusting your search or filters',
    'Search by ID, category, or address...',
    'Click anywhere to close',
    'Submitted Photos',
    'Completion Photo',
    'Share your thoughts or updates...',
    'Enter your request ID or email to track your submission',

    // Misc
    'or',
    'and',
    'Show more',
    'Show less',
    'See all',
    'Clear',
    'Search',
    'Filter',
    'Sort by',
    'Date',
    'Newest first',
    'Oldest first',
];

interface TranslationProviderProps {
    children: ReactNode;
}

export function TranslationProvider({ children }: TranslationProviderProps) {
    const [language, setLanguageState] = useState(() => {
        return localStorage.getItem('preferredLanguage') || 'en';
    });
    const [translations, setTranslations] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    const setLanguage = useCallback((lang: string) => {
        setLanguageState(lang);
        localStorage.setItem('preferredLanguage', lang);
        // Trigger refresh in dependent components
        setRefreshKey(prev => prev + 1);
    }, []);

    // Load translations when language changes
    useEffect(() => {
        if (language === 'en') {
            setTranslations({});
            return;
        }

        // Check localStorage cache first
        const cacheKey = `translations_v2_${language}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            try {
                setTranslations(JSON.parse(cached));
                return;
            } catch {
                // Invalid cache, fetch fresh
            }
        }

        // Fetch translations from API
        const fetchTranslations = async () => {
            setIsLoading(true);
            try {
                const response = await fetch('/api/system/translate/batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        texts: UI_STRINGS,
                        target_lang: language
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    const translationMap: Record<string, string> = {};
                    UI_STRINGS.forEach((text, index) => {
                        if (data.translations[index]) {
                            translationMap[text] = data.translations[index];
                        }
                    });
                    setTranslations(translationMap);
                    // Cache in localStorage
                    localStorage.setItem(cacheKey, JSON.stringify(translationMap));
                }
            } catch (error) {
                console.error('Failed to fetch translations:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchTranslations();
    }, [language]);

    const t = useCallback((text: string): string => {
        if (language === 'en') return text;
        return translations[text] || text;
    }, [language, translations]);

    return (
        <TranslationContext.Provider value={{ t, language, setLanguage, isLoading, refreshKey }}>
            {children}
        </TranslationContext.Provider>
    );
}

export function useTranslation() {
    const context = useContext(TranslationContext);
    if (!context) {
        throw new Error('useTranslation must be used within a TranslationProvider');
    }
    return context;
}
