# QLTB-CNTT: Phần mềm quản lý thiết bị công nghệ thông tin

Phần mềm web quản lý toàn bộ vòng đời tài sản, thiết bị CNTT dành cho **đơn vị sự nghiệp công lập**: ghi tăng, cấp phát, điều chuyển, thu hồi, báo hỏng, sửa chữa, bảo trì, kiểm kê, thanh lý, tính hao mòn và báo cáo thống kê.

- Chạy trên mạng nội bộ (LAN), không cần Internet, không cần cài máy chủ CSDL riêng.
- Giao diện tiếng Việt, dùng được trên máy tính, máy tính bảng và điện thoại.
- Biểu mẫu in theo thể thức văn bản hành chính (quốc hiệu, tiêu ngữ, chữ ký).

## Tính năng

| Phân hệ | Chức năng |
|---|---|
| **Bảng điều khiển** | Thống kê tổng quan, biểu đồ theo trạng thái/loại/phòng ban/năm đầu tư, danh sách việc cần xử lý, hoạt động gần đây |
| **Hồ sơ thiết bị** | Mã tài sản tự sinh theo loại; cấu hình phần cứng (CPU, RAM, ổ cứng, HĐH); IP/MAC/hostname; nhà cung cấp, hợp đồng, hóa đơn, nguồn vốn; nguyên giá, thời gian sử dụng; bảo hành tự tính hạn; thiết bị kèm theo (bộ máy); nhân bản, thêm nhiều thiết bị cùng lúc; cập nhật hàng loạt; tìm kiếm và lọc đa tiêu chí |
| **Mã QR** | Mỗi thiết bị có mã QR; in tem dán hàng loạt; quét tem bằng điện thoại để mở hồ sơ thiết bị |
| **Lý lịch thiết bị** | Toàn bộ lịch sử: ghi tăng, bàn giao, sửa chữa, bảo trì, kiểm kê, cài phần mềm, thanh lý; in lý lịch thiết bị |
| **Cấp phát, điều chuyển, thu hồi** | Lập phiếu nhiều thiết bị, tự cập nhật phòng ban/người sử dụng/trạng thái; in **biên bản bàn giao** |
| **Sửa chữa, báo hỏng** | Viên chức tự báo hỏng; quy trình *Chờ xử lý → Đang xử lý / Gửi bảo hành → Hoàn thành / Không sửa được*; mức độ ưu tiên; chi phí, linh kiện thay thế; in phiếu sửa chữa, xuất sổ theo dõi |
| **Bảo trì định kỳ** | Lập kế hoạch cho từng thiết bị, theo loại hoặc theo phòng ban; tự sinh kỳ tiếp theo; cảnh báo quá hạn, sắp đến hạn |
| **Kiểm kê** | Chốt danh sách theo sổ sách; kiểm đếm bằng **máy quét mã vạch/QR** hoặc đánh dấu; phát hiện thiết bị thiếu/thừa; cập nhật tình trạng thực tế; in **biên bản kiểm kê**, xuất Excel |
| **Thanh lý** | Hồ sơ đề nghị → lãnh đạo phê duyệt (số quyết định) → hoàn thành, ghi giảm tài sản; tiền thu, chi phí thanh lý; in danh mục/biên bản thanh lý (có số tiền bằng chữ) |
| **Bản quyền phần mềm** | Quản lý license (vĩnh viễn, thuê bao, OEM, số lượng lớn), số lượng đã dùng, gán cho thiết bị, cảnh báo hết hạn |
| **Hao mòn tài sản** | Tính hao mòn lũy kế, giá trị còn lại; chọn phương pháp *theo tháng* hoặc *tròn năm*; phân biệt TSCĐ / công cụ dụng cụ theo ngưỡng nguyên giá cấu hình được |
| **Báo cáo** | Sổ theo dõi tài sản; bảng tính hao mòn năm; tổng hợp theo phòng ban / loại / nguồn vốn; tăng giảm tài sản; sửa chữa; bảo hành; thời gian sử dụng và đề xuất thay thế; sổ cấp phát; danh sách IP (phát hiện trùng IP). Tất cả **xuất Excel** và **in** được |
| **Nhập Excel** | Tệp mẫu chuẩn; kiểm tra lỗi trước khi nhập; tự thêm danh mục còn thiếu; cập nhật theo mã tài sản |
| **Danh mục** | Phòng ban (phân cấp), loại thiết bị (tiền tố mã, số năm sử dụng, chu kỳ bảo trì), nhà cung cấp, nguồn vốn |
| **Người dùng và phân quyền** | 5 vai trò: Quản trị hệ thống, Cán bộ quản lý tài sản, Kỹ thuật viên CNTT, Lãnh đạo đơn vị, Viên chức (chỉ thấy thiết bị phòng mình) |
| **Bảo mật** | Mật khẩu mã hóa scrypt; khóa tài khoản 15 phút sau 5 lần đăng nhập sai; buộc đổi mật khẩu lần đầu; chính sách mật khẩu; phiên đăng nhập có thời hạn; nhật ký mọi thao tác (ai, lúc nào, từ IP nào) |
| **Sao lưu** | Tự động sao lưu hằng ngày (giữ N bản gần nhất); sao lưu thủ công; tải về; phục hồi (tự tạo bản an toàn trước khi ghi đè) |

## Yêu cầu hệ thống

- **Node.js 22.13 trở lên** (khuyến nghị bản LTS mới nhất), tải tại https://nodejs.org
- Windows 10/11, Windows Server 2016+, hoặc Linux (Ubuntu, CentOS...)
- Khoảng 200 MB dung lượng đĩa

## Cài đặt và chạy

