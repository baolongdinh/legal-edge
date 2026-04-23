import { Scale } from 'lucide-react'

export function GlobalDisclaimerFooter() {
    return (
        <div className="shrink-0 bg-transparent border-t border-lex-border/20 px-4 py-2">
            <div className="max-w-screen-xl mx-auto flex items-start gap-2">
                <Scale size={10} className="text-lex-gold shrink-0 mt-0.5 opacity-50" />
                <p className="text-[9px] text-lex-lawyer/60 font-sans leading-tight">
                    <strong className="text-lex-deep font-bold uppercase tracking-wider">Miễn trừ trách nhiệm · </strong>
                    LegalShield là trợ lý hỗ trợ tra cứu, không phải dịch vụ tư vấn pháp lý. Nội dung AI mang tính tham khảo và không thay thế ý kiến luật sư.
                </p>
            </div>
        </div>
    )
}
