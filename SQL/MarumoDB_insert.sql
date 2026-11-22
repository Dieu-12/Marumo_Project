USE MarumoDB;
GO

DECLARE @pwdHash NVARCHAR(255) = N'$2b$10$tk8qEdPtmCtb0U.chhQ13Oh6K7xlpc2qzN7IXWGjLZ.MwxPGhToWm';

INSERT INTO dbo.administrative_units (unit_code, unit_name, unit_type, valid_from)
SELECT NULL, v.unit_name, 'PROVINCE', v.valid_from
FROM (VALUES
    (N'Hà Nội',  '20250701'),
    (N'Đà Nẵng', '20250701')
) AS v(unit_name, valid_from)
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.administrative_units e
    WHERE e.unit_name = v.unit_name AND e.unit_type = 'PROVINCE' AND e.valid_to IS NULL
);

INSERT INTO dbo.administrative_units (unit_code, unit_name, unit_type, parent_unit_id, valid_from)
SELECT NULL, v.unit_name, 'WARD', p.unit_id, '20250701'
FROM (VALUES
    (N'Hà Nội',  N'Phường Hoàn Kiếm'),
    (N'Hà Nội',  N'Phường Cầu Giấy'),
    (N'Hà Nội',  N'Phường Ba Đình'),
    (N'Đà Nẵng', N'Phường Hải Châu'),
    (N'Đà Nẵng', N'Phường Thanh Khê')
) AS v(parent_name, unit_name)
JOIN dbo.administrative_units p
  ON p.unit_name = v.parent_name AND p.unit_type = 'PROVINCE' AND p.valid_to IS NULL
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.administrative_units e
    WHERE e.unit_name = v.unit_name AND e.unit_type = 'WARD' AND e.valid_to IS NULL
);

INSERT INTO dbo.room_types (type_code, type_name, display_order)
SELECT 'STANDARD', N'Phòng tiêu chuẩn', 3
WHERE NOT EXISTS (SELECT 1 FROM dbo.room_types WHERE type_code = 'STANDARD');

INSERT INTO dbo.branches (branch_code, branch_name, phone, email, description, status, opened_at)
SELECT v.branch_code, v.branch_name, v.phone, v.email, v.description, 'ACTIVE', v.opened_at
FROM (VALUES
    ('MRM-HCM-01', N'Marumo Cinema Saigon Centre', '02838210001', N'hcm01@marumo.vn', N'Rạp trung tâm Quận 1 cũ, 8 phòng gồm 2 phòng IMAX.', DATEADD(MONTH, -14, SYSUTCDATETIME())),
    ('MRM-HCM-02', N'Marumo Cinema Tân Định',      '02838210002', N'hcm02@marumo.vn', N'Rạp khu phố lân cận nhà thờ Tân Định, 2 phòng.',     DATEADD(MONTH, -9,  SYSUTCDATETIME())),
    ('MRM-HCM-03', N'Marumo Cinema Bến Thành',     '02838210003', N'hcm03@marumo.vn', N'Rạp khu chợ Bến Thành, 2 phòng.',                    DATEADD(MONTH, -7,  SYSUTCDATETIME())),
    ('MRM-HN-01',  N'Marumo Cinema Hoàn Kiếm',     '02439330001', N'hn01@marumo.vn',  N'Rạp trung tâm phố cổ Hà Nội, 2 phòng.',              DATEADD(MONTH, -11, SYSUTCDATETIME())),
    ('MRM-HN-02',  N'Marumo Cinema Cầu Giấy',      '02439330002', N'hn02@marumo.vn',  N'Rạp khu Tây Hà Nội, 2 phòng.',                       DATEADD(MONTH, -6,  SYSUTCDATETIME())),
    ('MRM-DN-01',  N'Marumo Cinema Hải Châu',      '02363550001', N'dn01@marumo.vn',  N'Rạp trung tâm Đà Nẵng, 2 phòng.',                    DATEADD(MONTH, -5,  SYSUTCDATETIME()))
) AS v(branch_code, branch_name, phone, email, description, opened_at)
WHERE NOT EXISTS (SELECT 1 FROM dbo.branches b WHERE b.branch_code = v.branch_code);