```bash
# 1. Tải mã nguồn về máy chủ, vào thư mục phần mềm
cd QLTB-CNTT

# 2. Cài thư viện (chỉ cần làm 1 lần, cần Internet)
npm install

# 3. (Tùy chọn) Tạo dữ liệu mẫu để dùng thử
npm run seed:demo

# 4. Chạy phần mềm
npm start
```

Mở trình duyệt và truy cập `http://localhost:3000`. Các máy khác trong mạng LAN truy cập theo `http://<IP-máy-chủ>:3000`.

**Tài khoản mặc định:** `admin` / `admin@123`. Hệ thống bắt buộc đổi mật khẩu ở lần đăng nhập đầu tiên.

Dữ liệu mẫu có thêm các tài khoản `quanly`, `kythuat`, `lanhdao`, `nhanvien` (mật khẩu `Demo@1234`).

### Trên Windows

Nhấp đúp `start.bat`. Để phần mềm tự chạy khi khởi động máy chủ, có thể dùng [NSSM](https://nssm.cc) cài thành Windows Service, hoặc dùng `pm2`:

```bash
npm install -g pm2 pm2-windows-startup
pm2 start server.js --name qltb --node-args="--disable-warning=ExperimentalWarning"
pm2 save && pm2-startup install
```

### Trên Linux (systemd)

```ini
# /etc/systemd/system/qltb.service
[Unit]
Description=QLTB-CNTT
After=network.target

[Service]
WorkingDirectory=/opt/QLTB-CNTT
ExecStart=/usr/bin/npm start
Restart=always
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now qltb
```

### Docker

```bash
docker build -t qltb-cntt .
docker run -d -p 3000:3000 -v qltb-data:/app/data --name qltb qltb-cntt
```

### Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `3000` | Cổng truy cập |
| `HOST` | `0.0.0.0` | Địa chỉ lắng nghe |
| `DATA_DIR` | `./data` | Thư mục chứa CSDL và bản sao lưu |
| `TRUST_PROXY` | (trống) | Đặt `1` nếu chạy sau Nginx/IIS reverse proxy để ghi đúng IP người dùng |

> Khi triển khai ra ngoài mạng nội bộ, nên đặt sau reverse proxy có **HTTPS** (Nginx, IIS, Caddy).

## Hướng dẫn sử dụng nhanh

1. **Cấu hình - Sao lưu**: nhập tên đơn vị, cơ quan chủ quản, địa danh, thủ trưởng, kế toán. Các thông tin này dùng cho biên bản và báo cáo.
2. **Danh mục**: rà soát phòng ban, loại thiết bị (tiền tố mã, số năm sử dụng), nguồn vốn, nhà cung cấp.
3. **Người dùng**: tạo tài khoản cho cán bộ, gán vai trò và phòng ban.
4. **Thiết bị**: nhập từng thiết bị hoặc nhập hàng loạt từ Excel (tải tệp mẫu trong hộp thoại *Nhập Excel*). Thiết bị mới nằm trong **Kho**.
5. **Cấp phát**: chọn thiết bị trong kho, chọn phòng ban nhận, lưu và in biên bản bàn giao.
6. **In tem QR**: chọn thiết bị trong danh sách, bấm *In tem QR*, dán tem lên thiết bị.
7. **Báo hỏng**: mọi người dùng đều có nút *Báo hỏng thiết bị*. Kỹ thuật viên tiếp nhận và cập nhật kết quả.
8. **Kiểm kê cuối năm**: tạo đợt kiểm kê, dùng máy quét (hoặc gõ mã) để kiểm đếm, hoàn thành và in biên bản.
9. **Thanh lý**: lập hồ sơ cho thiết bị hỏng hoặc hết thời gian sử dụng, chờ lãnh đạo phê duyệt, rồi hoàn thành.

## Quên mật khẩu quản trị

```bash
npm run reset-admin                 # đặt lại thành admin@123
npm run reset-admin -- MatKhauMoi1  # hoặc mật khẩu tùy chọn
```

## Lưu ý về hao mòn tài sản

Phần mềm tính hao mòn theo phương pháp đường thẳng: *mức hao mòn năm = nguyên giá / số năm sử dụng*. Số năm sử dụng mặc định lấy theo **loại thiết bị** và có thể chỉnh riêng cho từng thiết bị. Ngưỡng nguyên giá xác định TSCĐ (mặc định 10.000.000 đ) và phương pháp tính (theo tháng hoặc tròn năm) được cấu hình trong *Cấu hình - Sao lưu*. Đơn vị cần đối chiếu và thiết lập theo quy định về chế độ quản lý, tính hao mòn TSCĐ đang áp dụng (Thông tư của Bộ Tài chính và quy định của địa phương, cơ quan chủ quản).

## Cấu trúc mã nguồn

```
server.js               Khởi động máy chủ web
src/db.js               Cơ sở dữ liệu SQLite, cấu trúc bảng, dữ liệu khởi tạo
src/auth.js             Mã hóa mật khẩu, phiên đăng nhập, kiểm tra quyền
src/backup.js           Sao lưu, phục hồi
src/routes/*.js         API nghiệp vụ (thiết bị, cấp phát, sửa chữa, kiểm kê, thanh lý, báo cáo...)
public/                 Giao diện web (HTML, CSS, JavaScript thuần, không cần build)
public/js/constants.js  Danh mục trạng thái, ma trận phân quyền, công thức hao mòn (dùng chung)
public/js/print.js      Mẫu in biên bản, phiếu, tem QR
scripts/                Dữ liệu mẫu, đặt lại mật khẩu quản trị
test/                   Kiểm thử tự động (npm test)
```

## Giấy phép

MIT
