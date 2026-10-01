# Odoo Debug

**Đừng đoán nữa. Hãy xem vì sao Odoo làm như vậy.** Panel debug ngay trong trang cho Odoo 18.0 và 19.0: một extension
Chrome (Manifest V3) mở bên cạnh màn hình bạn đang xem và giải thích nó: bản ghi, view, các lời gọi lên server, ai được
làm gì, và bản dịch.

[English](README.md) · [Hướng dẫn sử dụng](https://unclecatvn.github.io/extension-debug-odoo/) · [Kiến trúc](docs/ARCHITECTURE.md)

## Vấn đề

Chế độ debug của Odoo cho thấy *có* chuyện gì xảy ra, hiếm khi cho thấy *vì sao*:

- **Một user không mở hoặc không sửa được bản ghi.** Thông báo AccessError chỉ nêu model, may lắm thì thêm tên rule.
  Muốn biết thiếu ACL nào, record rule nào đang chặn, domain của rule ra sao với user đó, và thêm nhóm nào thì được (mà
  không cấp thừa quyền), phải tự đọc `ir.model.access`, `ir.rule`, `res.groups`.
- **Một field bị ẩn, chỉ đọc hoặc không thấy trên form.** Các điều kiện của nó đến từ nhiều view kế thừa của nhiều
  module, theo một thứ tự chỉ `ir.ui.view._combine` biết.
- **Màn hình chậm hoặc một lời gọi lỗi.** Tab Network của trình duyệt chỉ hiện payload JSON-RPC, không cho thấy model,
  method, lỗi phía server, cũng không cho gọi lại qua external API.
- **Một chữ chưa được dịch.** Đó là giá trị field, chữ trong view, hay chữ trong code nằm trong file `.po` của module
  nào? Mỗi loại sửa ở một chỗ khác nhau.

Odoo Debug trả lời các câu hỏi này ngay trên màn hình, dưới dạng bảng, cho chính bạn hoặc cho bất kỳ user nào bạn chọn.

## Dành cho ai

- **Lập trình viên Odoo** debug module của mình: field, compute, kế thừa view, lời gọi RPC, record rule.
- **Tư vấn chức năng và người vận hành hệ thống** xử lý các yêu cầu "tôi không làm được X": quyền theo user, bản ghi và
  model, nhóm cấp gì, so sánh hai user, bản dịch.
- **Quản trị viên** rà soát database: ai giữ nhóm nhạy cảm, mỗi nhóm mở gì, instance phơi ra những gì trên web.

## Các tab

| Tab | Dùng để |
|---|---|
| **Record** | Mọi field của bản ghi: định nghĩa, giá trị theo kiểu dữ liệu, cái gì tính lại nó, lọc nhanh, sao chép dạng JSON |
| **View** | View được kể như một câu chuyện: view nào của module nào tạo nên nó, theo đúng thứ tự Odoo áp dụng; một field qua các view; arch tổng hợp |
| **RPC** | Các lời gọi JSON-RPC của trang, kèm thời gian và lỗi; sửa và gửi lại; Copy as cURL cho external API (18: `/jsonrpc`, 19: `/json/2`) |
| **Security** | Quyền dạng bảng: ACL và rule của một bản ghi × đọc / ghi / tạo / xoá, domain được đánh giá với user; quyền trên mọi model; nhóm, nhóm cấp gì và ai đang có; thử một nhóm trước khi cấp; so sánh hai user |
| **Translations** | Chữ đến từ đâu và sửa ở đâu; bản dịch của bản ghi và view theo từng ngôn ngữ; độ phủ `.po`, xuất và nhập; ngôn ngữ |
| **Apps** | Module như menu Apps của Odoo (cùng bộ lọc, dạng facet): chọn nhiều module rồi Kích hoạt (Cập nhật danh sách ứng dụng + cài kèm phụ thuộc), Nâng cấp hoặc mở form; ⚠ khi manifest trên đĩa mới hơn database. Mở một module: mô tả (`index.html` hoặc README), manifest, phụ thuộc hai chiều (cài nó sẽ kéo theo những gì, gồm cả module tự cài, tính đúng như Odoo) và dạng sơ đồ, dữ liệu và model của nó, gỡ cài đặt có xem trước bằng chính wizard của Odoo; các thao tác đang treo, áp dụng hoặc huỷ (quyền Settings) |
| Perf · Code | Đang chuyển từ bản JavaScript |

Phiên bản Odoo được nhận diện trên từng trang, và mọi khác biệt giữa 18.0 và 19.0 mà panel cần đều nằm ở một chỗ
(`src/odoo/adapters/`).

## Video demo

<!-- Dán video demo vào đây, ví dụ link YouTube: [![Odoo Debug demo](thumbnail.png)](https://www.youtube.com/watch?v=…)
     hoặc file .mp4 tải lên một issue / release của GitHub: https://github.com/user-attachments/assets/… -->
> 🎬 Video demo sẽ sớm có. Trong lúc chờ, ảnh chụp từng tab có trên
> [trang Odoo Debug](https://unclecatvn.github.io/extension-debug-odoo/).

## Hướng dẫn sử dụng

Hướng dẫn chi tiết từng tab, phím tắt và quyền riêng tư:
**https://unclecatvn.github.io/extension-debug-odoo/**.

Phím tắt: **Alt+Shift+O** ẩn / hiện panel, **Alt+Shift+D** bật / tắt chế độ debug của Odoo (đổi ở
`chrome://extensions/shortcuts`).

## Cài đặt và chạy

Cần có: **Node.js 22.18 trở lên**, và **Chrome** (hoặc Edge, Brave, mọi trình duyệt Chromium).

1. **Tải mã nguồn**
   ```sh
   git clone https://github.com/ngochung207/extension-debug-odoo-ts.git
   cd extension-debug-odoo-ts
   ```
2. **Cài các thư viện**
   ```sh
   npm install
   ```
3. **Build extension** ra thư mục `dist/`
   ```sh
   npm run build
   ```
4. **Nạp vào Chrome**
   1. Mở `chrome://extensions`.
   2. Bật **Developer mode** (góc trên bên phải).
   3. Bấm **Load unpacked** và chọn thư mục `dist/`.
   4. Nếu đang cài bản JavaScript của Odoo Debug, hãy tắt nó đi: cả hai đều thêm nút vào trang Odoo.
5. **Sử dụng**: mở một trang bất kỳ của database Odoo 18 hoặc 19 (đã đăng nhập), rồi bấm nút **Odoo Debug** ở góc dưới
   bên phải trang, hoặc nhấn **Alt+Shift+O**. Từ thanh tiêu đề của panel có thể phóng toàn màn hình hoặc tách ra cửa sổ
   riêng (dùng với màn hình thứ hai).
6. **Cập nhật** sau khi kéo code mới: `npm run build`, bấm ⟳ trên thẻ của extension ở `chrome://extensions`, rồi tải lại
   trang Odoo.

### Phát triển

```sh
npm run watch   # tự build lại dist/ mỗi lần lưu (rồi bấm ⟳ ở chrome://extensions)
npm run check   # những gì CI chạy: kiểm tra kiểu, unit test, build, kiểm tra hàm chạy trong trang / markup / import
npm run i18n    # cập nhật .pot / .po sau khi thêm chuỗi cần dịch
```

Cách tổ chức mã nguồn, các quy tắc và cách xử lý từng phiên bản Odoo: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Giấy phép

Odoo Debug là phần mềm tự do: bạn được phân phối lại và/hoặc sửa đổi theo **GNU Lesser General Public License v3.0**
([LICENSE](LICENSE), dựa trên GNU GPL v3.0 trong [COPYING](COPYING)), cùng giấy phép với Odoo Community. Extension không
chứa mã nguồn Odoo: nó làm việc với Odoo qua các route web và RPC.

Copyright © 2026 Trinh Ngoc Hung.