INSERT INTO dbo.branch_addresses (branch_id, ward_unit_id, street_address, address_detail, latitude, longitude, is_primary)
SELECT b.branch_id, w.unit_id, v.street_address, NULL, v.latitude, v.longitude, 1
FROM (VALUES
    ('MRM-HCM-01', N'Phường Bến Thành',   N'158 Công Xã Paris',        CAST(10.7765200 AS DECIMAL(10,7)), CAST(106.7019100 AS DECIMAL(10,7))),
    ('MRM-HCM-02', N'Phường Tân Định',    N'289 Nguyễn Đình Chiểu',    CAST(10.7831900 AS DECIMAL(10,7)), CAST(106.7004200 AS DECIMAL(10,7))),
    ('MRM-HCM-03', N'Phường Sài Gòn',     N'23 Lê Lợi',                CAST(10.7741600 AS DECIMAL(10,7)), CAST(106.7037100 AS DECIMAL(10,7))),
    ('MRM-HN-01',  N'Phường Hoàn Kiếm',   N'2 Bà Triệu',               CAST(21.0227400 AS DECIMAL(10,7)), CAST(105.8521700 AS DECIMAL(10,7))),
    ('MRM-HN-02',  N'Phường Cầu Giấy',    N'238 Xuân Thủy',            CAST(21.0368100 AS DECIMAL(10,7)), CAST(105.8022800 AS DECIMAL(10,7))),
    ('MRM-DN-01',  N'Phường Hải Châu',    N'46 Ngũ Hành Sơn',          CAST(16.0635900 AS DECIMAL(10,7)), CAST(108.2214300 AS DECIMAL(10,7)))
) AS v(branch_code, ward_name, street_address, latitude, longitude)
JOIN dbo.branches b ON b.branch_code = v.branch_code
JOIN dbo.administrative_units w ON w.unit_name = v.ward_name AND w.unit_type = 'WARD' AND w.valid_to IS NULL
WHERE NOT EXISTS (SELECT 1 FROM dbo.branch_addresses a WHERE a.branch_id = b.branch_id);

INSERT INTO dbo.branch_operating_hours (branch_id, day_of_week, open_time, close_time, is_closed, effective_from)
SELECT b.branch_id, d.day_of_week, CAST('09:00' AS TIME(0)), CAST('23:00' AS TIME(0)), 0, CAST(CAST(CAST(SYSUTCDATETIME() AS DATE) AS DATETIME) AS DATE)
FROM dbo.branches b
CROSS JOIN (VALUES (1),(2),(3),(4),(5),(6),(7)) AS d(day_of_week)
WHERE b.branch_code LIKE 'MRM-%'
  AND NOT EXISTS (
      SELECT 1 FROM dbo.branch_operating_hours h
      WHERE h.branch_id = b.branch_id AND h.day_of_week = d.day_of_week AND h.effective_to IS NULL
  );

INSERT INTO dbo.auditoriums (branch_id, room_type_id, auditorium_code, auditorium_name, screen_width, screen_height)
SELECT b.branch_id, rt.room_type_id, v.auditorium_code, v.auditorium_name, v.screen_width, v.screen_height
FROM (VALUES
    ('MRM-HCM-01', 'R1', 'STANDARD', N'Phòng 1', CAST(12.0 AS DECIMAL(8,2)), CAST(6.0 AS DECIMAL(8,2))),
    ('MRM-HCM-01', 'R2', 'VIP',      N'Phòng 2', CAST(11.0 AS DECIMAL(8,2)), CAST(5.5 AS DECIMAL(8,2))),
    ('MRM-HCM-02', 'R1', 'STANDARD', N'Phòng 1', CAST(12.0 AS DECIMAL(8,2)), CAST(6.0 AS DECIMAL(8,2))),
    ('MRM-HCM-02', 'R2', 'IMAX',     N'Phòng 2', CAST(18.0 AS DECIMAL(8,2)), CAST(9.0 AS DECIMAL(8,2))),
    ('MRM-HCM-03', 'R1', 'STANDARD', N'Phòng 1', CAST(12.0 AS DECIMAL(8,2)), CAST(6.0 AS DECIMAL(8,2))),
    ('MRM-HCM-03', 'R2', 'VIP',      N'Phòng 2', CAST(11.0 AS DECIMAL(8,2)), CAST(5.5 AS DECIMAL(8,2))),
    ('MRM-HN-01',  'R1', 'STANDARD', N'Phòng 1', CAST(12.0 AS DECIMAL(8,2)), CAST(6.0 AS DECIMAL(8,2))),
    ('MRM-HN-01',  'R2', 'IMAX',     N'Phòng 2', CAST(18.0 AS DECIMAL(8,2)), CAST(9.0 AS DECIMAL(8,2))),
    ('MRM-HN-02',  'R1', 'STANDARD', N'Phòng 1', CAST(12.0 AS DECIMAL(8,2)), CAST(6.0 AS DECIMAL(8,2))),
    ('MRM-HN-02',  'R2', 'VIP',      N'Phòng 2', CAST(11.0 AS DECIMAL(8,2)), CAST(5.5 AS DECIMAL(8,2))),
    ('MRM-DN-01',  'R1', 'STANDARD', N'Phòng 1', CAST(12.0 AS DECIMAL(8,2)), CAST(6.0 AS DECIMAL(8,2))),
    ('MRM-DN-01',  'R2', 'IMAX',     N'Phòng 2', CAST(18.0 AS DECIMAL(8,2)), CAST(9.0 AS DECIMAL(8,2)))
) AS v(branch_code, auditorium_code, room_type_code, auditorium_name, screen_width, screen_height)
JOIN dbo.branches b ON b.branch_code = v.branch_code
JOIN dbo.room_types rt ON rt.type_code = v.room_type_code
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.auditoriums a
    WHERE a.branch_id = b.branch_id AND a.auditorium_code = v.auditorium_code
);

