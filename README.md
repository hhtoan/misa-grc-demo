# MISA GRC Demo

Bản demo giao diện hệ thống **Quản trị rủi ro, Kiểm soát nội bộ, Khắc phục phòng ngừa và Sự kiện rủi ro** (Governance, Risk & Compliance).

Toàn bộ dữ liệu là dữ liệu mẫu chạy trong trình duyệt, không cần backend.

---

## Mục lục

- [Chạy dự án](#chạy-dự-án)
- [Công nghệ sử dụng](#công-nghệ-sử-dụng)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Năm vai trò người dùng](#năm-vai-trò-người-dùng)
- [Bốn phân hệ nghiệp vụ](#bốn-phân-hệ-nghiệp-vụ)
- [Tầng dữ liệu](#tầng-dữ-liệu)
- [Quy ước đặt tên](#quy-ước-đặt-tên)
- [Kịch bản demo](#kịch-bản-demo)
- [Rà soát trước khi bàn giao](#rà-soát-trước-khi-bàn-giao)
- [Lộ trình còn lại](#lộ-trình-còn-lại)

---

## Chạy dự án

```bash
# Cài phụ thuộc
npm install

# Chạy môi trường phát triển
npm run dev

# Kiểm tra kiểu và rà soát route
npm run check

# Build bản production
npm run build && npm start
```

Mở `http://localhost:3000`.

Đổi vai trò ngay trên thanh tiêu đề để xem giao diện thay đổi theo quyền.

---

## Công nghệ sử dụng

| Hạng mục         | Lựa chọn                                                 |
| ---------------- | -------------------------------------------------------- |
| Framework        | Next.js (App Router)                                     |
| Ngôn ngữ         | TypeScript                                               |
| Giao diện        | Tailwind CSS với bộ design token riêng                   |
| Icon             | `@tabler/icons-react`                                    |
| Kiểm tra dữ liệu | Zod                                                      |
| Lưu trữ          | Repository chạy trong bộ nhớ, đồng bộ với `localStorage` |

---

## Cấu trúc thư mục

```
src/
├── app/(app)/              Route theo App Router, mỗi page chỉ gọi 1 screen
├── screens/                Toàn bộ màn hình nghiệp vụ
│   ├── TrangChu/
│   ├── ViecCanXuLy/
│   ├── QuanTri/DanhMuc/
│   ├── RuiRo/
│   ├── KiemSoat/
│   ├── KhacPhuc/
│   └── SuKien/
├── components/
│   ├── ui/                 22 component dùng chung
│   └── layout/             PageContainer, PageHeader, ContentCard...
├── lib/
│   ├── db/                 Repository và hook useCollection
│   ├── domain/             schema, enums, workflow, các hàm nghiệp vụ
│   │   ├── schema.ts
│   │   ├── enums.ts
│   │   ├── workflow.ts
│   │   ├── risk-utils.ts
│   │   ├── kppn-utils.ts
│   │   ├── event-utils.ts
│   │   └── lookups.ts
│   ├── integrations/       Mock tích hợp AMIS Công việc và JIRA
│   ├── format.ts           Định dạng ngày, tiền, số
│   ├── table.ts            useTableState: lọc, sắp xếp, phân trang, chọn nhiều
│   └── cn.ts
└── config/
    └── session.ts          Phiên đăng nhập giả lập, hasRole
```

**Nguyên tắc quan trọng**: file trong `src/app` chỉ làm nhiệm vụ định tuyến, toàn bộ logic nằm trong `src/screens`. Nhờ vậy đổi cấu trúc URL không ảnh hưởng tới màn hình.

---

## Năm vai trò người dùng

| Vai trò             | Khoá      | Phạm vi dữ liệu  | Quyền đặc trưng                                 |
| ------------------- | --------- | ---------------- | ----------------------------------------------- |
| Quản trị hệ thống   | `admin`   | Toàn hệ thống    | Toàn quyền, kể cả danh mục dùng chung           |
| Ban Quản trị rủi ro | `qtrr`    | Toàn hệ thống    | Phê duyệt, xác minh, xem sự kiện bảo mật        |
| Kiểm toán nội bộ    | `auditor` | Toàn hệ thống    | Chỉ đọc, có góc nhìn chất lượng hồ sơ riêng     |
| Chủ sở hữu rủi ro   | `owner`   | Đơn vị phụ trách | Ghi nhận và cập nhật bản ghi của đơn vị         |
| Cán bộ nhân viên    | `staff`   | Cá nhân          | Báo cáo nhanh sự kiện, thực hiện việc được giao |

Phạm vi dữ liệu được gom về một khái niệm duy nhất `scope` với 3 giá trị `all`, `unit`, `self`. Muốn đổi quy tắc chỉ cần sửa một chỗ.

---

## Bốn phân hệ nghiệp vụ

| Phân hệ       | Màn hình | Vòng đời chính                                                                |
| ------------- | -------- | ----------------------------------------------------------------------------- |
| **Rủi ro**    | 9        | Nhận diện, đánh giá cố hữu, gắn kiểm soát, đánh giá còn lại, theo dõi KRI     |
| **Kiểm soát** | 6        | Thiết kế, phê duyệt, lập kế hoạch kiểm tra, ghi nhận kết quả                  |
| **Khắc phục** | 7        | Ghi nhận điểm yếu, phân tích nguyên nhân gốc, lập KPPN, giao việc, nghiệm thu |
| **Sự kiện**   | 5        | Ghi nhận, xác minh, điều tra, khắc phục, đóng và rút bài học                  |
| **Chung**     | 3        | Trang chủ, Việc cần xử lý, Quản trị danh mục                                  |

Danh sách đầy đủ 30 màn hình kèm route và vai trò truy cập nằm trong `screens.manifest.json`.

### Các luồng liên kết chéo đã thông

- Sự kiện tới điểm yếu tới KPPN, form nhận tham số qua query param
- Kết quả kiểm tra kết luận không hiệu quả sẽ nhắc lập điểm yếu
- KPPN giao việc sang AMIS hoặc JIRA, nhận tiến độ ngược về, quyền nghiệm thu giữ tại GRC
- Gia hạn KPPN có tuỳ chọn đồng bộ ngược hạn của điểm yếu
- Mọi phân hệ đổ về màn hình Việc cần xử lý

---

## Tầng dữ liệu

Mỗi thực thể có một repository với chữ ký thống nhất:

```ts
repo.getAll();
repo.getById(id);
repo.create(value, createdBy);
repo.update(id, patch);
repo.remove(id);
repo.removeMany(ids);
```

Component đăng ký theo dõi bằng hook:

```ts
const risks = useCollection(riskRepo);
```

Mọi thay đổi phát tín hiệu tới toàn bộ component đang đăng ký, nên số liệu ở các màn hình luôn nhất quán.

### Ba nguyên tắc dữ liệu

1. **Việc cần xử lý sinh lại từ dữ liệu**, không lưu thành bản ghi riêng. Xử lý xong ở màn hình nào thì việc tự biến mất, không bao giờ lệch trạng thái.
2. **Danh mục dùng chung không xoá cứng** khi đang được tham chiếu, chỉ chuyển sang Ngừng sử dụng để giữ nguyên dữ liệu lịch sử.
3. **Sự kiện bảo mật xử lý khác nhau theo ngữ cảnh**: ở danh sách thì che nội dung nhưng giữ dòng để không lệch số liệu tổng hợp, ở trang chi tiết thì chặn hẳn truy cập.

---

## Quy ước đặt tên

| Loại           | Quy ước                         | Ví dụ                           |
| -------------- | ------------------------------- | ------------------------------- |
| Thư mục screen | PascalCase tiếng Việt không dấu | `SuKien/SoTheoDoi`              |
| Route          | kebab-case tiếng Việt không dấu | `/su-kien/so-theo-doi`          |
| Route thêm mới | Hậu tố `them-moi`               | `/su-kien/so-theo-doi/them-moi` |
| Route sửa      | Hậu tố `sua` sau tham số        | `/su-kien/so-theo-doi/[id]/sua` |
| Hàm nghiệp vụ  | camelCase tiếng Anh             | `isKppnOverdue`, `detectionLag` |
| Hằng số        | UPPER_SNAKE_CASE                | `EVENT_STATUS_ORDER`            |
| Mã bản ghi     | `<TIEN_TO>-<NAM>-<STT>`         | `EVT-2026-001`, `RISK-2026-014` |

Tham số động trên URL dùng **mã bản ghi** chứ không dùng `id` nội bộ, để đường dẫn đọc được và chia sẻ được.

---

## Kịch bản demo

Kịch bản 10 phút đi hết vòng đời liên phân hệ:

| Bước | Vai trò           | Thao tác                                            | Điểm nhấn                                             |
| ---- | ----------------- | --------------------------------------------------- | ----------------------------------------------------- |
| 1    | Cán bộ nhân viên  | Vào Báo cáo nhanh, gửi một sự kiện                  | Chỉ 6 trường, không cho tự chấm mức nghiêm trọng      |
| 2    | Cán bộ nhân viên  | Mở Sự kiện của tôi                                  | Sự kiện vừa gửi có nhãn Tôi báo cáo, kèm việc cần làm |
| 3    | Ban QTRR          | Mở Sổ theo dõi sự kiện, tiếp nhận xác minh          | Hộp thoại chuyển trạng thái nêu rõ điều kiện          |
| 4    | Ban QTRR          | Phân công người xử lý, liên kết rủi ro và kiểm soát | Thiếu liên kết thì không đóng được sự kiện            |
| 5    | Ban QTRR          | Từ chi tiết sự kiện bấm Lập điểm yếu                | Form điểm yếu tự nạp sẵn nguồn phát hiện              |
| 6    | Ban QTRR          | Từ điểm yếu bấm Lập KPPN, chọn thực thi trên JIRA   | Liên kết ba tầng sự kiện, điểm yếu, hành động         |
| 7    | Ban QTRR          | Giao việc sang JIRA                                 | Nhận mã việc ngoài, trạng thái đồng bộ đổi            |
| 8    | Người thực hiện   | Mở Việc cần xử lý, cập nhật tiến độ 100 phần trăm   | Đạt 100 phần trăm vẫn chưa phải Hoàn thành            |
| 9    | Người giám sát    | Nghiệm thu kết quả                                  | Quyền xác nhận hoàn thành luôn thuộc về GRC           |
| 10   | Ban QTRR          | Ghi bài học kinh nghiệm và đóng sự kiện             | Hệ thống kiểm tra đủ điều kiện trước khi đóng         |
| 11   | Kiểm toán nội bộ  | Mở Trang chủ                                        | Khối Góc nhìn kiểm toán với 6 chỉ số chất lượng hồ sơ |
| 12   | Quản trị hệ thống | Mở Quản trị danh mục, tab Ma trận rủi ro            | Đổi ngưỡng thấy ngay số rủi ro sẽ đổi mức             |

### Kịch bản phụ về bảo mật

1. Vai trò Ban QTRR: tạo một sự kiện có tick **Bảo mật**
2. Đổi sang vai trò Cán bộ nhân viên: dòng đó bị che nội dung nhưng vẫn đếm trong thống kê
3. Bấm vào dòng bị che: hệ thống chặn hẳn, không render nội dung
4. Đổi sang Kiểm toán nội bộ: xem được đầy đủ nhưng mất toàn bộ nút thao tác

---

## Rà soát trước khi bàn giao

```bash
npm run check
```

Lệnh này chạy tuần tự ba bước:

1. `tsc --noEmit` kiểm tra kiểu toàn dự án
2. `eslint` kiểm tra quy ước mã nguồn
3. `node scripts/audit-routes.mjs` rà soát route

Script rà soát route làm ba việc:

- Liệt kê toàn bộ route thực tế trong `src/app`
- Đối chiếu hai chiều với `screens.manifest.json`, báo route thừa và route thiếu
- Quét mọi `router.push`, `router.replace` và `href` trong `src`, báo link trỏ tới route không tồn tại

Có lỗi thì lệnh trả về mã thoát khác 0, dùng được trong pipeline CI.

### Danh sách kiểm tra thủ công

| Nhóm       | Nội dung cần xác nhận                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------- |
| Vai trò    | Đổi lần lượt 5 vai trò, mỗi màn hình hiển thị đúng nút thao tác                                     |
| Bảo mật    | Sự kiện bảo mật che ở danh sách, chặn ở chi tiết, không lọt vào thống kê của vai trò không đủ quyền |
| Form       | Mọi form bấm lưu khi trống đều báo lỗi và cuộn tới trường đầu tiên                                  |
| Trạng thái | Mọi hộp thoại chuyển trạng thái đều chặn đúng điều kiện, cảnh báo mềm không chặn                    |
| Danh mục   | Không xoá được bản ghi đang tham chiếu ở cả 4 tab danh mục                                          |
| Tích hợp   | Ngắt kết nối thì nút Đồng bộ bị vô hiệu, hành động đang chạy có cảnh báo                            |
| Điều hướng | Mọi nút quay lại và breadcrumb trả về đúng màn hình cha                                             |
| Giao diện  | Thu nhỏ cửa sổ dưới 1280px, các lưới xếp lại đúng, không tràn ngang                                 |

---

## Lộ trình còn lại

| Giai đoạn | Nội dung                                                | Trạng thái      |
| --------- | ------------------------------------------------------- | --------------- |
| 0 tới 9   | Nền tảng, 4 phân hệ, trang chủ, quản trị danh mục       | Hoàn thành      |
| 11        | `screens.manifest.json`, README, rà soát cuối           | Hoàn thành      |
| 10        | Chart và Dashboard với ECharts, scorecard, xu hướng KRI | Chưa triển khai |

Phần Chart và Dashboard được lùi lại vì không phát sinh nghiệp vụ mới, số liệu đã tính sẵn trong các hàm `summarize*()` ở tầng domain nên chỉ còn công việc trực quan hoá.

---

## Giới hạn của bản demo

- Dữ liệu chạy trong trình duyệt, xoá `localStorage` là mất
- Không có xác thực thật, phiên đăng nhập được giả lập trong `config/session.ts`
- Tích hợp AMIS Công việc và JIRA là bản mock, không gọi API thật
- Chưa lưu nhật ký thao tác chi tiết của người dùng, tab Lịch sử tổng hợp từ mốc nghiệp vụ
- Cấu hình ma trận rủi ro lưu trong `localStorage`, khi nối API thật chỉ cần thay hai chỗ đọc ghi
