# Hướng dẫn cài đặt QLTB-CNTT trên Windows

Phần mềm được cài lên **một máy chủ** (hoặc một máy tính bật thường xuyên) trong mạng nội bộ. Các máy khác chỉ cần trình duyệt web (Chrome, Edge, Cốc Cốc, Firefox) để truy cập, **không cần cài gì thêm**.

Sau khi cài, phần mềm chạy nền như một dịch vụ:

- Tự khởi động cùng Windows, không cần ai đăng nhập vào máy chủ.
- Tự khởi động lại nếu bị dừng bất thường.
- Tự sao lưu dữ liệu mỗi ngày.

## Yêu cầu

| Thành phần | Yêu cầu |
|---|---|
| Hệ điều hành | Windows 10, Windows 11 hoặc Windows Server 2016/2019/2022/2025 (64-bit) |
| Phần cứng | CPU 2 nhân, RAM 4 GB, đĩa trống 1 GB (phần mềm rất nhẹ; dữ liệu 10.000 thiết bị chỉ vài chục MB) |
| Quyền | Tài khoản Administrator trên máy chủ |
| Mạng | Máy chủ nên đặt **IP tĩnh** để các máy khác truy cập ổn định |

Gói cài đặt đã kèm sẵn Node.js, nên **không cần Internet** khi cài.

## Cách 1: Dùng trình cài đặt `QLTB-CNTT-Setup-x.y.z.exe` (khuyến nghị)

1. Chép tệp `QLTB-CNTT-Setup-x.y.z.exe` vào máy chủ, nhấp đúp để chạy, chọn **Yes** khi Windows hỏi quyền quản trị.
2. Chọn thư mục cài đặt. Mặc định là `C:\QLTB-CNTT`; nên giữ nguyên hoặc dùng đường dẫn **không dấu, không khoảng trắng**.
3. Chọn cổng truy cập (mặc định `3000`). Chỉ đổi khi cổng này đã có phần mềm khác dùng, ví dụ đổi sang `8080`.
4. Bấm **Install**. Trình cài đặt sẽ tự:
   - đăng ký dịch vụ chạy nền, tự khởi động cùng Windows;
   - mở tường lửa cho các máy trong cùng mạng nội bộ;
   - tạo lối tắt **QLTB-CNTT** trên Desktop và trong Start Menu;
   - khởi động phần mềm.
5. Bấm **Finish** để mở phần mềm, đăng nhập bằng `admin` / `admin@123`, rồi đổi mật khẩu theo yêu cầu.

Để **gỡ cài đặt**, vào *Settings → Apps* (hoặc *Control Panel → Programs*) và chọn *QLTB-CNTT*. Thư mục dữ liệu `data` được giữ lại.

## Cách 2: Dùng gói nén `QLTB-CNTT-x.y.z-windows-x64.zip`

1. Chuột phải vào tệp zip, chọn **Properties**, tích **Unblock** rồi bấm **OK**. Bước này giúp Windows không chặn các tệp tải về từ Internet.
2. Giải nén vào ổ `C:\`. Kết quả là thư mục `C:\QLTB-CNTT`.
3. Mở thư mục, nhấp đúp **`CAI-DAT.bat`** và chọn **Yes** khi được hỏi quyền quản trị.
4. Nhấn **Enter** để chấp nhận thư mục và cổng mặc định, hoặc nhập giá trị khác.
5. Khi cài xong, cửa sổ hiển thị các địa chỉ truy cập và trình duyệt tự mở phần mềm.

Nếu giải nén ở nơi khác (ví dụ thư mục *Downloads*), `CAI-DAT.bat` sẽ tự chép phần mềm sang `C:\QLTB-CNTT`.

## Truy cập từ các máy khác

Trên máy chủ, mở *Command Prompt*, gõ `ipconfig` và xem dòng **IPv4 Address** (ví dụ `192.168.1.10`).

Trên các máy khác, mở trình duyệt và vào `http://192.168.1.10:3000`. Nên lưu địa chỉ này vào thanh dấu trang hoặc tạo lối tắt trên Desktop cho cán bộ.

Nếu không truy cập được:

- Kiểm tra máy chủ và máy trạm cùng mạng (ping được nhau).
- Phần mềm diệt virus có tường lửa riêng (Kaspersky, Bkav, ESET...) cần mở thêm cổng `3000` (TCP, chiều vào).
- Chạy `QUAN-LY.bat` trên máy chủ và xem mục *Truy cap web* có báo **BINH THUONG** không.