INSERT INTO dbo.auditorium_screening_formats (auditorium_id, format_id, is_active)
SELECT a.auditorium_id, f.format_id, 1
FROM dbo.auditoriums a
JOIN dbo.room_types rt ON rt.room_type_id = a.room_type_id
JOIN dbo.screening_formats f ON f.format_code IN (CASE WHEN rt.type_code = 'IMAX' THEN 'IMAX_2D' ELSE 'TWO_D' END, 'TWO_D')
WHERE a.auditorium_code LIKE 'R%'
  AND NOT EXISTS (
      SELECT 1 FROM dbo.auditorium_screening_formats e
      WHERE e.auditorium_id = a.auditorium_id AND e.format_id = f.format_id
  );

INSERT INTO dbo.auditorium_screening_formats (auditorium_id, format_id, is_active)
SELECT a.auditorium_id, f.format_id, 1
FROM dbo.auditoriums a
JOIN dbo.room_types rt ON rt.room_type_id = a.room_type_id
JOIN dbo.screening_formats f ON f.format_code IN (CASE WHEN rt.type_code = 'IMAX' THEN 'IMAX_3D' ELSE 'THREE_D' END)
WHERE a.auditorium_code LIKE 'R%'
  AND NOT EXISTS (
      SELECT 1 FROM dbo.auditorium_screening_formats e
      WHERE e.auditorium_id = a.auditorium_id AND e.format_id = f.format_id
  );

INSERT INTO dbo.seat_layouts (auditorium_id, layout_name)
SELECT a.auditorium_id, CONCAT(N'Layout mặc định ', a.auditorium_name)
FROM dbo.auditoriums a
WHERE a.auditorium_code LIKE 'R%'
  AND NOT EXISTS (SELECT 1 FROM dbo.seat_layouts l WHERE l.auditorium_id = a.auditorium_id);

DECLARE @adminId BIGINT =
    (SELECT user_id FROM dbo.users WHERE email = N'admin@marumo.vn');

IF @adminId IS NULL
BEGIN
    INSERT INTO dbo.users (email, password_hash, full_name, phone, status, email_verified_at, password_changed_at)
    VALUES (N'admin@marumo.vn', @pwdHash, N'Nguyễn Minh An', '0900100001', 'ACTIVE', SYSUTCDATETIME(), SYSUTCDATETIME());
    SET @adminId = SCOPE_IDENTITY();
END

INSERT INTO dbo.users (email, password_hash, full_name, phone, status, email_verified_at, password_changed_at)
SELECT v.email, @pwdHash, v.full_name, v.phone, 'ACTIVE', SYSUTCDATETIME(), SYSUTCDATETIME()
FROM (VALUES
    (N'quanly.hcm01@marumo.vn', N'Trần Quốc Bảo',   '0900100101'),
    (N'quanly.hcm02@marumo.vn', N'Lê Thị Cẩm Hồng', '0900100102'),
    (N'quanly.hcm03@marumo.vn', N'Phạm Văn Dũng',   '0900100103'),
    (N'quanly.hn01@marumo.vn',  N'Hoàng Gia Huy',   '0900100104'),
    (N'quanly.hn02@marumo.vn',  N'Đỗ Thanh Mai',    '0900100105'),
    (N'quanly.dn01@marumo.vn',  N'Vũ Như Quỳnh',    '0900100106'),
    (N'khach01@example.com',    N'Đặng Khánh Linh', '0900100201'),
    (N'khach02@example.com',    N'Bùi Tuấn Kiệt',   '0900100202'),
    (N'khach03@example.com',    N'Nguyễn Thảo Vy',  '0900100203'),
    (N'khach04@example.com',    N'Lâm Chí Cường',   '0900100204'),
    (N'khach05@example.com',    N'Trịnh Mỹ Duyên',  '0900100205'),
    (N'khach06@example.com',    N'Phan Gia Hân',    '0900100206')
) AS v(email, full_name, phone)
WHERE NOT EXISTS (SELECT 1 FROM dbo.users u WHERE u.email = v.email);

INSERT INTO dbo.user_roles (user_id, role_id, assigned_by)
SELECT u.user_id, r.role_id, @adminId
FROM dbo.users u
JOIN dbo.roles r ON r.role_code =
    CASE
        WHEN u.email = N'admin@marumo.vn' THEN 'ADMIN'
        WHEN u.email LIKE N'quanly.%' THEN 'MANAGER'
        ELSE 'CUSTOMER'
    END
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.user_roles ur
    WHERE ur.user_id = u.user_id AND ur.role_id = r.role_id AND ur.revoked_at IS NULL
);

INSERT INTO dbo.role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM dbo.roles r
JOIN dbo.permissions p ON
    r.role_code IN ('ADMIN', 'MANAGER')
    OR (r.role_code = 'STAFF' AND p.permission_code IN ('branch.view', 'staff.view', 'booking.view', 'booking.cancel', 'booking.scan'))
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.role_permissions rp
    WHERE rp.role_id = r.role_id AND rp.permission_id = p.permission_id
);

