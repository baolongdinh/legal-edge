# 🚀 LegalShield - Công cụ Tra cứu & Đối soát Quy chuẩn AI

LegalShield là một nền tảng AI chuyên dụng phục vụ việc **Nghiên cứu Pháp lý & Quy chuẩn** với độ chính xác cao. Hệ thống chuyển đổi từ giao diện "chat" thông thường thành một công cụ **Search & Reference** (Tra cứu & Tham chiếu) mạnh mẽ, giúp người dùng xác thực thông tin trực tiếp từ các nguồn văn bản pháp luật chính thống.

<img width="1921" height="961" alt="image" src="https://github.com/user-attachments/assets/2bbf548a-f95e-43d6-b5c1-b4301a999d00" />

### 🌐 Trải nghiệm ngay: [https://legalshield-sandy.vercel.app](https://legalshield-sandy.vercel.app)

---

## ⚖️ Bối cảnh & Sứ mệnh

### Thách thức
Việc tìm kiếm và đối soát các quy định pháp luật Việt Nam thường tốn nhiều thời gian, dễ sai sót và chi phí cao. Các mô hình AI thông thường thường xuyên gặp hiện tượng "hallucination" (ảo tưởng), tự đưa ra các "lời khuyên" pháp lý không căn cứ hoặc trích dẫn các điều luật không tồn tại, gây ra rủi ro pháp lý lớn cho doanh nghiệp.

### Giải pháp của chúng tôi
LegalShield đóng vai trò là một **Kho lưu trữ Chủ quyền Số**. Chúng tôi kết hợp công nghệ **Deep RAG (Retrieval-Augmented Generation)** với các cơ sở dữ liệu luật đã được xác thực để cung cấp một công cụ không chỉ dừng lại ở mức "trò chuyện" mà là "tìm kiếm và xác thực".

**Sứ mệnh cốt lõi**: Giảm thiểu rủi ro pháp lý bằng cách cung cấp các bằng chứng quy chuẩn có thể xác thực tức thì.

---

## 🌟 Quy trình Nghiệp vụ Chính

### 1. Đối soát Quy chuẩn (`Regulatory Audit`)
Tự động quét các hợp đồng và tài liệu để phát hiện các rủi ro tiềm ẩn hoặc các điểm không tuân thủ dựa trên hơn 700+ quy định pháp luật hiện hành.

### 2. Tra cứu Chuyên sâu (`Deep Legal Search`)
Công cụ tìm kiếm hợp nhất giúp truy xuất các điều luật gốc và các bằng chứng thực tế từ web (thông qua Exa), tổng hợp chúng thành một câu trả lời duy nhất có trích dẫn nguồn rõ ràng.

### 3. Trợ lý Văn bản Tích hợp (`Integrated Document Assistant`)
Chỉnh sửa và soạn thảo văn bản với sự hỗ trợ của trợ lý tham chiếu pháp lý hiển thị song song, gợi ý cải thiện dựa trên các tiêu chuẩn quy chuẩn.
---

## 🛠 Công nghệ Sử dụng

- **Frontend**: React 19, Vite, Tailwind CSS, Zustand.
- **Trí tuệ nhân tạo**: Deep RAG (Hybrid Search + Jina Reranker v2).
- **Hệ thống xử lý**: Supabase Edge Functions (Gemini 1.5 Flash & Groq).
- **Hạ tầng**: PostgreSQL + pgvector, Vercel, PWA.

---

## 📖 Tài liệu Kỹ thuật

Để biết hướng dẫn cài đặt, cấu hình môi trường và triển khai hệ thống, vui lòng xem tại:

👉 **[SETUP.md](file:///home/aiozlong/DATA/CODE/SELF_PROD/LegalEdge/SETUP.md)**

---

*LegalShield là công cụ hỗ trợ tra cứu tham khảo. Vui lòng đối chiếu mọi thông tin với Công báo chính thống.*
