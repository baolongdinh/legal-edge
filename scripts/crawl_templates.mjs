#!/usr/bin/env node

import { writeFile, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createHash } from 'node:crypto'

const rootDir = process.cwd()

const envCandidates = [
  path.join(rootDir, 'supabase', '.env'),
  path.join(rootDir, '.env'),
]

async function loadEnv() {
  for (const f of envCandidates) {
    try {
      const content = await readFile(f, 'utf8')
      for (const line of content.split('\n')) {
        const m = line.trim().match(/^([A-Za-z_]+)=(.*)$/)
        if (m) {
          const [_, k, v] = m
          if (!process.env[k]) process.env[k] = v.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
        }
      }
    } catch { }
  }
}
await loadEnv()

const EXA_API_KEY = process.env.EXA_API_KEY || process.env.EXA_API_KEYS?.split(',')[0]?.trim()
const crawledDir = path.join(rootDir, 'templates', 'crawled')
const libraryDir = path.join(rootDir, 'templates', 'library')
const outputPath = path.join(crawledDir, `templates-${new Date().toISOString().slice(0, 10)}.json`)

// Tunables via ENV
const NUM_RESULTS = Number(process.env.EXA_NUM_RESULTS || 25)
const MAX_CHARS = Number(process.env.EXA_MAX_CHARS || 6000)
const CONCURRENCY = Number(process.env.CRAWL_CONCURRENCY || 4)
const STRICT_DOMAINS = String(process.env.STRICT_DOMAINS || 'true').toLowerCase() === 'true'
const EXTRA_INCLUDE = (process.env.EXA_INCLUDE_DOMAINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

const DEFAULT_INCLUDE = [
  // --- NHÓM TRA CỨU TỔNG HỢP & DỊCH VỤ LUẬT ---
  'thuvienphapluat.vn',
  'luatvietnam.vn',
  'lawnet.vn',
  'vbpl.vn',
  'luatminhkhue.vn',
  'luatduonggia.vn',
  'hethongphapluatvietnam.com',
  'luattoanquoc.com',
  'danluat.thuvienphapluat.vn',

  // --- NHÓM CƠ QUAN TRUNG ƯƠNG & CÔNG BÁO ---
  'chinhphu.vn',
  'vanban.chinhphu.vn',
  'congbao.chinhphu.vn',
  'moj.gov.vn', // Bộ Tư pháp
  'quochoi.vn',
  'data.gov.vn',

  // --- NHÓM TƯ PHÁP, TÒA ÁN & ÁN LỆ (CỰC KỲ QUAN TRỌNG) ---
  'anle.toaan.gov.vn',      // Nguồn án lệ chính thức
  'congbobanan.toaan.gov.vn', // Nguồn bản án thực tế
  'toaan.gov.vn',
  'vksndtc.gov.vn',         // Viện kiểm sát nhân dân tối cao
  'lsvn.vn',                // Liên đoàn Luật sư Việt Nam

  // --- NHÓM CHUYÊN NGÀNH: TÀI CHÍNH, THUẾ, ĐẦU TƯ ---
  'gdt.gov.vn',      // Tổng cục Thuế (Công văn hướng dẫn thuế)
  'sbv.gov.vn',      // Ngân hàng Nhà nước (Ngoại hối, Tín dụng)
  'ssc.gov.vn',      // Ủy ban Chứng khoán
  'customs.gov.vn',  // Tổng cục Hải quan
  'dkkd.gov.vn',     // Đăng ký kinh doanh
  'mpi.gov.vn',      // Bộ Kế hoạch và Đầu tư
  'moit.gov.vn',     // Bộ Công thương
  'mof.gov.vn',      // Bộ Tài chính

  // --- NHÓM SỞ HỮU TRÍ TUỆ & CÔNG NGHỆ ---
  'ipvietnam.gov.vn', // Cục Sở hữu trí tuệ
  'cov.gov.vn',       // Cục Bản quyền tác giả
  'mic.gov.vn',       // Bộ Thông tin và Truyền thông (An ninh mạng, Chuyển đổi số)

  // --- NHÓM BÁO CHÍ PHÁP LUẬT CHUYÊN SÂU ---
  'tapchitoaan.vn',
  'kiemsat.vn',
  'baophapluat.vn',
  'noichinh.vn'
]
const INCLUDE_DOMAINS = Array.from(new Set([...DEFAULT_INCLUDE, ...EXTRA_INCLUDE]))

// Expanded searches with multiple variants per category
const BASE_SEARCHES = [
  {
    category: 'chung',
    template_kind: 'full_template',
    queries: [
      'mẫu hợp đồng dịch vụ file word việt nam',
      'mẫu hợp đồng dịch vụ docx việt nam',
      'mẫu hợp đồng dịch vụ pdf việt nam',
      'mẫu hợp đồng cung cấp dịch vụ việt nam',
      'mẫu hợp đồng thuê dịch vụ việt nam',
      'service agreement template Vietnam docx',
      'hợp đồng dịch vụ song ngữ việt anh mẫu',
    ],
  },
  {
    category: 'bảo mật',
    template_kind: 'full_template',
    queries: [
      'mẫu thỏa thuận bảo mật nda file word việt nam',
      'mẫu thỏa thuận bảo mật thông tin docx việt nam',
      'mẫu hợp đồng bảo mật thông tin việt nam',
      'non-disclosure agreement template Vietnam docx',
    ],
  },
  {
    category: 'thanh toán',
    template_kind: 'clause_snippet',
    queries: [
      'điều khoản thanh toán hợp đồng mẫu việt nam',
      'điều khoản tạm ứng thanh toán hợp đồng',
      'điều khoản phạt chậm thanh toán hợp đồng',
      'payment terms clause Vietnam contract',
      'điều khoản thanh toán theo tiến độ hợp đồng',
    ],
  },
  {
    category: 'tranh chấp',
    template_kind: 'clause_snippet',
    queries: [
      'điều khoản giải quyết tranh chấp hợp đồng mẫu việt nam',
      'điều khoản trọng tài trong hợp đồng mẫu việt nam',
      'điều khoản luật áp dụng và giải quyết tranh chấp',
      'dispute resolution clause Vietnam contract',
    ],
  },
  {
    category: 'luật_bảo_hiểm',
    template_kind: 'legal_doc',
    queries: [
      'văn bản luật kinh doanh bảo hiểm 2022 full pdf word',
      'nghị định 67 2023 nđ-cp bảo hiểm bắt buộc dân sự chủ xe cơ giới',
      'thông tư hướng dẫn luật kinh doanh bảo hiểm mới nhất',
      'quy định về bồi thường bảo hiểm nhân thọ việt nam',
      'luật bảo hiểm xã hội mới nhất 2024 văn bản hợp nhất',
    ],
  },
  {
    category: 'lao_dong',
    template_kind: 'full_template',
    queries: [
      'mẫu hợp đồng lao động mới nhất theo Bộ luật Lao động 2019',
      'mẫu nội quy lao động doanh nghiệp file word',
      'thỏa ước lao động tập thể mẫu cho công ty',
      'mẫu quyết định chấm dứt hợp đồng lao động đúng luật',
      'mẫu biên bản kỷ luật lao động và trình tự xử lý',
      'labor contract template Vietnam compliant with 2019 Code',
    ],
  },
  {
    category: 'so_huu_tri_tue',
    template_kind: 'clause_snippet',
    queries: [
      'điều khoản chuyển giao quyền sở hữu trí tuệ trong hợp đồng',
      'điều khoản cam đoan không vi phạm bản quyền bên thứ ba',
      'mẫu thỏa thuận li-xăng nhãn hiệu/quyền tác giả',
      'intellectual property assignment clause Vietnam contract',
      'quy định về xử lý xâm phạm quyền SHTT trong hợp đồng gia công',
    ],
  },
  {
    category: 'mien_tru_trach_nhiem',
    template_kind: 'clause_snippet',
    queries: [
      'điều khoản bất khả kháng force majeure mẫu việt nam',
      'điều khoản giới hạn trách nhiệm bồi thường thiệt hại tối đa',
      'các trường hợp miễn trừ trách nhiệm trong hợp đồng dân sự',
      'limitation of liability clause Vietnam law',
      'định nghĩa sự kiện bất khả kháng do dịch bệnh/chiến tranh mẫu',
    ],
  },
  {
    category: 'doanh_nghiep_quan_tri',
    template_kind: 'legal_doc',
    queries: [
      'mẫu điều lệ công ty cổ phần/TNHH theo Luật Doanh nghiệp 2020',
      'mẫu biên bản họp hội đồng quản trị/đại hội đồng cổ đông',
      'quy chế quản trị nội bộ doanh nghiệp mẫu file docx',
      'thủ tục thay đổi người đại diện theo pháp luật mới nhất',
      'mẫu hợp đồng chuyển nhượng cổ phần/phần vốn góp',
    ],
  },
  {
    category: 'du_lieu_ca_nhan',
    template_kind: 'legal_doc',
    queries: [
      'mẫu văn bản đồng ý xử lý dữ liệu cá nhân Nghị định 13/2023',
      'quy định về bảo vệ dữ liệu cá nhân trong hợp đồng lao động',
      'mẫu thông báo xử lý dữ liệu cá nhân cho khách hàng',
      'Personal Data Protection (PDP) clause Vietnam compliance',
      'hồ sơ đánh giá tác động xử lý dữ liệu cá nhân mẫu',
    ],
  },
  {
    category: 'bat_dong_san',
    template_kind: 'full_template',
    queries: [
      'mẫu hợp đồng thuê văn phòng/mặt bằng kinh doanh chi tiết',
      'mẫu hợp đồng đặt cọc mua bán nhà đất đúng quy định',
      'điều khoản sửa chữa cải tạo và hoàn trả mặt bằng thuê',
      'office lease agreement template Vietnam long form',
      'mẫu hợp đồng chuyển nhượng quyền sử dụng đất file word',
    ],
  },
  {
    category: 'm_and_a_dau_tu',
    template_kind: 'full_template',
    queries: [
      'mẫu hợp đồng mua bán cổ phần (SPA) chi tiết việt nam',
      'mẫu hợp đồng cổ đông (SHA) điều khoản bảo vệ cổ đông thiểu số',
      'điều khoản cam đoan và bảo đảm (Representations and Warranties) trong M&A',
      'mẫu thỏa thuận góp vốn đầu tư dự án docx',
      'thỏa thuận bảo mật thông tin trong giai đoạn Due Diligence',
    ],
  },
  {
    category: 'vay_von_tai_chinh',
    template_kind: 'full_template',
    queries: [
      'mẫu hợp đồng vay vốn giữa cá nhân và pháp nhân không lãi suất',
      'mẫu hợp đồng thế chấp tài sản hình thành trong tương lai',
      'điều khoản cầm cố tài sản bảo đảm trong hợp đồng tín dụng',
      'thỏa thuận vay chuyển đổi (Convertible Loan Agreement) mẫu',
      'mẫu biên bản đối chiếu công nợ và cam kết trả nợ',
    ],
  },
  {
    category: 'thuong_mai_dien_tu',
    template_kind: 'legal_doc',
    queries: [
      'mẫu điều khoản sử dụng (Terms of Service) website thương mại điện tử',
      'chính sách quyền riêng tư (Privacy Policy) mẫu theo Nghị định 13',
      'mẫu thỏa thuận người dùng cuối (EULA) phần mềm SaaS',
      'quy chế hoạt động sàn giao dịch thương mại điện tử mẫu',
      'điều khoản thanh toán và hoàn trả tiền trực tuyến',
    ],
  },
  {
    category: 'xay_dung_pro',
    template_kind: 'clause_snippet',
    queries: [
      'điều khoản phạt vi phạm và bồi thường trong hợp đồng xây dựng',
      'mẫu hợp đồng EPC (Thiết kế - Cung cấp - Lắp đặt) trọn gói',
      'điều khoản tạm ứng và bảo lãnh thực hiện hợp đồng xây dựng',
      'quy định về nghiệm thu và bàn giao công trình mẫu',
      'điều khoản bảo hành công trình và giữ lại tiền bảo hành',
    ],
  },
  {
    category: 'logistics_xuat_nhap_khau',
    template_kind: 'full_template',
    queries: [
      'mẫu hợp đồng ngoại thương (Sales Contract) tiếng Anh - Việt',
      'điều khoản Incoterms 2020 trong hợp đồng mua bán quốc tế',
      'mẫu hợp đồng đại lý phân phối độc quyền hàng hóa',
      'điều khoản bảo hiểm hàng hóa vận chuyển đường biển',
      'mẫu hợp đồng dịch vụ logistics và kho bãi docx',
    ],
  },
  {
    category: 'quan_tri_ru_ro_phap_ly',
    template_kind: 'clause_snippet',
    queries: [
      'điều khoản phòng chống tham nhũng và hối lộ (Anti-Corruption) mẫu',
      'điều khoản tuân thủ pháp luật về rửa tiền (AML)',
      'cơ chế thông báo và xử lý vi phạm hợp đồng (Default Notice)',
      'điều khoản tách biệt các phần của hợp đồng (Severability Clause)',
      'điều khoản ưu tiên áp dụng văn bản khi có mâu thuẫn',
    ],
  },
  {
    category: 'cong_nghe_va_ky_thuat_so',
    template_kind: 'full_template',
    queries: [
      'mẫu hợp đồng phát triển phần mềm và chuyển giao mã nguồn',
      'thỏa thuận mức độ dịch vụ (SLA) cho hạ tầng đám mây Cloud',
      'quy định về chữ ký số và giá trị pháp lý thông điệp dữ liệu',
      'mẫu hợp đồng cho thuê bản quyền phần mềm (Software License)',
      'điều khoản trách nhiệm nội dung trên nền tảng mạng xã hội/app',
    ],
  },
  {
    category: 'phap_ly_du_an_va_dat_dai_sau',
    template_kind: 'legal_doc',
    queries: [
      'thủ tục chấp thuận chủ trương đầu tư dự án nhà ở thương mại',
      'mẫu hợp đồng hợp tác kinh doanh (BCC) giữa chủ đầu tư và nhà thầu',
      'quy định về bồi thường hỗ trợ tái định cư Luật Đất đai 2024',
      'hợp đồng tổng thầu tư vấn thiết kế và quản lý dự án (PMC)',
      'quy trình chuyển mục đích sử dụng đất nông nghiệp sang đất phi nông nghiệp',
    ],
  },
  {
    category: 'thue_va_ke_toan_phap_ly',
    template_kind: 'clause_snippet',
    queries: [
      'điều khoản cam kết tuân thủ nghĩa vụ thuế trong giao dịch dân sự',
      'mẫu thỏa thuận phân chia chi phí (Cost Sharing Agreement) nội bộ',
      'quy định về hóa đơn chứng từ hợp lệ theo Thông tư 78',
      'điều khoản hoàn trả thuế VAT trong hợp đồng xuất khẩu dịch vụ',
      'mẫu biên bản đối chiếu tài sản và công nợ khi giải thể doanh nghiệp',
    ],
  },
  {
    category: 'to_tung_va_thi_hanh_an',
    template_kind: 'legal_doc',
    queries: [
      'mẫu đơn khởi kiện dân sự/kinh doanh thương mại mới nhất',
      'mẫu bản tự khai và đơn yêu cầu áp dụng biện pháp khẩn cấp tạm thời',
      'quy trình thi hành án dân sự và đơn yêu cầu thi hành án',
      'mẫu giấy ủy quyền tham gia tố tụng cho luật sư/người đại diện',
      'mẫu đơn kháng cáo và thủ tục nộp đơn kháng cáo sơ thẩm',
    ],
  },
  {
    category: 'nganh_nghe_co_dieu_kien',
    template_kind: 'legal_doc',
    queries: [
      'điều kiện cấp giấy phép thiết lập mạng xã hội trực tuyến',
      'thủ tục cấp giấy phép phân phối rượu/thuốc lá bán buôn',
      'quy định về điều kiện an ninh trật tự và phòng cháy chữa cháy PCCC',
      'giấy phép hoạt động trung tâm ngoại ngữ/tư vấn du học',
      'thủ tục công bố thực phẩm chức năng/mỹ phẩm nhập khẩu',
    ],
  },
  {
    category: 'hon_nhan_va_di_san',
    template_kind: 'full_template',
    queries: [
      'mẫu văn bản thỏa thuận tài sản riêng của vợ chồng trước thời kỳ hôn nhân',
      'mẫu di chúc hợp pháp có người làm chứng và công chứng',
      'văn bản khai nhận di sản thừa kế theo pháp luật/di chúc',
      'thỏa thuận chia tài sản chung vợ chồng trong thời kỳ hôn nhân',
      'mẫu đơn thuận tình ly hôn và thỏa thuận quyền nuôi con',
    ],
  },
  {
    category: 'moi_truong_va_phat_thai',
    template_kind: 'legal_doc',
    queries: [
      'báo cáo đánh giá tác động môi trường (DTM) mẫu dự án sản xuất',
      'quy định về giấy phép môi trường theo Luật Bảo vệ môi trường 2020',
      'điều khoản cam kết bảo vệ môi trường trong hợp đồng thuê nhà xưởng',
      'trình tự kiểm kê khí nhà kính và chứng chỉ carbon cho doanh nghiệp',
    ],
  },
  {
    category: 'quan_tri_cong_ty_dai_chung',
    template_kind: 'legal_doc',
    queries: [
      'mẫu quy chế quản trị công ty đại chúng niêm yết',
      'mẫu báo cáo tình hình quản trị công ty định kỳ',
      'quy định về công bố thông tin trên thị trường chứng khoán',
      'mẫu nghị quyết đại hội đồng cổ đông thường niên chuẩn',
      'quy trình chào bán cổ phiếu riêng lẻ cho nhà đầu tư chiến lược',
    ],
  },
  {
    category: 'tai_chinh_phai_sinh_va_ngoai_hoi',
    template_kind: 'clause_snippet',
    queries: [
      'điều khoản giao dịch quyền chọn (Option) và tương lai (Futures)',
      'quy định về quản lý ngoại hối đối với khoản vay nước ngoài (FIRMS)',
      'mẫu thỏa thuận hoán đổi lãi suất (Interest Rate Swap)',
      'điều khoản thanh toán bằng ngoại tệ trong hợp đồng quốc tế',
      'thủ tục đăng ký khoản vay nước ngoài không được Chính phủ bảo lãnh',
    ],
  },
  {
    category: 'xu_ly_no_va_pha_san',
    template_kind: 'full_template',
    queries: [
      'mẫu đơn yêu cầu mở thủ tục phá sản doanh nghiệp',
      'thỏa thuận cơ cấu lại thời hạn trả nợ (Debt Restructuring)',
      'mẫu hợp đồng mua bán nợ (Debt Purchase Agreement)',
      'biên bản bàn giao tài sản bảo đảm để xử lý nợ',
      'quy trình thanh lý tài sản khi giải thể doanh nghiệp',
    ],
  },
  {
    category: 'chuyen_giao_cong_nghe_va_franchise',
    template_kind: 'full_template',
    queries: [
      'mẫu hợp đồng nhượng quyền thương mại (Franchise Agreement)',
      'mẫu hợp đồng chuyển giao công nghệ từ nước ngoài vào Việt Nam',
      'điều khoản đào tạo và hỗ trợ kỹ thuật trong nhượng quyền',
      'quy định về phí bản quyền (Royalty Fee) và cách tính',
      'đăng ký thỏa thuận nhượng quyền với Bộ Công Thương',
    ],
  },
  {
    category: 'nganh_duoc_va_y_te',
    template_kind: 'legal_doc',
    queries: [
      'quy định về quảng cáo thuốc và thực phẩm chức năng',
      'mẫu hợp đồng thử nghiệm lâm sàng (Clinical Trial Agreement)',
      'điều kiện cấp giấy chứng nhận đủ điều kiện kinh doanh dược',
      'quy chuẩn ghi nhãn hàng hóa đối với thiết bị y tế',
      'hợp đồng hợp tác khai thác thiết bị y tế (mô hình xã hội hóa)',
    ],
  },
  {
    category: 'an_le_va_thuc_tien_xet_xu',
    template_kind: 'legal_precedent',
    queries: [
      'tổng hợp án lệ về tranh chấp hợp đồng kinh doanh thương mại',
      'án lệ số 13/2017/AL về hiệu lực của hợp đồng tặng cho quyền sử dụng đất',
      'án lệ số 42/2021/AL về quyền lựa chọn trọng tài của người tiêu dùng',
      'giải đáp vướng mắc án dân sự của Tòa án nhân dân tối cao',
      'các bản án về tranh chấp đơn phương chấm dứt hợp đồng lao động',
    ],
  },
  {
    category: 'esg_va_phat_trien_ben_vung',
    template_kind: 'clause_snippet',
    queries: [
      'điều khoản tuân thủ trách nhiệm xã hội doanh nghiệp (CSR)',
      'quy định về báo cáo phát triển bền vững (ESG) cho doanh nghiệp',
      'điều khoản đạo đức kinh doanh và bộ quy tắc ứng xử (Code of Conduct)',
      'tiêu chuẩn bảo vệ môi trường ISO 14001 trong hợp đồng cung ứng',
    ],
  },
  {
    category: 'thuong_mai_quoc_te_va_fta',
    template_kind: 'legal_doc',
    queries: [
      'quy định về quy tắc xuất xứ hàng hóa (ROO) trong hiệp định EVFTA',
      'hướng dẫn áp dụng thuế suất ưu đãi đặc biệt CPTPP',
      'cơ chế giải quyết tranh chấp giữa nhà đầu tư và nhà nước (ISDS)',
      'biện pháp phòng vệ thương mại: chống bán phá giá và trợ cấp',
      'mẫu chứng nhận xuất xứ hàng hóa (C/O) các form ưu đãi',
    ],
  },
  {
    category: 'cong_nghe_moi_va_sandbox',
    template_kind: 'legal_doc',
    queries: [
      'cơ chế thử nghiệm kiểm soát (Sandbox) cho Fintech tại Việt Nam',
      'quy định về tài sản ảo (Virtual Assets) và khung pháp lý liên quan',
      'pháp luật về ứng dụng trí tuệ nhân tạo AI và trách nhiệm dân sự',
      'điều khoản sử dụng công nghệ Blockchain trong truy xuất nguồn gốc',
      'quy định về an ninh mạng đối với hệ thống thông tin quan trọng',
    ],
  },
  {
    category: 'phap_ly_ngan_hang_va_fintech',
    template_kind: 'full_template',
    queries: [
      'mẫu hợp đồng mở và sử dụng tài khoản thanh toán cá nhân/tổ chức',
      'quy trình định danh khách hàng điện tử (eKYC) theo quy định NHNN',
      'mẫu thỏa thuận kết nối cổng thanh toán trực tuyến (Payment Gateway)',
      'điều khoản bảo mật và an toàn kho quỹ trong hoạt động ngân hàng',
      'hợp đồng hợp tác phát hành thẻ liên kết (Co-branded card)',
    ],
  },
  {
    category: 'dau_thau_va_dau_gia',
    template_kind: 'legal_doc',
    queries: [
      'mẫu hồ sơ mời thầu xây lắp/mua sắm hàng hóa theo Luật Đấu thầu 2023',
      'quy trình đấu giá quyền sử dụng đất và tài sản công',
      'mẫu hợp đồng mua bán tài sản đấu giá thành',
      'quy định về chỉ định thầu và các trường hợp đặc biệt',
      'biên bản mở thầu và báo cáo đánh giá hồ sơ dự thầu',
    ],
  },
  {
    category: 'phap_ly_nguon_nhan_luc_cao_cap',
    template_kind: 'clause_snippet',
    queries: [
      'điều khoản hạn chế cạnh tranh (Non-compete) sau khi nghỉ việc',
      'mẫu hợp đồng đào tạo và cam kết thời gian làm việc tối thiểu',
      'chế độ quyền mua cổ phần cho nhân viên (ESOP) và hồ sơ pháp lý',
      'quy định về thuế thu nhập cá nhân đối với chuyên gia nước ngoài',
      'mẫu thỏa thuận biệt phái người lao động trong nội bộ tập đoàn',
    ],
  },
  {
    category: 'kiem_tra_tuan_thu_va_thanh_tra',
    template_kind: 'legal_doc',
    queries: [
      'quy trình thanh tra thuế và kiểm tra sau thông quan',
      'mẫu biên bản làm việc với đoàn thanh tra chuyên ngành',
      'thủ tục khiếu nại quyết định xử phạt vi phạm hành chính',
      'quy định về thời hiệu xử lý vi phạm hành chính các lĩnh vực',
      'mẫu giải trình văn bản trước khi ban hành quyết định xử phạt',
    ],
  },
  {
    category: 'so_huu_tri_tue_chuyen_sau',
    template_kind: 'legal_doc',
    queries: [
      'thủ tục đăng ký giống cây trồng và quyền đối với giống cây trồng',
      'quy trình xác lập quyền đối với chỉ dẫn địa lý và tên gọi xuất xứ',
      'mẫu hợp đồng chuyển giao bí mật kinh doanh và bí quyết kỹ thuật',
      'giám định xâm phạm quyền sở hữu công nghiệp tại Viện Khoa học SHTT',
    ],
  },
  {
    category: 'trong_tai_va_hoa_giai',
    template_kind: 'clause_snippet',
    queries: [
      'mẫu điều khoản trọng tài VIAC tiêu chuẩn cho hợp đồng thương mại',
      'thỏa thuận trọng tài duy nhất (Ad-hoc Arbitration) mẫu việt nam',
      'quy tắc tố tụng trọng tài quốc tế SIAC và ICC áp dụng tại Việt Nam',
      'mẫu thỏa thuận hòa giải thương mại theo Nghị định 22/2017',
      'điều khoản lựa chọn địa điểm và ngôn ngữ trọng tài quốc tế',
    ],
  },
  {
    category: 'tai_chinh_ngan_hang_va_phat_hanh_trai_phieu',
    template_kind: 'legal_doc',
    queries: [
      'mẫu bản công bố thông tin phát hành trái phiếu doanh nghiệp riêng lẻ',
      'hợp đồng đại diện sở hữu trái phiếu và đại lý thanh toán',
      'quy định về xếp hạng tín nhiệm doanh nghiệp phát hành trái phiếu',
      'mẫu hợp đồng bảo lãnh phát hành chứng khoán và cam kết mua lại',
      'thủ tục đăng ký giao dịch trái phiếu trên hệ thống giao dịch tập trung',
    ],
  },
  {
    category: 'phong_chong_rua_tien_va_tuan_thu_quoc_te',
    template_kind: 'clause_snippet',
    queries: [
      'điều khoản tuân thủ chống rửa tiền (AML) và tài trợ khủng bối (CFT)',
      'quy trình nhận biết khách hàng (KYC/CDD) cho định chế tài chính',
      'mẫu báo cáo giao dịch có giá trị lớn (CTR) và giao dịch đáng ngờ (STR)',
      'điều khoản tuân thủ đạo luật FATCA đối với tổ chức tài chính',
      'quy định về cấm vận và trừng phạt kinh tế trong hợp đồng mua bán quốc tế',
    ],
  },
  {
    category: 'kinh_doanh_da_quoc_gia_va_thue_toi_thieu_toan_cau',
    template_kind: 'legal_doc',
    queries: [
      'quy định về thuế tối thiểu toàn cầu Pillar 2 áp dụng tại Việt Nam',
      'hồ sơ xác định giá giao dịch liên kết (Transfer Pricing) mẫu',
      'thỏa thuận trước về phương pháp xác định giá tính thuế (APA)',
      'quy định về cơ sở thường trú (PE) trong hiệp định tránh đánh thuế hai lần',
      'mẫu báo cáo lợi nhuận liên quốc gia (CbCR) cho tập đoàn đa quốc gia',
    ],
  },
  {
    category: 'luật_canh_tranh_va_chong_doc_quyen',
    template_kind: 'legal_doc',
    queries: [
      'quy định về tập trung kinh tế và thủ tục thông báo tập trung kinh tế',
      'mẫu báo cáo thị phần và đánh giá tác động hạn chế cạnh tranh',
      'điều khoản cam kết không vi phạm luật cạnh tranh trong liên doanh',
      'xử phạt hành vi thỏa thuận ấn định giá và chia sẻ thị trường',
      'quy tắc ứng xử của doanh nghiệp có vị trí thống lĩnh thị trường',
    ],
  },
  {
    category: 'phap_ly_nang_luong_va_tai_nguyen',
    template_kind: 'full_template',
    queries: [
      'mẫu hợp đồng mua bán điện (PPA) cho dự án điện mặt trời áp mái',
      'mẫu hợp đồng thuê môi trường rừng để kinh doanh du lịch sinh thái',
      'thủ tục cấp giấy phép khai thác khoáng sản và phục hồi môi trường',
      'quy định về cơ chế mua bán tín chỉ carbon (Carbon Credits) tự nguyện',
      'mẫu hợp đồng hợp tác đầu tư dự án năng lượng tái tạo',
    ],
  },
  {
    category: 'bao_mat_du_lieu_xuyen_bien_gioi',
    template_kind: 'legal_doc',
    queries: [
      'mẫu hồ sơ đánh giá tác động chuyển dữ liệu cá nhân ra nước ngoài',
      'điều khoản bảo vệ dữ liệu (DPA) theo tiêu chuẩn GDPR và VN PDP',
      'quy định về lưu trữ dữ liệu người dùng tại Việt Nam theo Luật An ninh mạng',
      'thỏa thuận xử lý dữ liệu giữa Bên kiểm soát và Bên xử lý (SCC)',
    ],
  },
  {
    category: 'tai_cau_truc_va_du_phong_ru_ro',
    template_kind: 'full_template',
    queries: [
      'mẫu phương án tái cấu trúc nợ doanh nghiệp khó khăn tài chính',
      'thỏa thuận đóng băng nợ (Standstill Agreement) mẫu việt nam',
      'quy trình xử lý tài sản bảo đảm là quyền tài sản phát sinh từ hợp đồng',
      'mẫu hợp đồng ủy thác quản lý tài sản và danh mục đầu tư',
      'điều khoản bảo vệ tài sản (Asset Protection) trong cấu trúc tập đoàn',
    ],
  },
  {
    category: 'dau_tu_ra_nuoc_ngoai_cua_doanh_nghiep_vn',
    template_kind: 'legal_doc',
    queries: [
      'thủ tục cấp giấy chứng nhận đăng ký đầu tư ra nước ngoài mới nhất',
      'quy định về chuyển ngoại tệ ra nước ngoài để thực hiện dự án đầu tư',
      'mẫu báo cáo tình hình hoạt động đầu tư tại nước ngoài định kỳ',
      'quy trình đăng ký thay đổi vốn đầu tư ra nước ngoài tại Bộ KHĐT',
    ],
  },
  {
    category: 'so_huu_nha_nuoc_va_co_phan_hoa',
    template_kind: 'legal_doc',
    queries: [
      'quy trình thoái vốn nhà nước tại doanh nghiệp theo Nghị định 91',
      'mẫu phương án cổ phần hóa doanh nghiệp nhà nước chi tiết',
      'quy định về định giá doanh nghiệp có vốn nhà nước để thoái vốn',
      'trách nhiệm bảo toàn và phát triển vốn nhà nước tại doanh nghiệp',
    ],
  },
  {
    category: 'phap_ly_ve_vung_bien_va_logistics_hang_hai',
    template_kind: 'full_template',
    queries: [
      'mẫu hợp đồng thuê tàu chuyến (Voyage Charter) theo luật hàng hải',
      'điều khoản bồi thường tổn thất chung (General Average) trong vận tải biển',
      'quy định về bắt giữ tàu biển để đảm bảo giải quyết khiếu nại hàng hải',
      'mẫu vận đơn đường biển (Bill of Lading) và các lưu ý pháp lý',
      'hợp đồng dịch vụ đại lý tàu biển và môi giới hàng hải',
    ],
  },
  {
    category: 'nong_nghiep_cong_nghe_cao_va_lam_nghiep',
    template_kind: 'legal_doc',
    queries: [
      'tiêu chuẩn chứng nhận doanh nghiệp nông nghiệp ứng dụng công nghệ cao',
      'quy trình cấp chứng chỉ quản lý rừng bền vững (FSC/PEFC) tại VN',
      'mẫu hợp đồng liên kết sản xuất và tiêu thụ sản phẩm nông nghiệp',
      'quy định về hạn mức nhận chuyển quyền sử dụng đất nông nghiệp',
    ],
  },
  {
    category: 'phap_ly_nganh_ban_le_va_chuoi_cung_ung',
    template_kind: 'clause_snippet',
    queries: [
      'điều khoản chiết khấu thương mại và thưởng doanh số trong bán lẻ',
      'mẫu hợp đồng ký gửi hàng hóa vào hệ thống siêu thị/trung tâm thương mại',
      'quy định về chương trình khuyến mại tập trung và thông báo Bộ Công Thương',
      'điều khoản thu hồi sản phẩm lỗi (Product Recall) và trách nhiệm liên đới',
    ],
  },
  {
    category: 'dao_duc_nghe_nghiep_va_quan_tri_ru_ro_luat_su',
    template_kind: 'legal_doc',
    queries: [
      'quy tắc đạo đức và ứng xử nghề nghiệp luật sư việt nam 2019',
      'mẫu hợp đồng dịch vụ pháp lý và giới hạn trách nhiệm nghề nghiệp',
      'quy định về bảo mật thông tin khách hàng và xung đột lợi ích (Conflict of Interest)',
      'quy trình giải quyết khiếu nại khách hàng đối với tổ chức hành nghề luật',
    ],
  },
  {
    category: 'hinh_su_doanh_nghiep_va_kinh_te',
    template_kind: 'legal_doc',
    queries: [
      'dấu hiệu tội vi phạm quy định về đấu thầu gây hậu quả nghiêm trọng',
      'tội thao túng thị trường chứng khoán và các án lệ liên quan',
      'phân biệt vi phạm hành chính và tội trốn thuế trong doanh nghiệp',
      'trách nhiệm hình sự của pháp nhân thương mại theo Bộ luật Hình sự 2015',
      'quy trình tự bào chữa và mời luật sư trong vụ án kinh tế',
    ],
  },
  {
    category: 'co_che_dac_thu_va_vung_dong_luc',
    template_kind: 'legal_doc',
    queries: [
      'nghị quyết 98/2023/QH15 về cơ chế đặc thù phát triển TP.HCM',
      'chính sách ưu đãi đầu tư tại khu công nghệ cao Hòa Lạc/Thủ Thiêm',
      'quy định về phân cấp quản lý nhà nước tại các đô thị loại đặc biệt',
      'ưu đãi thuế và tiền thuê đất tại các khu kinh tế ven biển',
      'thủ tục đầu tư dự án trọng điểm quốc gia theo quy hoạch vùng',
    ],
  },
  {
    category: 'phap_ly_nguon_von_oda_va_ngoai_te_lon',
    template_kind: 'legal_doc',
    queries: [
      'quy trình quản lý và sử dụng vốn ODA theo Nghị định 114/2021',
      'mẫu hợp đồng vay vốn giữa Chính phủ và các định chế tài chính quốc tế',
      'điều khoản giải ngân và kiểm soát chi vốn vay nước ngoài',
      'thủ tục xác nhận ưu đãi thuế đối với dự án sử dụng vốn viện trợ',
    ],
  },
  {
    category: 'quản_lý_tài_sản_công_va_dau_tu_cong',
    template_kind: 'legal_doc',
    queries: [
      'luật quản lý sử dụng tài sản công và các văn bản hướng dẫn',
      'mẫu hợp đồng cho thuê/khoán quản tài sản công tại đơn vị sự nghiệp',
      'trình tự lập kế hoạch đầu tư công trung hạn và hàng năm',
      'quy định về tiêu chuẩn định mức sử dụng xe công/trụ sở làm việc',
      'thủ tục thanh lý tài sản công là nhà đất và hạ tầng',
    ],
  },
  {
    category: 'phap_ly_so_huu_tri_tue_trong_y_sinh',
    template_kind: 'legal_doc',
    queries: [
      'quy trình đăng ký bảo hộ giống cây trồng và nguồn gen quý',
      'quy định về chia sẻ lợi ích (Benefit Sharing) từ nguồn gen nội địa',
      'thủ tục cấp phép lưu hành thiết bị y tế chẩn đoán In-vitro (IVD)',
      'điều khoản bảo mật dữ liệu thử nghiệm lâm sàng dược phẩm',
    ],
  },
  {
    category: 'luat_quoc_te_va_tu_phap_quoc_te',
    template_kind: 'clause_snippet',
    queries: [
      'quy định về áp dụng luật nước ngoài trong hợp đồng có yếu tố nước ngoài',
      'thủ tục công nhận và cho thi hành bản án của Tòa án nước ngoài tại VN',
      'mẫu hợp đồng mua bán hàng hóa quốc tế theo Công ước CISG',
      'điều khoản miễn trừ tư pháp của quốc gia trong giao dịch dân sự',
    ],
  },
  {
    category: 'phap_ly_giao_duc_va_to_chuc_phi_loi_nhuan',
    template_kind: 'legal_doc',
    queries: [
      'điều kiện thành lập phân hiệu đại học nước ngoài tại Việt Nam',
      'quy chế tổ chức và hoạt động của quỹ từ thiện/quỹ xã hội',
      'thủ tục tiếp nhận viện trợ phi chính phủ nước ngoài (NGO)',
      'mẫu hợp đồng hợp tác đào tạo liên kết quốc tế',
    ],
  },
  {
    category: 'ky_thuat_soan_thao_chuyen_nghiep',
    template_kind: 'clause_snippet',
    queries: [
      'điều khoản định nghĩa (Definitions) mẫu cho hợp đồng phức tạp',
      'cách soạn thảo điều khoản toàn bộ thỏa thuận (Entire Agreement)',
      'mẫu điều khoản bảo lưu quyền sở hữu (Retention of Title)',
      'điều khoản về quyền ưu tiên mua trước (Right of First Refusal)',
      'cách diễn đạt điều khoản nỗ lực tối đa (Best Efforts vs Reasonable Efforts)',
    ],
  },
  {
    category: 'phap_ly_giai_tri_va_truyen_thong',
    template_kind: 'full_template',
    queries: [
      'mẫu hợp đồng quản lý nghệ sĩ và phân chia lợi nhuận mẫu',
      'thỏa thuận bản quyền hình ảnh cá nhân và quyền sử dụng tên tuổi',
      'mẫu hợp đồng sản xuất phim và chuyển giao quyền tác giả',
      'quy định về giấy phép tổ chức biểu diễn nghệ thuật/sự kiện',
      'hợp đồng quảng cáo (Endorsement) và điều khoản đạo đức nghệ sĩ',
    ],
  },
  {
    category: 'phap_ly_hang_khong_va_vu_tru',
    template_kind: 'legal_doc',
    queries: [
      'luật hàng không dân dụng việt nam và các văn bản hướng dẫn',
      'mẫu hợp đồng thuê máy bay (Dry Lease vs Wet Lease)',
      'quy định về bồi thường chậm hủy chuyến và trách nhiệm hãng bay',
      'thủ tục cấp phép bay cho thiết bị bay không người lái (Drone/UAV)',
    ],
  },
  {
    category: 'khieu_nai_to_cao_va_tiep_dan',
    template_kind: 'legal_doc',
    queries: [
      'mẫu đơn khiếu nại quyết định hành chính/hành vi hành chính',
      'quy trình giải quyết tố cáo theo Luật Tố cáo mới nhất',
      'thủ tục khởi kiện vụ án hành chính tại Tòa án',
      'mẫu đơn yêu cầu bồi thường thiệt hại do cán bộ công chức gây ra',
      'thời hiệu khiếu nại và thời hạn giải quyết khiếu nại các cấp',
    ],
  },
  {
    category: 'phap_ly_ve_tien_ao_va_web3',
    template_kind: 'legal_doc',
    queries: [
      'thông báo của Ngân hàng Nhà nước về Bitcoin và tài sản ảo',
      'phân tích pháp lý về mô hình gọi vốn ICO/IDO tại Việt Nam',
      'rủi ro pháp lý khi kinh doanh sàn giao dịch tiền mã hóa',
      'điều khoản miễn trừ trách nhiệm cho nền tảng NFT Marketplace',
    ],
  },
  {
    category: 'phap_ly_ngan_hang_va_tin_dung_den',
    template_kind: 'legal_doc',
    queries: [
      'cách phân biệt hợp đồng cho vay dân sự và tội cho vay lãi nặng',
      'mẫu thông báo đòi nợ và khởi kiện nợ quá hạn chuyên nghiệp',
      'quy định về hoạt động của các công ty thu hồi nợ (đã cấm/thay thế)',
      'hướng dẫn xử lý nợ xấu theo Nghị quyết của Quốc hội',
    ],
  },
  {
    category: 'phap_ly_ton_giao_va_phi_chinh_phu',
    template_kind: 'legal_doc',
    queries: [
      'luật tín ngưỡng tôn giáo và thủ tục đăng ký hoạt động tôn giáo',
      'quy định về quản lý đất đai của cơ sở tôn giáo/tín ngưỡng',
      'mẫu điều lệ tổ chức phi chính phủ (NGO) nội địa',
    ],
  }
]

const searches = BASE_SEARCHES.flatMap(s => s.queries.map(q => ({
  category: s.category,
  template_kind: s.template_kind,
  query: q,
})))

function normalizeUrl(u) {
  try {
    const url = new URL(u)
    url.hash = ''
    url.search = ''
    const host = url.hostname.replace(/^www\./, '').toLowerCase()
    const path = url.pathname.replace(/\/+$/, '')
    return `${url.protocol}//${host}${path}`
  } catch {
    return String(u || '').trim()
  }
}

function stableId(input, len = 12) {
  const h = createHash('sha1').update(input).digest('hex')
  return h.slice(0, len)
}

async function search(query) {
  const res = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': EXA_API_KEY,
    },
    body: JSON.stringify({
      query,
      numResults: NUM_RESULTS,
      useAutoprompt: true,
      ...(STRICT_DOMAINS ? { includeDomains: INCLUDE_DOMAINS } : {}),
      contents: { text: { maxCharacters: MAX_CHARS } },
    }),
  })

  if (!res.ok) {
    throw new Error(`Exa search failed (${res.status}) for query: ${query}`)
  }

  return res.json()
}