INSERT INTO dbo.user_branch_assignments (user_id, branch_id, role_id, assigned_by, starts_at, status)
SELECT u.user_id, b.branch_id, r.role_id, @adminId, SYSUTCDATETIME(), 'ACTIVE'
FROM (VALUES
    (N'quanly.hcm01@marumo.vn', 'MRM-HCM-01'),
    (N'quanly.hcm02@marumo.vn', 'MRM-HCM-02'),
    (N'quanly.hcm03@marumo.vn', 'MRM-HCM-03'),
    (N'quanly.hn01@marumo.vn',  'MRM-HN-01'),
    (N'quanly.hn02@marumo.vn',  'MRM-HN-02'),
    (N'quanly.dn01@marumo.vn',  'MRM-DN-01')
) AS v(email, branch_code)
JOIN dbo.users u ON u.email = v.email
JOIN dbo.branches b ON b.branch_code = v.branch_code
JOIN dbo.roles r ON r.role_code = 'MANAGER'
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.user_branch_assignments e
    WHERE e.user_id = u.user_id AND e.branch_id = b.branch_id AND e.status = 'ACTIVE'
);

INSERT INTO dbo.movies (movie_code, title, original_title, slug, synopsis, duration_minutes, release_date, end_date, production_year, production_company, director_display, original_language_code, status, is_featured)
SELECT v.movie_code, v.title, v.original_title, v.slug, v.synopsis, v.duration_minutes,
       DATEADD(DAY, v.release_offset, CAST(SYSUTCDATETIME() AS DATE)),
       CASE WHEN v.status = 'NOW_SHOWING' THEN DATEADD(DAY, v.end_offset, CAST(SYSUTCDATETIME() AS DATE)) END,
       YEAR(SYSUTCDATETIME()), v.production_company, v.director_display, v.original_language_code, v.status, v.is_featured
