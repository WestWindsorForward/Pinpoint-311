import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Initial resources (will be loaded dynamically from backend)
const fallbackTranslations = {
    en: {
        translation: {
            loading: 'Loading...',
            submit: 'Submit',
            cancel: 'Cancel',
        }
    }
};

i18n
    .use(LanguageDetector) // Detect user language
    .use(initReactI18next) // Pass i18n instance to react-i18next
    .init({
        resources: fallbackTranslations,
        fallbackLng: 'en', // Fallback language
        debug: false,

        interpolation: {
            escapeValue: false, // React already escapes
        },

        detection: {
            // Order of language detection
            order: ['localStorage', 'navigator', 'htmlTag'],
            caches: ['localStorage'],
            lookupLocalStorage: 'i18nextLng',
        },
    });

export default i18n;