// Build dedupe sets from prior crawls and curated library
const existingUrlSet = new Set()
const existingNameSet = new Set()

// From curated manifest (names)
try {
  const manifestPath = path.join(libraryDir, 'manifest.json')
  const manifestRaw = await readFile(manifestPath, 'utf8')
  const manifest = JSON.parse(manifestRaw)
  for (const t of Array.isArray(manifest) ? manifest : []) {
    if (t?.name) existingNameSet.add(String(t.name).toLowerCase().trim())
  }
} catch { }

// From previous crawled JSON files (URLs and names)
try {
  const files = await readdir(crawledDir)
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    try {
      const raw = await readFile(path.join(crawledDir, f), 'utf8')
      const arr = JSON.parse(raw)
      for (const it of Array.isArray(arr) ? arr : []) {
        if (it?.source_url) existingUrlSet.add(normalizeUrl(it.source_url))
        if (it?.name) existingNameSet.add(String(it.name).toLowerCase().trim())
      }
    } catch { }
  }
} catch { }

const payload = []
let totalResults = 0
let skippedByUrl = 0
let skippedByName = 0

async function handleSpec(spec) {
  const data = await search(spec.query)
  for (const item of data.results || []) {
    totalResults += 1
    const normUrl = normalizeUrl(item.url)
    const nameKey = String(item.title || '').toLowerCase().trim()
    if (normUrl && existingUrlSet.has(normUrl)) {
      skippedByUrl += 1
      continue
    }
    if (nameKey && existingNameSet.has(nameKey)) {
      skippedByName += 1
      continue
    }
    const id = stableId(`${spec.category}|${spec.template_kind}|${normUrl || nameKey}`)
    payload.push({
      seed_key: `${spec.category}-${spec.template_kind}-${id}`,
      name: item.title,
      category: spec.category,
      template_kind: spec.template_kind,
      content_md: (item.text || '').trim(),
      source_url: item.url,
      source_domain: normUrl ? new URL(normUrl).hostname.replace(/^www\./, '') : undefined,
      source_note: 'Crawled from web. Review manually before moving into templates/library/manifest.json.',
      source_type: 'web_crawled',
      crawled_at: new Date().toISOString(),
      query: spec.query,
    })
    if (normUrl) existingUrlSet.add(normUrl)
    if (nameKey) existingNameSet.add(nameKey)
  }
}

async function runWithConcurrency(items, limit, fn) {
  const queue = [...items]
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const next = queue.shift()
      try {
        await fn(next)
      } catch (err) {
        console.error('Search failed for', next?.query, '-', err?.message || err)
      }
    }
  })
  await Promise.all(workers)
}

console.log(`Running ${searches.length} searches with concurrency=${CONCURRENCY}, numResults=${NUM_RESULTS}${STRICT_DOMAINS ? `, includeDomains=${INCLUDE_DOMAINS.join(',')}` : ''}`)
await runWithConcurrency(searches, CONCURRENCY, handleSpec)

await writeFile(outputPath, JSON.stringify(payload, null, 2))
console.log(`Saved ${payload.length} new candidates to ${outputPath} (from ${totalResults} results, skipped ${skippedByUrl} by URL, ${skippedByName} by name)`) 