FROM (VALUES
    ('MRM-MOV-001', N'Đêm Trắng Ở Sài Gòn',      N'Đêm Trắng Ở Sài Gòn',      'dem-trang-o-sai-gon',      N'Một cảnh sát trẻ lần theo dấu một vụ mất tích tại khu phố cổ.', 112, -21, 24, N'Marumo Pictures',   N'Trần Nhật Quang', 'vi', 'NOW_SHOWING', 1),
    ('MRM-MOV-002', N'Mật Mã Sông Hồng',         N'Mật Mã Sông Hồng',         'mat-ma-song-hong',         N'Nhóm giải mã trẻ phát hiện bản đồ cổ dẫn đến kho báu sông Hồng.', 118, -14, 28, N'Sông Hồng Film',    N'Lê Hoàng Vũ',     'vi', 'NOW_SHOWING', 0),
    ('MRM-MOV-003', N'Hành Tinh Kín Gió',        N'The Windlocked Planet',    'hanh-tinh-kin-gio',        N'Đoàn thám hiểm tìm hơi thở cuối cùng trên hành tinh bão cát.',   131, -10, 35, N'Orbit Studio',      N'Daniel Reyes',    'en', 'NOW_SHOWING', 1),
    ('MRM-MOV-004', N'Nhóc Tí Và Rừng Ma Thuật', N'Pib And The Magic Forest', 'nhoc-ti-va-rung-ma-thuat', N'Cậu bé Pib lạc vào khu rừng chỉ mở cửa mỗi trăng tròn.',          96, -28, 21, N'Kaze Animation',    N'Ayaka Mori',      'ja', 'NOW_SHOWING', 0),
    ('MRM-MOV-005', N'Trà Sữa Và Mưa Tháng Sáu', N'Trà Sữa Và Mưa Tháng Sáu', 'tra-sua-va-mua-thang-sau', N'Hai người lạ trao đổi sai ly trà sữa trong một cơn mưa dài.',    104, -7,  30, N'Marumo Pictures',   N'Phan Thảo Nguyên', 'vi', 'NOW_SHOWING', 0),
    ('MRM-MOV-006', N'Vệ Sĩ Cuối Cùng',          N'The Last Bodyguard',       've-si-cuoi-cung',          N'Vệ sĩ về hưu nhận hợp đồng cuối cùng bảo vệ một người thừa kế.', 124, -18, 26, N'Hanul Film',        N'Park Ji-ho',      'ko', 'NOW_SHOWING', 0),
    ('MRM-MOV-007', N'Tài Xế Nửa Đêm',           N'Midnight Driver',          'tai-xe-nua-dem',           N'Tài xế đêm phát hiện hành khách nào lên xe cũng biến mất.',      108, -12, 22, N'Chao Phraya Films', N'Somchai Wittaya', 'th', 'NOW_SHOWING', 0),
    ('MRM-MOV-008', N'Vương Quốc Bão Tố',        N'Stormfall Kingdom',        'vuong-quoc-bao-to',        N'Vương quốc ven biển đối mặt cơn bão nghìn năm.',                 142, -30, 40, N'Orbit Studio',      N'Elena Kovacs',    'en', 'NOW_SHOWING', 0),
    ('MRM-MOV-009', N'Cơ Đoạn 47',               N'Platoon 47',               'co-doan-47',               N'Cơ đoàn cứu hộ đối mặt phiên giải cứu bất khả thi.',            115, -25, 33, N'Sông Hồng Film',    N'Nguyễn Bảo Lâm',  'vi', 'NOW_SHOWING', 0),
    ('MRM-MOV-010', N'Hài Kịch Chuyến Tàu',      N'Train Comedy Express',     'hai-kich-chuyen-tau',      N'Một toa tàu đầy những khách hàng khó tính và một bữa tiệc sai.', 99, -5,  25, N'Zhu Media',         N'Chen Wei',        'zh', 'NOW_SHOWING', 0),
    ('MRM-MOV-011', N'Vòng Xoáy Sài Gòn 2',      N'Vòng Xoáy Sài Gòn 2',      'vong-xoay-sai-gon-2',      N'Phần tiếp theo của chuỗi phim hành động ăn khách về giới xã hội.', 120, 14, NULL, N'Marumo Pictures', N'Trần Nhật Quang', 'vi', 'COMING_SOON', 0),
    ('MRM-MOV-012', N'Siêu Nhí Biển Xanh',       N'Ocean Kid',                'sieu-nhi-bien-xanh',       N'Cậu bé có khả năng nói chuyện với sinh vật biển.',               92, 21, NULL, N'Orbit Studio',      N'Maria Santos',    'en', 'COMING_SOON', 0),
    ('MRM-MOV-013', N'Kẻ Đứng Sau Cửa',          N'The One Behind The Door',  'ke-dung-sau-cua',          N'Một gia đình phát hiện có ai đó sống trong ngôi nhà của mình.',  105, 7,  NULL, N'Hanul Film',        N'Park Ji-ho',      'ko', 'COMING_SOON', 0),
    ('MRM-MOV-014', N'Mùa Hoa Trên Cao Nguyên',  N'Mùa Hoa Trên Cao Nguyên',  'mua-hoa-tren-cao-nguyen',  N'Câu chuyện tình yêu giữa hai mùa hoa cà phê.',                  110, 30, NULL, N'Tây Nguyên Films',  N'Hà Vũ Trọng',     'vi', 'COMING_SOON', 0),
    ('MRM-MOV-015', N'Không Gian Thứ Chín',      N'The Ninth Space',          'khong-gian-thu-chin',      N'Nhà khoa học mở được không gian song song thứ chín.',           138, 18, NULL, N'Orbit Studio',      N'Daniel Reyes',    'en', 'COMING_SOON', 0),
    ('MRM-MOV-016', N'Tiếng Nhạc Đường Phố',      N'Street Melody',            'tieng-nhac-duong-pho',     N'Bộ tứ nhạc sĩ đường phố tranh tài tại Bangkok.',               101, 25, NULL, N'Chao Phraya Films', N'Somchai Wittaya', 'th', 'COMING_SOON', 0),
    ('MRM-MOV-017', N'Thợ Sát Thủ Nghỉ Hưu',     N'The Retired Hitman',       'tho-sat-thu-nghi-huu',     N'Sát thủ già mở tiệm cắt tóc, quá khứ tìm đến.',                127, 10, NULL, N'Kaze Pictures',     N'Tanaka Ryo',      'ja', 'COMING_SOON', 0),
    ('MRM-MOV-018', N'Chuyến Tàu Giáng Sinh',    N'The Christmas Train',      'chuyen-tau-giang-sinh',    N'Đoàn tàu chở trẻ em đến vùng đất tuyết đầu tiên.',              94, 40, NULL, N'Zhu Media',         N'Chen Wei',        'zh', 'COMING_SOON', 0),
    ('MRM-MOV-019', N'Bí Mật Nhà Bên Hồ',        N'Secret Of The Lake House', 'bi-mat-nha-ben-ho',        N'Hai anh em khám phá ngôi nhà bên hồ của người chú mất tích.',  116, 12, NULL, N'Orbit Studio',      N'Elena Kovacs',    'en', 'COMING_SOON', 0),
    ('MRM-MOV-020', N'Vua Phổ Thông',            N'Vua Phổ Thông',            'vua-pho-thong',            N'Tiên phong hài về cuộc đời anh bán phở trở thành tỷ phú.',     98, 35, NULL, N'Sông Hồng Film',    N'Nguyễn Bảo Lâm',  'vi', 'COMING_SOON', 0)
) AS v(movie_code, title, original_title, slug, synopsis, duration_minutes, release_offset, end_offset, production_company, director_display, original_language_code, status, is_featured)
WHERE NOT EXISTS (SELECT 1 FROM dbo.movies m WHERE m.movie_code = v.movie_code);

