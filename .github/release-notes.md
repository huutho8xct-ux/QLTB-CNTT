## QLTB-CNTT: Phần mềm quản lý thiết bị công nghệ thông tin

Phần mềm web quản lý toàn bộ vòng đời thiết bị CNTT dành cho **đơn vị sự nghiệp công lập**. Chạy trong mạng nội bộ, không cần Internet, giao diện tiếng Việt.

### Tải về

| Tệp | Dùng khi |
|---|---|
| **`QLTB-CNTT-Setup-x.y.z.exe`** | **Khuyến nghị.** Trình cài đặt cho Windows 10/11 và Windows Server 2016 trở lên (64-bit). Bấm Next → Install là xong. |
| `QLTB-CNTT-x.y.z-windows-x64.zip` | Bản giải nén: chép vào `C:\`, chạy `CAI-DAT.bat`. |

Cả hai đều **kèm sẵn Node.js**, nên máy chủ không cần Internet khi cài.

Sau khi cài:

1. Mở lối tắt **QLTB-CNTT** trên Desktop, hoặc vào `http://localhost:3000`.
2. Đăng nhập bằng `admin` / `admin@123`. Hệ thống sẽ yêu cầu đổi mật khẩu ngay.
3. Các máy khác trong cơ quan truy cập bằng `http://<IP-máy-chủ>:3000`.

Hướng dẫn chi tiết: [HUONG-DAN-CAI-DAT-WINDOWS.md](../../blob/claude/stoic-edison-r1ame9/HUONG-DAN-CAI-DAT-WINDOWS.md)

> Bộ cài chưa có chữ ký số. Nếu Windows báo *"Windows protected your PC"*, chọn **More info → Run anyway**.

### Tính năng chính

- **Hồ sơ thiết bị:** cấu hình phần cứng, IP/MAC, hợp đồng, nguồn vốn, bảo hành, mã QR và in tem dán.
- **Cấp phát, điều chuyển, thu hồi:** in biên bản bàn giao đúng thể thức hành chính.
- **Báo hỏng và sửa chữa:** theo dõi quy trình xử lý, chi phí; lập lịch bảo trì định kỳ có nhắc việc.
- **Kiểm kê:** dùng máy quét mã QR, in biên bản kiểm kê.
- **Thanh lý:** có bước phê duyệt, ghi giảm tài sản.
- **Bản quyền phần mềm:** quản lý license, cảnh báo hết hạn.
- **Hao mòn tài sản:** tính hao mòn và giá trị còn lại; 11 loại báo cáo, xuất Excel, in ấn.
- **Nhập Excel:** nhập danh sách thiết bị theo tệp mẫu.
- **Phân quyền và bảo mật:** 5 vai trò, nhật ký thao tác, khóa tài khoản khi nhập sai mật khẩu nhiều lần.
- **Sao lưu:** tự động mỗi ngày, phục hồi ngay trên giao diện.
- **Trên Windows:** chạy nền như dịch vụ, tự khởi động cùng máy chủ; công cụ `QUAN-LY.bat` để quản lý.

### Kiểm thử

Mỗi bản phát hành được tự động cài đặt, truy cập và gỡ bỏ thử trên Windows trước khi đăng.
