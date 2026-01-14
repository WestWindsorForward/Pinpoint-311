import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

interface TranslationContextType {
    t: (text: string) => string;
    language: string;
    setLanguage: (lang: string) => void;
    isLoading: boolean;
}

const TranslationContext = createContext<TranslationContextType | null>(null);

// UI strings that need translation
const UI_STRINGS = [
    'How can we help?',
    'Report issues, request services, and help make our community better. Select a category below to get started.',
    'Search services...',
    'Track My Requests',
    'Staff Login',
    'Community Requests Map',
    'View all reported issues and service requests in our community',
    'Loading...',
    'Submit Request',
    'Back',
    'Next',
    'Description',
    'Location',
    'Photos',
    'Contact Information',
    'First Name',
    'Last Name',
    'Email',
    'Phone (optional)',
    'Describe the issue in detail...',
    'Add up to 3 photos',
    'Privacy Policy',
    'Accessibility',
    'Terms of Service',
    'All rights reserved',
    'Free & Open Source Municipal Platform',
    'Powered by',
    'Request Submitted!',
    'Your request has been submitted successfully.',
    'Request ID',
    'Submit Another Request',
    'No services found matching your search.',
    'Loading service categories...',
    'Community Support Active',
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

    const setLanguage = useCallback((lang: string) => {
        setLanguageState(lang);
        localStorage.setItem('preferredLanguage', lang);
    }, []);

    // Load translations when language changes
    useEffect(() => {
        if (language === 'en') {
            setTranslations({});
            return;
        }

        // Check localStorage cache first
        const cacheKey = `translations_${language}`;
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
                const response = await fetch('/api/translate/batch', {
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
        <TranslationContext.Provider value={{ t, language, setLanguage, isLoading }}>
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
