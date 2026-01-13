import { useState } from 'react';
import { Globe, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const LANGUAGES = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'es', name: 'Español', flag: '🇪🇸' },
    { code: 'zh', name: '中文', flag: '🇨🇳' },
    { code: 'fr', name: 'Français', flag: '🇫🇷' },
    { code: 'hi', name: 'हिन्दी', flag: '🇮🇳' },
    { code: 'ar', name: 'العربية', flag: '🇸🇦' },
];

export default function LanguageSelector() {
    const [isOpen, setIsOpen] = useState(false);
    const [currentLang, setCurrentLang] = useState(() => {
        return localStorage.getItem('preferredLanguage') || 'en';
    });

    const currentLanguage = LANGUAGES.find(lang => lang.code === currentLang) || LANGUAGES[0];

    const changeLanguage = (code: string) => {
        setCurrentLang(code);
        localStorage.setItem('preferredLanguage', code);
        setIsOpen(false);
        // Reload page to fetch translated content from API
        window.location.reload();
    };

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-white"
                aria-label="Select language"
            >
                <Globe className="w-5 h-5" />
                <span className="hidden sm:inline">{currentLanguage.flag} {currentLanguage.name}</span>
                <span className="sm:hidden">{currentLanguage.flag}</span>
            </button>

            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop */}
                        <div
                            className="fixed inset-0 z-40"
                            onClick={() => setIsOpen(false)}
                        />

                        {/* Dropdown */}
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="absolute right-0 mt-2 w-56 rounded-xl glass-card p-2 shadow-xl z-50"
                        >
                            {LANGUAGES.map((language) => (
                                <button
                                    key={language.code}
                                    onClick={() => changeLanguage(language.code)}
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${currentLang === language.code
                                            ? 'bg-primary-500/30 text-white'
                                            : 'text-white/70 hover:bg-white/10 hover:text-white'
                                        }`}
                                >
                                    <span className="text-2xl">{language.flag}</span>
                                    <span className="flex-1 text-left font-medium">{language.name}</span>
                                    {currentLang === language.code && (
                                        <Check className="w-5 h-5 text-primary-400" />
                                    )}
                                </button>
                            ))}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