INSERT INTO dbo.movie_genres (movie_id, genre_id, is_primary)
SELECT m.movie_id, g.genre_id, v.is_primary
FROM (VALUES
    ('MRM-MOV-001', 'DRAMA',    1), ('MRM-MOV-001', 'THRILLER', 0),
    ('MRM-MOV-002', 'ACTION',   1), ('MRM-MOV-002', 'DRAMA',    0),
    ('MRM-MOV-003', 'SCI_FI',   1), ('MRM-MOV-003', 'ACTION',   0),
    ('MRM-MOV-004', 'ANIMATION',1), ('MRM-MOV-004', 'COMEDY',   0),
    ('MRM-MOV-005', 'ROMANCE',  1), ('MRM-MOV-005', 'DRAMA',    0),
    ('MRM-MOV-006', 'ACTION',   1), ('MRM-MOV-006', 'THRILLER', 0),
    ('MRM-MOV-007', 'THRILLER', 1), ('MRM-MOV-007', 'HORROR',   0),
    ('MRM-MOV-008', 'SCI_FI',   1), ('MRM-MOV-008', 'DRAMA',    0),
    ('MRM-MOV-009', 'DRAMA',    1), ('MRM-MOV-009', 'ACTION',   0),
    ('MRM-MOV-010', 'COMEDY',   1), ('MRM-MOV-010', 'ROMANCE',  0),
    ('MRM-MOV-011', 'ACTION',   1), ('MRM-MOV-011', 'DRAMA',    0),
    ('MRM-MOV-012', 'ANIMATION',1), ('MRM-MOV-012', 'SCI_FI',   0),
    ('MRM-MOV-013', 'HORROR',   1), ('MRM-MOV-013', 'THRILLER', 0),
    ('MRM-MOV-014', 'DRAMA',    1), ('MRM-MOV-014', 'ROMANCE',  0),
    ('MRM-MOV-015', 'SCI_FI',   1), ('MRM-MOV-015', 'HORROR',   0),
    ('MRM-MOV-016', 'ROMANCE',  1), ('MRM-MOV-016', 'COMEDY',   0),
    ('MRM-MOV-017', 'ACTION',   1), ('MRM-MOV-017', 'THRILLER', 0),
    ('MRM-MOV-018', 'ANIMATION',1), ('MRM-MOV-018', 'ROMANCE',  0),
    ('MRM-MOV-019', 'THRILLER', 1), ('MRM-MOV-019', 'HORROR',   0),
    ('MRM-MOV-020', 'COMEDY',   1), ('MRM-MOV-020', 'DRAMA',    0)
) AS v(movie_code, genre_code, is_primary)
JOIN dbo.movies m ON m.movie_code = v.movie_code
JOIN dbo.genres g ON g.genre_code = v.genre_code
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.movie_genres e
    WHERE e.movie_id = m.movie_id AND e.genre_id = g.genre_id
);

INSERT INTO dbo.movie_content_ratings (movie_id, country_code, rating_system, rating_code, minimum_age, rating_description)
SELECT m.movie_id, 'VN', 'CUC_DIEN_ANH', v.rating_code, v.minimum_age, v.rating_description
FROM (VALUES
    ('MRM-MOV-001', 'T16', 16, N'Phim dành cho khán giả từ 16 tuổi trở lên'),
    ('MRM-MOV-002', 'T13', 13, N'Phim dành cho khán giả từ 13 tuổi trở lên'),
    ('MRM-MOV-003', 'T13', 13, N'Phim dành cho khán giả từ 13 tuổi trở lên'),
    ('MRM-MOV-004', 'K',   NULL, N'Phim phổ thông rộng rãi cho mọi khán giả'),
    ('MRM-MOV-005', 'K',   NULL, N'Phim phổ thông rộng rãi cho mọi khán giả'),
    ('MRM-MOV-006', 'T16', 16, N'Phim dành cho khán giả từ 16 tuổi trở lên'),
    ('MRM-MOV-007', 'T16', 16, N'Phim dành cho khán giả từ 16 tuổi trở lên'),
    ('MRM-MOV-008', 'T13', 13, N'Phim dành cho khán giả từ 13 tuổi trở lên'),
    ('MRM-MOV-009', 'T16', 16, N'Phim dành cho khán giả từ 16 tuổi trở lên'),
    ('MRM-MOV-010', 'K',   NULL, N'Phim phổ thông rộng rãi cho mọi khán giả'),
    ('MRM-MOV-011', 'T16', 16, N'Phim dành cho khán giả từ 16 tuổi trở lên'),
    ('MRM-MOV-012', 'K',   NULL, N'Phim phổ thông rộng rãi cho mọi khán giả'),
    ('MRM-MOV-013', 'T18', 18, N'Phim dành cho khán giả từ 18 tuổi trở lên'),
    ('MRM-MOV-014', 'K',   NULL, N'Phim phổ thông rộng rãi cho mọi khán giả'),
    ('MRM-MOV-015', 'T13', 13, N'Phim dành cho khán giả từ 13 tuổi trở lên'),
    ('MRM-MOV-016', 'K',   NULL, N'Phim phổ thông rộng rãi cho mọi khán giả'),
    ('MRM-MOV-017', 'T18', 18, N'Phim dành cho khán giả từ 18 tuổi trở lên'),
    ('MRM-MOV-018', 'K',   NULL, N'Phim phổ thông rộng rãi cho mọi khán giả'),
    ('MRM-MOV-019', 'T16', 16, N'Phim dành cho khán giả từ 16 tuổi trở lên'),
    ('MRM-MOV-020', 'K',   NULL, N'Phim phổ thông rộng rãi cho mọi khán giả')
) AS v(movie_code, rating_code, minimum_age, rating_description)
JOIN dbo.movies m ON m.movie_code = v.movie_code
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.movie_content_ratings e
    WHERE e.movie_id = m.movie_id AND e.country_code = 'VN' AND e.rating_system = 'CUC_DIEN_ANH'
);

