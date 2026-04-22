import React from 'react';
import { AlertCircle, Info } from 'lucide-react';
import { clsx } from 'clsx';

interface LegalDisclaimerProps {
    variant?: 'banner' | 'footer' | 'inline' | 'sidebar';
    className?: string;
    message?: string;
}

export const LegalDisclaimer: React.FC<LegalDisclaimerProps> = ({
    variant = 'inline',
    className,
    message = "Thông tin do AI tổng hợp, chỉ mang tính chất tham khảo. Không có giá trị pháp lý và không thay thế tư vấn từ luật sư có chứng chỉ hành nghề theo Luật Luật sư Việt Nam."
}) => {
    if (variant === 'banner') {
        return (
            <div className={clsx(
                "flex items-center gap-3 p-3 bg-amber-50/50 border border-amber-100 rounded-xl",
                className
            )}>
                <AlertCircle size={16} className="text-amber-600 flex-shrink-0" />
                <p className="text-[10px] md:text-xs text-amber-900/60 font-medium leading-relaxed">
                    {message}
                </p>
            </div>
        );
    }

    if (variant === 'sidebar') {
        return (
            <div className={clsx("px-6 py-4 border-t border-lex-border/40 bg-muted/10", className)}>
                <div className="flex gap-2">
                    <Info size={12} className="text-lex-gold/40 flex-shrink-0 mt-0.5" />
                    <p className="text-[9px] text-lex-lawyer/40 font-bold uppercase tracking-widest leading-normal">
                        Công cụ hỗ trợ tra cứu tham khảo. Không có giá trị thay thế tư vấn chuyên môn.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className={clsx(
            "flex items-start gap-2 py-2 opacity-50 hover:opacity-100 transition-opacity",
            variant === 'footer' ? "justify-center text-center" : "",
            className
        )}>
            {variant !== 'footer' && <AlertCircle size={12} className="text-lex-lawyer flex-shrink-0 mt-0.5" />}
            <p className={clsx(
                "text-[10px] text-lex-lawyer font-medium italic",
                variant === 'footer' ? "not-italic font-bold uppercase tracking-widest" : ""
            )}>
                {message}
            </p>
        </div>
    );
};
