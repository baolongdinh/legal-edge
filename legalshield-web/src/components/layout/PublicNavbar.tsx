import { Link, useLocation } from 'react-router-dom';
import { Scale } from 'lucide-react';
import { clsx } from 'clsx';

interface PublicNavbarProps {
    onAuthClick?: (mode: 'signin' | 'signup') => void;
}

export function PublicNavbar({ onAuthClick }: PublicNavbarProps) {
    const { pathname } = useLocation();

    const navLinks = [
        { path: '/platform', label: 'Nền tảng' },
        { path: '/solutions', label: 'Giải pháp' },
        { path: '/resources', label: 'Tài nguyên' },
        { path: '/pricing', label: 'Bảng giá' },
    ];

    return (
        <header className="bg-lex-deep sticky top-0 z-50 shadow-md">
            <nav className="flex justify-between items-center px-6 md:px-12 py-5 w-full max-w-screen-2xl mx-auto">
                <Link to="/" className="flex items-center gap-2 group">
                    <Scale className="text-lex-gold group-hover:scale-110 transition-transform" size={24} />
                    <span className="font-serif text-2xl font-bold text-lex-ivory tracking-tight">LegalShield</span>
                </Link>

                <div className="hidden md:flex space-x-10 items-center">
                    {navLinks.map((link) => {
                        const isActive = pathname === link.path;
                        return (
                            <Link
                                key={link.path}
                                to={link.path}
                                className={clsx(
                                    "font-sans uppercase tracking-[0.15em] text-[11px] font-bold transition-colors",
                                    isActive
                                        ? "text-lex-gold border-b-2 border-lex-gold pb-1"
                                        : "text-lex-ivory/80 hover:text-lex-gold pb-1 border-b-2 border-transparent"
                                )}
                            >
                                {link.label}
                            </Link>
                        );
                    })}
                </div>

                <div className="flex items-center space-x-6">
                    {onAuthClick ? (
                        <>
                            <button
                                onClick={() => onAuthClick('signin')}
                                className="font-sans uppercase tracking-widest text-[11px] font-bold text-lex-ivory/80 hover:text-lex-ivory transition-colors hidden sm:block"
                            >
                                Đăng nhập
                            </button>
                            <button
                                onClick={() => onAuthClick('signup')}
                                className="bg-lex-gold text-lex-deep px-6 py-2.5 rounded-lg font-bold text-sm tracking-wide hover:scale-105 transition-transform shadow-lg shadow-lex-gold/20"
                            >
                                Bắt đầu ngay
                            </button>
                        </>
                    ) : (
                        <Link
                            to="/dashboard"
                            className="bg-lex-gold text-lex-deep px-6 py-2.5 rounded-lg font-bold text-sm tracking-wide hover:scale-105 transition-transform shadow-lg shadow-lex-gold/20"
                        >
                            Vào ứng dụng
                        </Link>
                    )}
                </div>
            </nav>
        </header>
    );
}