INSERT INTO dbo.movie_versions (movie_id, version_code, version_name, audio_language_id, subtitle_language_id, format_id, is_original_audio)
SELECT m.movie_id, 'V2D',
       CASE WHEN m.original_language_code = 'vi' THEN N'2D Tiếng Việt' ELSE N'2D Phụ đề tiếng Việt' END,
       al.language_id,
       CASE WHEN m.original_language_code = 'vi' THEN NULL ELSE (SELECT language_id FROM dbo.languages WHERE language_code = 'vi') END,
       f.format_id, 1
FROM dbo.movies m
JOIN dbo.languages al ON al.language_code = m.original_language_code
JOIN dbo.screening_formats f ON f.format_code = 'TWO_D'
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.movie_versions e
    WHERE e.movie_id = m.movie_id AND e.version_code = 'V2D'
);

IF OBJECT_ID('tempdb..#seats_generated') IS NOT NULL DROP TABLE #seats_generated;

WITH number_rows AS (
    SELECT v.row_label, v.row_position
    FROM (VALUES (N'A',0),(N'B',1),(N'C',2),(N'D',3),(N'E',4),(N'F',5),(N'G',6),(N'H',7)) AS v(row_label, row_position)
),
number_seats AS (
    SELECT v.seat_number FROM (VALUES (1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),(12)) AS v(seat_number)
)
SELECT a.auditorium_id, nr.row_label, ns.seat_number,
       CONCAT(nr.row_label, RIGHT('0' + CAST(ns.seat_number AS VARCHAR(2)), 2)) AS seat_code,
       CASE WHEN nr.row_position = 7 THEN 'PREMIUM' ELSE 'STANDARD' END AS seat_type_code,
       nr.row_position
INTO #seats_generated
FROM dbo.auditoriums a
CROSS JOIN number_rows nr
CROSS JOIN number_seats ns
WHERE a.auditorium_code LIKE 'R%';

INSERT INTO dbo.seats (auditorium_id, seat_type_id, seat_code, row_label, seat_number, seat_status)
SELECT sg.auditorium_id, st.seat_type_id, sg.seat_code, sg.row_label, sg.seat_number, 'ACTIVE'
FROM #seats_generated sg
JOIN dbo.seat_types st ON st.type_code = sg.seat_type_code
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.seats e
    WHERE e.auditorium_id = sg.auditorium_id AND e.row_label = sg.row_label AND e.seat_number = sg.seat_number
);

INSERT INTO dbo.seat_layout_versions (layout_id, auditorium_id, version_number, version_name, version_status, total_seats, effective_from, published_at, created_by)
SELECT l.layout_id, l.auditorium_id, 1, N'Phiên bản khởi tạo', 'PUBLISHED',
       (SELECT COUNT(*) FROM dbo.seats s WHERE s.auditorium_id = l.auditorium_id),
       SYSUTCDATETIME(), SYSUTCDATETIME(), @adminId
FROM dbo.seat_layouts l
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.seat_layout_versions e
    WHERE e.layout_id = l.layout_id AND e.version_number = 1
);

INSERT INTO dbo.seat_layout_version_seats (layout_version_id, seat_id, auditorium_id, row_position, column_position, x_position, y_position, is_enabled)
SELECT lv.layout_version_id, s.seat_id, s.auditorium_id, sg.row_position, sg.seat_number - 1,
       CAST((sg.seat_number - 1) * 40 AS DECIMAL(10,2)), CAST(sg.row_position * 36 AS DECIMAL(10,2)), 1
FROM dbo.seats s
JOIN #seats_generated sg ON sg.auditorium_id = s.auditorium_id AND sg.seat_code = s.seat_code
JOIN dbo.seat_layout_versions lv ON lv.auditorium_id = s.auditorium_id AND lv.version_number = 1
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.seat_layout_version_seats e
    WHERE e.layout_version_id = lv.layout_version_id AND e.seat_id = s.seat_id
);

IF OBJECT_ID('tempdb..#showtime_plan') IS NOT NULL DROP TABLE #showtime_plan;