## Công cụ quản lý: `QUAN-LY.bat`

Có sẵn trong thư mục cài đặt và trong Start Menu (*Quan ly dich vu QLTB-CNTT*). Công cụ hiển thị trạng thái dịch vụ và cung cấp các chức năng:

| Phím | Chức năng |
|---|---|
| 1 | Mở phần mềm trên trình duyệt |
| 2 / 3 / 4 | Khởi động / Dừng / Khởi động lại |
| 5 | Xem nhật ký hoạt động (khi cần tìm lỗi) |
| 6 | Mở thư mục chứa các bản sao lưu dữ liệu |
| 7 | Đặt lại mật khẩu tài khoản `admin` (khi quên) |
| 8 | Đổi cổng truy cập |

## Nâng cấp lên phiên bản mới

- **Bản Setup.exe:** chạy bản cài đặt mới. Trình cài tự dừng phần mềm, cập nhật và khởi động lại. Dữ liệu được giữ nguyên.
- **Bản zip:** giải nén bản mới ra một thư mục tạm, chạy `CAI-DAT.bat` và giữ nguyên thư mục cài đặt cũ (`C:\QLTB-CNTT`). Dữ liệu được giữ nguyên.

Trước khi nâng cấp nên vào *Cấu hình - Sao lưu → Sao lưu ngay* để chắc chắn có bản sao lưu.

## Dữ liệu và sao lưu

| Nội dung | Vị trí |
|---|---|
| Cơ sở dữ liệu | `C:\QLTB-CNTT\data\qltb.db` |
| Bản sao lưu tự động hằng ngày | `C:\QLTB-CNTT\data\backups\` |
| Nhật ký máy chủ | `C:\QLTB-CNTT\data\logs\server.log` |

**Khuyến nghị:** định kỳ chép thư mục `data\backups` sang ổ đĩa khác, NAS hoặc USB. Nếu máy chủ hỏng ổ cứng, chỉ cần cài lại phần mềm trên máy mới rồi vào *Cấu hình - Sao lưu → Phục hồi từ tệp* và chọn bản sao lưu gần nhất.

## Chuyển phần mềm sang máy chủ khác

1. Trên máy cũ: chạy `QUAN-LY.bat` và chọn **3** (Dừng), sau đó chép thư mục `C:\QLTB-CNTT\data`.
2. Trên máy mới: cài đặt phần mềm, chạy `QUAN-LY.bat` và chọn **3** (Dừng).
3. Chép đè thư mục `data` đã lưu vào `C:\QLTB-CNTT\data`.
4. Chạy `QUAN-LY.bat` và chọn **2** (Khởi động).

## Gỡ cài đặt (bản zip)

Chạy `GO-CAI-DAT.bat`. Dịch vụ, quy tắc tường lửa và lối tắt sẽ bị gỡ. Thư mục `data` được giữ lại; xóa thủ công thư mục `C:\QLTB-CNTT` nếu không cần nữa.

## Chạy thử không cài dịch vụ

Nhấp đúp `start.bat`. Phần mềm chạy trong cửa sổ đó và dừng khi đóng cửa sổ. Cách này phù hợp để dùng thử hoặc trình diễn.

## Dành cho cán bộ kỹ thuật: tự đóng gói bản cài đặt

```bash
npm install
npm run build:windows          # tạo dist\QLTB-CNTT-x.y.z-windows-x64.zip (kèm Node.js)
iscc windows\setup.iss         # tạo dist\QLTB-CNTT-Setup-x.y.z.exe (cần Inno Setup 6)
```

Kho mã có sẵn quy trình GitHub Actions (`.github/workflows/windows-package.yml`). Quy trình này tự đóng gói, cài đặt thử trên Windows và xuất cả hai tệp cài đặt ở mục *Artifacts* của mỗi lần chạy.

Về kỹ thuật, dịch vụ là một tác vụ Task Scheduler tên `QLTB-CNTT`, chạy bằng tài khoản `SYSTEM`. Tác vụ khởi chạy khi máy bật, không giới hạn thời gian chạy, và tự chạy lại sau 1 phút nếu bị lỗi. Quy tắc tường lửa tên `QLTB-CNTT` chỉ cho phép truy cập từ cùng mạng con (LocalSubnet).
