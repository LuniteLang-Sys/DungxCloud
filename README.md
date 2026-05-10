# Google Drive Multi-Account NAS ("Poor Man's NAS")

Một hệ thống lưu trữ đám mây tự vận hành (self-hosted), hợp nhất và tổng hợp dung lượng từ nhiều tài khoản Google Drive miễn phí thành một không gian lưu trữ ảo duy nhất (Unified Storage Pool). 

Dự án được tối ưu hóa về mặt kiến trúc để vận hành trên các máy chủ có tài nguyên cực kỳ hạn chế (ví dụ: VPS 1 vCPU, 1GB RAM) bằng cách ủy quyền toàn bộ quá trình truyền tải dữ liệu (data plane) cho client, giúp máy chủ hoàn toàn không tốn tài nguyên băng thông hay RAM khi trung chuyển tệp tin lớn.

---

## 🏛️ Sơ Đồ Kiến Trúc Hệ Thống (System Architecture)

```mermaid
graph TD
    subgraph Client [Trình Duyệt Khách]
        FE[React 19 SPA / Next.js Client]
        SS[StreamSaver.js / Service Worker]
        XHR[Parallel XMLHttpRequests]
    end

    subgraph Server [Máy Chủ Next.js]
        API[Stateless API Routes / Control Plane]
        TC[In-memory Token Cache]
    end

    subgraph DB [Cơ Sở Dữ Liệu]
        Supa[(Supabase PostgreSQL)]
    end

    subgraph Storage [Google Drive Backend]
        GD1[Drive Account 1]
        GD2[Drive Account 2]
    end

    %% Control Flows
    FE <--> |API Calls| API
    API <--> |Metadata Query| Supa
    API -.-> |OAuth 2.0 Credentials Refresh| Storage

    %% Data Flows (Bypassing Server)
    XHR ==> |Direct Resumable PUT Upload| GD1
    XHR ==> |Direct Resumable PUT Upload| GD2
    SS <== |Direct GET Stream Download| GD1
    SS <== |Direct GET Stream Download| GD2
```

---

## ⚙️ Điểm Nhấn Kiến Trúc Kỹ Thuật

*   **Tách biệt Control Plane và Data Plane**: Byte dữ liệu của tệp tin (upload/download) chạy trực tiếp giữa Trình duyệt và Google CDN. Server Next.js chỉ xử lý các metadata điều khiển, giúp loại bỏ nghẽn cổ chai I/O trên máy chủ điều phối.
*   **Chia nhỏ tệp tự động (File Splitting/Chunking)**: Các tệp tin lớn hơn kích thước định cấu hình (mặc định 1GB) sẽ được tự động phân chia thành các mảnh (shards) và phân tán thông minh lên các tài khoản lưu trữ khác nhau.
*   **Tải xuống trực tiếp dạng Luồng (Direct Stream Download)**: Ghép tệp trực tiếp phía client thông qua Service Worker của `StreamSaver.js`. Dữ liệu tải về từ Google Drive CDN được pipe trực tiếp xuống ổ đĩa cứng của người dùng dưới cơ chế Backpressure, duy trì lượng RAM sử dụng của trình duyệt ở mức cực thấp (vài KB) bất kể kích thước tệp tải xuống là bao nhiêu GB.
*   **Nguyên tắc Phân quyền Tối thiểu (Principle of Least Privilege)**: Đăng nhập tài khoản qua OAuth 2.0 với scope duy nhất là `drive.file`. Ứng dụng chỉ có quyền đọc/ghi các tệp do chính nó tải lên, bảo đảm an toàn tuyệt đối cho các tệp cá nhân sẵn có khác của người dùng.
*   **Xem trước và Ảnh thu nhỏ siêu tốc**: Chuyển đổi và cache các liên kết `thumbnailLink` và `webViewLink` từ Google API vào Supabase PostgreSQL, tối ưu hóa thời gian phản hồi cho các yêu cầu xem trước kế tiếp xuống dưới **< 30ms**.

---

## 📁 Cấu Trúc Thư Mục Dự Án

*   `src/app/api`: Các API Route xử lý xác thực OAuth, khởi tạo luồng tải lên (`/upload/init`), ghi nhận tải lên thành công (`/upload/complete`), đồng bộ dung lượng, di chuyển tệp ảo và tạo thư mục ảo.
*   `src/app/dashboard`: Trang quản trị tệp tin và tài khoản sử dụng React 19 Client-side và thiết kế Neo-Brutalism.
*   `src/lib`: Thư viện kết nối Google APIs, quản lý phiên đăng nhập JWT và tích hợp Supabase.
*   `supabase/`: Tệp định nghĩa cấu trúc cơ sở dữ liệu vật lý PostgreSQL (`schema.sql`).

---

## 🚀 Hướng Dẫn Cài Đặt Nhanh (Quick Start)

### 1. Cấu hình biến môi trường (`.env.local`)
Sao chép `.env.example` thành `.env.local` và điền đầy đủ các thông số:
```bash
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"

GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"
GOOGLE_REDIRECT_URI="http://localhost:3000/api/auth/google/callback"

ADMIN_PASSWORD="your-admin-dashboard-password"
JWT_SECRET="your-jwt-signing-secret"

# Kích thước tối đa của mỗi mảnh tệp tin (mặc định 1GB)
CHUNK_SIZE=1073741824
```

### 2. Thiết lập cơ sở dữ liệu
Truy cập **SQL Editor** trong bảng điều khiển Supabase của bạn, sao chép nội dung trong tệp [supabase/schema.sql](file:///c:/Users/Dungx/Desktop/DungxDownload/supabase/schema.sql) để tạo lập các bảng thông tin, ràng buộc khóa ngoại và kích hoạt tính năng bảo mật Row Level Security (RLS).

### 3. Cài đặt dependency và chạy local
```powershell
npm install
npm run dev
```
Truy cập [http://localhost:3000](http://localhost:3000) trên trình duyệt để sử dụng ứng dụng.

---

## 🧠 Phân Tích & Đánh Giá Kỹ Thuật Chuyên Sâu

Để đọc bản đánh giá kỹ thuật toàn diện từ góc nhìn của một **Senior Software Engineer**, bao gồm phân tích chi tiết về:
1. Các quyết định thiết kế tối ưu hóa hiệu năng và bộ đệm (Caching).
2. Lỗi logic phân bổ dung lượng dở dang (Allocation Flaws).
3. Đánh giá rủi ro an ninh mạng khi phơi bày Access Token ra Client.
4. Đánh giá chi tiết mức độ sẵn sàng vận hành thực tế (Honest Production Readiness).

Vui lòng tham khảo tài liệu phân tích kỹ thuật tại: **[PROJECT_SUMMARY.md](file:///c:/Users/Dungx/Desktop/DungxDownload/PROJECT_SUMMARY.md)**.
