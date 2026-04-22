import { Scale } from 'lucide-react'

export function GlobalDisclaimerFooter() {
    return (
        <div className="shrink-0 bg-transparent border-t border-lex-border/40 px-4 py-3">
            <div className="max-w-screen-xl mx-auto flex items-start gap-3">
                <Scale size={12} className="text-lex-gold shrink-0 mt-0.5" />
                <p className="text-[10px] text-lex-lawyer/70 font-sans leading-relaxed">
                    <strong className="text-lex-deep font-bold uppercase tracking-wider">Tuyên bố miễn trừ trách nhiệm pháp lý · </strong>
                    LegalShield là công cụ hỗ trợ tra cứu và soạn thảo bản nháp, không phải dịch vụ tư vấn pháp luật. Mọi nội dung do AI tạo ra chỉ mang tính tham khảo, không có giá trị pháp lý và không thay thế ý kiến của luật sư có chứng chỉ hành nghề theo quy định của Luật Luật sư Việt Nam. Người dùng chịu hoàn toàn trách nhiệm về việc sử dụng thông tin và văn bản từ nền tảng này.
                </p>
            </div>
        </div>
    )
}