SELECT
    CONCAT('MRM-ST-', REPLACE(b.branch_code, 'MRM-', ''), '-', a.auditorium_code, '-D', sl.day_index, '-S', sl.slot_index) AS showtime_code,
    b.branch_id,
    a.auditorium_id,
    rt.type_code AS room_type_code,
    ranked.movie_version_id,
    DATEADD(MINUTE, sl.day_index * 1440 + sl.minute_of_day, CAST(CAST(SYSUTCDATETIME() AS DATE) AS DATETIME2(0))) AS start_at,
    CASE rt.type_code
        WHEN 'IMAX' THEN CAST(130000 AS DECIMAL(12,2))
        WHEN 'VIP'  THEN CAST(100000 AS DECIMAL(12,2))
        ELSE CAST(75000 AS DECIMAL(12,2))
    END AS base_ticket_price
INTO #showtime_plan
FROM dbo.auditoriums a
JOIN dbo.branches b ON b.branch_id = a.branch_id AND b.branch_code LIKE 'MRM-%'
JOIN dbo.room_types rt ON rt.room_type_id = a.room_type_id
CROSS JOIN (VALUES (0,1,555),(0,2,780),(0,3,1005),(0,4,1230),(1,1,555),(1,2,780),(1,3,1005),(1,4,1230),(2,1,555),(2,2,780),(2,3,1005),(2,4,1230)) AS sl(day_index, slot_index, minute_of_day)
JOIN (
    SELECT mv.movie_version_id, ROW_NUMBER() OVER (ORDER BY m.movie_code) AS rn
    FROM dbo.movie_versions mv
    JOIN dbo.movies m ON m.movie_id = mv.movie_id
    WHERE m.status = 'NOW_SHOWING' AND mv.is_active = 1
) AS ranked ON (a.auditorium_id * 12 + sl.day_index * 4 + sl.slot_index) % 10 + 1 = ranked.rn
WHERE a.auditorium_code LIKE 'R%';

DECLARE @sc VARCHAR(40), @bid BIGINT, @aid BIGINT, @mvid BIGINT, @st DATETIME2(0), @en DATETIME2(0), @price DECIMAL(12,2), @dur SMALLINT, @newSid BIGINT, @salesOpen DATETIME2(0), @salesClose DATETIME2(0);
DECLARE plan_cursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT p.showtime_code, p.branch_id, p.auditorium_id, p.movie_version_id, p.start_at, p.base_ticket_price
    FROM #showtime_plan p
    WHERE NOT EXISTS (SELECT 1 FROM dbo.showtimes s WHERE s.showtime_code = p.showtime_code)
    ORDER BY p.start_at, p.auditorium_id;
OPEN plan_cursor;
FETCH NEXT FROM plan_cursor INTO @sc, @bid, @aid, @mvid, @st, @price;
WHILE @@FETCH_STATUS = 0
BEGIN
    SELECT @dur = m.duration_minutes
    FROM dbo.movie_versions mv JOIN dbo.movies m ON m.movie_id = mv.movie_id
    WHERE mv.movie_version_id = @mvid;
    SET @en = DATEADD(MINUTE, @dur + 10, @st);
    SET @salesOpen = DATEADD(DAY, -3, @st);
    SET @salesClose = DATEADD(MINUTE, -15, @st);
    EXEC dbo.usp_showtime_create
        @showtime_code = @sc,
        @branch_id = @bid,
        @auditorium_id = @aid,
        @movie_version_id = @mvid,
        @status_code = 'OPEN_FOR_BOOKING',
        @start_at = @st,
        @end_at = @en,
        @base_ticket_price = @price,
        @sales_open_at = @salesOpen,
        @sales_close_at = @salesClose,
        @created_by_user_id = @adminId,
        @showtime_id = @newSid OUTPUT;
    FETCH NEXT FROM plan_cursor INTO @sc, @bid, @aid, @mvid, @st, @price;
END
CLOSE plan_cursor;
DEALLOCATE plan_cursor;

INSERT INTO dbo.showtime_seats (auditorium_id, showtime_id, seat_id, seat_status, base_price, final_price)
SELECT st.auditorium_id, st.showtime_id, s.seat_id, 'AVAILABLE',
       st.base_ticket_price + CASE WHEN stp.type_code = 'PREMIUM' THEN 25000 ELSE 0 END,
       st.base_ticket_price + CASE WHEN stp.type_code = 'PREMIUM' THEN 25000 ELSE 0 END
FROM dbo.showtimes st
JOIN dbo.seats s ON s.auditorium_id = st.auditorium_id
JOIN dbo.seat_types stp ON stp.seat_type_id = s.seat_type_id
WHERE st.showtime_code LIKE 'MRM-ST-%'
  AND NOT EXISTS (
      SELECT 1 FROM dbo.showtime_seats ss
      WHERE ss.showtime_id = st.showtime_id AND ss.seat_id = s.seat_id
  );
GO
