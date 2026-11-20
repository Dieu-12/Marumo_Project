/* =====================================================================
   MARUMO - CƠ SỞ DỮ LIỆU HỆ THỐNG RẠP CHIẾU PHIM
   Nhóm A: tài khoản & phân quyền
   Hồ sơ người dùng, địa chỉ, phiên đăng nhập & bảo mật tài khoản
   Địa chỉ hành chính: hiện hành + lịch sử + alias tìm kiếm
   Nhóm B: chi nhánh, địa chỉ rạp, lịch hoạt động & tiện ích
   Nhóm C: phòng chiếu, ghế & thiết bị

   Quyết định đã chốt:
   - users.status chỉ PENDING / ACTIVE / DISABLED; khóa tạm = locked_until
   - user_branch_assignments.status chỉ ACTIVE / SUSPENDED / REVOKED;
     hết hạn suy ra từ ends_at, ứng dụng đóng phân công khi hết hạn
   - administrative_units.is_current là cột computed từ valid_to
   - Mọi khóa ngoại NO ACTION (tránh multiple cascade paths);
     ngừng sử dụng bằng cờ trạng thái, không xóa cứng
   - created_at / updated_at lưu UTC; updated_at do ứng dụng cập nhật
   ===================================================================== */

-- sqlcmd -i mặc định QUOTED_IDENTIFIER OFF; bật tường minh để computed column
-- và filtered index hoạt động trên mọi công cụ
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF DB_ID(N'MarumoDB') IS NULL
    CREATE DATABASE MarumoDB COLLATE Vietnamese_CI_AS;
GO
USE MarumoDB;
GO

/* ---------------------------------------------------------------------
   NHÓM A - TÀI KHOẢN & PHÂN QUYỀN
   --------------------------------------------------------------------- */

/* A01. users */
CREATE TABLE dbo.users (
    user_id             BIGINT IDENTITY(1,1) NOT NULL,
    email               NVARCHAR(255)        NOT NULL,
    password_hash       NVARCHAR(255)        NOT NULL,
    full_name           NVARCHAR(150)        NOT NULL,
    phone               VARCHAR(20)          NULL,
    avatar_url          NVARCHAR(500)        NULL,
    status              VARCHAR(20)          NOT NULL CONSTRAINT DF_users_status DEFAULT 'PENDING',
    email_verified_at   DATETIME2(0)         NULL,
    failed_login_count  INT                  NOT NULL CONSTRAINT DF_users_failed_login_count DEFAULT 0,
    locked_until        DATETIME2(0)         NULL,
    last_login_at       DATETIME2(0)         NULL,
    password_changed_at DATETIME2(0)         NULL,
    created_at          DATETIME2(0)         NOT NULL CONSTRAINT DF_users_created_at DEFAULT SYSUTCDATETIME(),
    updated_at          DATETIME2(0)         NOT NULL CONSTRAINT DF_users_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_users PRIMARY KEY (user_id),
    CONSTRAINT UQ_users_email UNIQUE (email),
    CONSTRAINT CK_users_status CHECK (status IN ('PENDING','ACTIVE','DISABLED')),
    CONSTRAINT CK_users_failed_login_count CHECK (failed_login_count >= 0)
);
GO

/* A02. roles */
CREATE TABLE dbo.roles (
    role_id     INT IDENTITY(1,1) NOT NULL,
    role_code   VARCHAR(30)       NOT NULL,
    role_name   NVARCHAR(100)     NOT NULL,
    scope_type  VARCHAR(20)       NOT NULL,
    description NVARCHAR(500)     NULL,
    is_system   BIT               NOT NULL CONSTRAINT DF_roles_is_system DEFAULT 1,
    is_active   BIT               NOT NULL CONSTRAINT DF_roles_is_active DEFAULT 1,
    created_at  DATETIME2(0)      NOT NULL CONSTRAINT DF_roles_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_roles PRIMARY KEY (role_id),
    CONSTRAINT UQ_roles_role_code UNIQUE (role_code),
    CONSTRAINT CK_roles_scope_type CHECK (scope_type IN ('GLOBAL','BRANCH'))
);
GO

/* A03. permissions */
CREATE TABLE dbo.permissions (
    permission_id   INT IDENTITY(1,1) NOT NULL,
    permission_code VARCHAR(100)      NOT NULL,
    permission_name NVARCHAR(150)     NOT NULL,
    resource        VARCHAR(50)       NOT NULL,
    action          VARCHAR(30)       NOT NULL,
    description     NVARCHAR(500)     NULL,
    created_at      DATETIME2(0)      NOT NULL CONSTRAINT DF_permissions_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_permissions PRIMARY KEY (permission_id),
    CONSTRAINT UQ_permissions_permission_code UNIQUE (permission_code),
    CONSTRAINT UQ_permissions_resource_action UNIQUE (resource, action)
);
GO

/* A04. role_permissions */
CREATE TABLE dbo.role_permissions (
    role_id       INT NOT NULL,
    permission_id INT NOT NULL,
    CONSTRAINT PK_role_permissions PRIMARY KEY (role_id, permission_id),
    CONSTRAINT FK_role_permissions_roles FOREIGN KEY (role_id) REFERENCES dbo.roles (role_id),
    CONSTRAINT FK_role_permissions_permissions FOREIGN KEY (permission_id) REFERENCES dbo.permissions (permission_id)
);
GO
CREATE INDEX IX_role_permissions_permission_id ON dbo.role_permissions (permission_id);
GO

/* ---------------------------------------------------------------------
   ĐỊA CHỈ HÀNH CHÍNH
   Mô hình 2 cấp từ 01/07/2025 (bỏ cấp quận/huyện); bảng lưu cả đơn vị
   lịch sử để hỗ trợ tìm kiếm theo tên cũ ("Quận 1", "Q1", "Bến Nghé"...)
   --------------------------------------------------------------------- */

CREATE TABLE dbo.administrative_units (
    unit_id        BIGINT IDENTITY(1,1) NOT NULL,
    unit_code      NVARCHAR(30)         NULL,
    unit_name      NVARCHAR(150)        NOT NULL,
    unit_type      VARCHAR(30)          NOT NULL,
    parent_unit_id BIGINT               NULL,
    valid_from     DATE                 NOT NULL,
    valid_to       DATE                 NULL,
    is_current     AS (CAST(CASE WHEN valid_to IS NULL THEN 1 ELSE 0 END AS BIT)) PERSISTED,
    created_at     DATETIME2(0)         NOT NULL CONSTRAINT DF_administrative_units_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_administrative_units PRIMARY KEY (unit_id),
    CONSTRAINT FK_administrative_units_parent FOREIGN KEY (parent_unit_id) REFERENCES dbo.administrative_units (unit_id),
    CONSTRAINT CK_administrative_units_unit_type CHECK (unit_type IN ('PROVINCE','WARD','COMMUNE','SPECIAL_ZONE','DISTRICT')),
    CONSTRAINT CK_administrative_units_validity CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
GO
CREATE UNIQUE INDEX UX_administrative_units_unit_code ON dbo.administrative_units (unit_code) WHERE unit_code IS NOT NULL;
GO
CREATE INDEX IX_administrative_units_parent_unit_id ON dbo.administrative_units (parent_unit_id);
GO

/* Quan hệ sáp nhập N-N giữa đơn vị cũ và mới, hỗ trợ nhiều đợt sáp nhập */
CREATE TABLE dbo.administrative_unit_mergers (
    merger_id      BIGINT IDENTITY(1,1) NOT NULL,
    old_unit_id    BIGINT               NOT NULL,
    new_unit_id    BIGINT               NOT NULL,
    effective_date DATE                 NOT NULL,
    relation_type  VARCHAR(30)          NOT NULL,
    CONSTRAINT PK_administrative_unit_mergers PRIMARY KEY (merger_id),
    CONSTRAINT UQ_administrative_unit_mergers UNIQUE (old_unit_id, new_unit_id, effective_date),
    CONSTRAINT CK_administrative_unit_mergers_relation_type CHECK (relation_type IN ('FULL','PARTIAL')),
    CONSTRAINT CK_administrative_unit_mergers_no_self CHECK (old_unit_id <> new_unit_id),
    CONSTRAINT FK_administrative_unit_mergers_old FOREIGN KEY (old_unit_id) REFERENCES dbo.administrative_units (unit_id),
    CONSTRAINT FK_administrative_unit_mergers_new FOREIGN KEY (new_unit_id) REFERENCES dbo.administrative_units (unit_id)
);
GO

/* Alias tìm kiếm: "Quận 1", "Q1"... -> đơn vị (thường là đơn vị lịch sử) */
CREATE TABLE dbo.location_search_aliases (
    alias_id        BIGINT IDENTITY(1,1) NOT NULL,
    unit_id         BIGINT               NOT NULL,
    alias_name      NVARCHAR(200)        NOT NULL,
    normalized_name NVARCHAR(200)        NOT NULL,
    alias_type      VARCHAR(30)          NOT NULL,
    is_active       BIT                  NOT NULL CONSTRAINT DF_location_search_aliases_is_active DEFAULT 1,
    CONSTRAINT PK_location_search_aliases PRIMARY KEY (alias_id),
    CONSTRAINT UQ_location_search_aliases_unit_alias UNIQUE (unit_id, normalized_name),
    CONSTRAINT CK_location_search_aliases_alias_type CHECK (alias_type IN ('OLD_NAME','ABBREVIATION','COMMON_NAME','SEARCH_KEYWORD')),
    CONSTRAINT FK_location_search_aliases_units FOREIGN KEY (unit_id) REFERENCES dbo.administrative_units (unit_id)
);
GO
CREATE INDEX IX_location_search_aliases_normalized_name ON dbo.location_search_aliases (normalized_name);
GO

/* A05. branches - dùng chung với nhóm B; địa chỉ tách sang branch_addresses */
CREATE TABLE dbo.branches (
    branch_id     BIGINT IDENTITY(1,1) NOT NULL,
    branch_code   VARCHAR(20)          NOT NULL,
    branch_name   NVARCHAR(150)        NOT NULL,
    phone         VARCHAR(20)          NULL,
    email         NVARCHAR(255)        NULL,
    description   NVARCHAR(1000)       NULL,
    status        VARCHAR(20)          NOT NULL,
    opened_at     DATETIME2(0)         NULL,
    created_at    DATETIME2(0)         NOT NULL CONSTRAINT DF_branches_created_at DEFAULT SYSUTCDATETIME(),
    updated_at    DATETIME2(0)         NOT NULL CONSTRAINT DF_branches_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_branches PRIMARY KEY (branch_id),
    CONSTRAINT UQ_branches_branch_code UNIQUE (branch_code),
    CONSTRAINT CK_branches_status CHECK (status IN ('ACTIVE','INACTIVE','CLOSED'))
);
GO

/* B05. branch_addresses - địa chỉ rạp, tọa độ, địa chỉ chính; giữ row cũ khi đổi địa chỉ */
CREATE TABLE dbo.branch_addresses (
    address_id     BIGINT IDENTITY(1,1) NOT NULL,
    branch_id      BIGINT               NOT NULL,
    ward_unit_id   BIGINT               NOT NULL,
    street_address NVARCHAR(300)        NOT NULL,
    address_detail NVARCHAR(300)        NULL,
    latitude       DECIMAL(10,7)        NULL,
    longitude      DECIMAL(10,7)        NULL,
    is_primary     BIT                  NOT NULL CONSTRAINT DF_branch_addresses_is_primary DEFAULT 0,
    created_at     DATETIME2(0)         NOT NULL CONSTRAINT DF_branch_addresses_created_at DEFAULT SYSUTCDATETIME(),
    updated_at     DATETIME2(0)         NOT NULL CONSTRAINT DF_branch_addresses_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_branch_addresses PRIMARY KEY (address_id),
    CONSTRAINT CK_branch_addresses_latitude CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    CONSTRAINT CK_branch_addresses_longitude CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
    CONSTRAINT CK_branch_addresses_geo_pair CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL)),
    CONSTRAINT FK_branch_addresses_branches FOREIGN KEY (branch_id) REFERENCES dbo.branches (branch_id),
    CONSTRAINT FK_branch_addresses_ward FOREIGN KEY (ward_unit_id) REFERENCES dbo.administrative_units (unit_id)
);
GO
CREATE INDEX IX_branch_addresses_branch_id ON dbo.branch_addresses (branch_id);
GO
CREATE INDEX IX_branch_addresses_ward_unit_id ON dbo.branch_addresses (ward_unit_id);
GO
CREATE UNIQUE INDEX UX_branch_addresses_one_primary ON dbo.branch_addresses (branch_id) WHERE is_primary = 1;
GO

/* ---------------------------------------------------------------------
   NHÓM B - LỊCH HOẠT ĐỘNG & TIỆN ÍCH CHI NHÁNH
   --------------------------------------------------------------------- */

/* B06. branch_operating_hours - lịch thường lệ theo ngày trong tuần (1 = Thứ 2) */
CREATE TABLE dbo.branch_operating_hours (
    operating_hour_id BIGINT IDENTITY(1,1) NOT NULL,
    branch_id         BIGINT               NOT NULL,
    day_of_week       TINYINT              NOT NULL,
    open_time         TIME(0)              NULL,
    close_time        TIME(0)              NULL,
    is_closed         BIT                  NOT NULL CONSTRAINT DF_branch_operating_hours_is_closed DEFAULT 0,
    effective_from    DATE                 NOT NULL,
    effective_to      DATE                 NULL,
    created_at        DATETIME2(0)         NOT NULL CONSTRAINT DF_branch_operating_hours_created_at DEFAULT SYSUTCDATETIME(),
    updated_at        DATETIME2(0)         NOT NULL CONSTRAINT DF_branch_operating_hours_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_branch_operating_hours PRIMARY KEY (operating_hour_id),
    CONSTRAINT CK_branch_operating_hours_day_of_week CHECK (day_of_week BETWEEN 1 AND 7),
    CONSTRAINT CK_branch_operating_hours_effective CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT CK_branch_operating_hours_times CHECK ((is_closed = 1 AND open_time IS NULL AND close_time IS NULL) OR (is_closed = 0 AND open_time IS NOT NULL AND close_time IS NOT NULL)),
    CONSTRAINT CK_branch_operating_hours_time_order CHECK (is_closed = 1 OR close_time <> open_time),
    CONSTRAINT FK_branch_operating_hours_branches FOREIGN KEY (branch_id) REFERENCES dbo.branches (branch_id)
);
GO
CREATE UNIQUE INDEX UX_branch_operating_hours_current ON dbo.branch_operating_hours (branch_id, day_of_week) WHERE effective_to IS NULL;
GO

/* B07. branch_special_hours - lịch ngoại lệ theo ngày cụ thể (Tết, lễ, bảo trì) */
CREATE TABLE dbo.branch_special_hours (
    special_hour_id BIGINT IDENTITY(1,1) NOT NULL,
    branch_id       BIGINT               NOT NULL,
    special_date    DATE                 NOT NULL,
    special_name    NVARCHAR(150)        NULL,
    open_time       TIME(0)              NULL,
    close_time      TIME(0)              NULL,
    is_closed       BIT                  NOT NULL CONSTRAINT DF_branch_special_hours_is_closed DEFAULT 0,
    reason          NVARCHAR(500)        NULL,
    created_at      DATETIME2(0)         NOT NULL CONSTRAINT DF_branch_special_hours_created_at DEFAULT SYSUTCDATETIME(),
    updated_at      DATETIME2(0)         NOT NULL CONSTRAINT DF_branch_special_hours_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_branch_special_hours PRIMARY KEY (special_hour_id),
    CONSTRAINT UQ_branch_special_hours_branch_date UNIQUE (branch_id, special_date),
    CONSTRAINT CK_branch_special_hours_times CHECK ((is_closed = 1 AND open_time IS NULL AND close_time IS NULL) OR (is_closed = 0 AND open_time IS NOT NULL AND close_time IS NOT NULL)),
    CONSTRAINT FK_branch_special_hours_branches FOREIGN KEY (branch_id) REFERENCES dbo.branches (branch_id)
);
GO

/* B08. branch_facilities - danh mục tiện ích dùng chung toàn hệ thống */
CREATE TABLE dbo.branch_facilities (
    facility_id   INT IDENTITY(1,1) NOT NULL,
    facility_code VARCHAR(50)       NOT NULL,
    facility_name NVARCHAR(100)     NOT NULL,
    description   NVARCHAR(500)     NULL,
    icon_name     VARCHAR(50)       NULL,
    is_active     BIT               NOT NULL CONSTRAINT DF_branch_facilities_is_active DEFAULT 1,
    display_order INT               NOT NULL CONSTRAINT DF_branch_facilities_display_order DEFAULT 0,
    created_at    DATETIME2(0)      NOT NULL CONSTRAINT DF_branch_facilities_created_at DEFAULT SYSUTCDATETIME(),
    updated_at    DATETIME2(0)      NOT NULL CONSTRAINT DF_branch_facilities_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_branch_facilities PRIMARY KEY (facility_id),
    CONSTRAINT UQ_branch_facilities_facility_code UNIQUE (facility_code),
    CONSTRAINT CK_branch_facilities_display_order CHECK (display_order >= 0)
);
GO
CREATE INDEX IX_branch_facilities_active_order ON dbo.branch_facilities (is_active, display_order);
GO

/* B09. branch_facility_assignments - rạp nào có tiện ích nào (không có row = không có tiện ích) */
CREATE TABLE dbo.branch_facility_assignments (
    branch_id       BIGINT        NOT NULL,
    facility_id     INT           NOT NULL,
    facility_status VARCHAR(20)   NOT NULL,
    description     NVARCHAR(300) NULL,
    created_at      DATETIME2(0)  NOT NULL CONSTRAINT DF_branch_facility_assignments_created_at DEFAULT SYSUTCDATETIME(),
    updated_at      DATETIME2(0)  NOT NULL CONSTRAINT DF_branch_facility_assignments_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_branch_facility_assignments PRIMARY KEY (branch_id, facility_id),
    CONSTRAINT CK_branch_facility_assignments_status CHECK (facility_status IN ('AVAILABLE','UNAVAILABLE','MAINTENANCE')),
    CONSTRAINT FK_branch_facility_assignments_branches FOREIGN KEY (branch_id) REFERENCES dbo.branches (branch_id),
    CONSTRAINT FK_branch_facility_assignments_facilities FOREIGN KEY (facility_id) REFERENCES dbo.branch_facilities (facility_id)
);
GO
CREATE INDEX IX_branch_facility_assignments_facility_id ON dbo.branch_facility_assignments (facility_id);
GO

/* B10. branch_media - ảnh/video giới thiệu chi nhánh, lưu URL + metadata (file ở storage/CDN) */
CREATE TABLE dbo.branch_media (
    media_id      BIGINT IDENTITY(1,1) NOT NULL,
    branch_id     BIGINT               NOT NULL,
    media_type    VARCHAR(20)          NOT NULL,
    media_url     NVARCHAR(1000)       NOT NULL,
    thumbnail_url NVARCHAR(1000)       NULL,
    title         NVARCHAR(150)        NULL,
    alt_text      NVARCHAR(250)        NULL,
    display_order INT                  NOT NULL CONSTRAINT DF_branch_media_display_order DEFAULT 0,
    is_featured   BIT                  NOT NULL CONSTRAINT DF_branch_media_is_featured DEFAULT 0,
    is_active     BIT                  NOT NULL CONSTRAINT DF_branch_media_is_active DEFAULT 1,
    created_at    DATETIME2(0)         NOT NULL CONSTRAINT DF_branch_media_created_at DEFAULT SYSUTCDATETIME(),
    updated_at    DATETIME2(0)         NOT NULL CONSTRAINT DF_branch_media_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_branch_media PRIMARY KEY (media_id),
    CONSTRAINT CK_branch_media_type CHECK (media_type IN ('IMAGE','VIDEO')),
    CONSTRAINT CK_branch_media_display_order CHECK (display_order >= 0),
    CONSTRAINT CK_branch_media_featured_active CHECK (is_featured = 0 OR is_active = 1),
    CONSTRAINT FK_branch_media_branches FOREIGN KEY (branch_id) REFERENCES dbo.branches (branch_id)
);
GO
CREATE INDEX IX_branch_media_branch_active_order ON dbo.branch_media (branch_id, is_active, display_order);
GO
CREATE UNIQUE INDEX UX_branch_media_one_featured ON dbo.branch_media (branch_id) WHERE is_featured = 1;
GO

/* A06. user_roles - chỉ gán vai trò có scope_type = GLOBAL, kiểm tra ở tầng nghiệp vụ */
CREATE TABLE dbo.user_roles (
    user_role_id BIGINT IDENTITY(1,1) NOT NULL,
    user_id      BIGINT               NOT NULL,
    role_id      INT                  NOT NULL,
    assigned_by  BIGINT               NULL,
    assigned_at  DATETIME2(0)         NOT NULL CONSTRAINT DF_user_roles_assigned_at DEFAULT SYSUTCDATETIME(),
    revoked_at   DATETIME2(0)         NULL,
    CONSTRAINT PK_user_roles PRIMARY KEY (user_role_id),
    CONSTRAINT CK_user_roles_revoked CHECK (revoked_at IS NULL OR revoked_at >= assigned_at),
    CONSTRAINT FK_user_roles_users FOREIGN KEY (user_id) REFERENCES dbo.users (user_id),
    CONSTRAINT FK_user_roles_roles FOREIGN KEY (role_id) REFERENCES dbo.roles (role_id),
    CONSTRAINT FK_user_roles_assigned_by FOREIGN KEY (assigned_by) REFERENCES dbo.users (user_id)
);
GO
CREATE UNIQUE INDEX UX_user_roles_user_role_active ON dbo.user_roles (user_id, role_id) WHERE revoked_at IS NULL;
GO

/* A07. user_branch_assignments - vai trò BRANCH theo chi nhánh */
CREATE TABLE dbo.user_branch_assignments (
    assignment_id BIGINT IDENTITY(1,1) NOT NULL,
    user_id       BIGINT               NOT NULL,
    branch_id     BIGINT               NOT NULL,
    role_id       INT                  NOT NULL,
    assigned_by   BIGINT               NULL,
    assigned_at   DATETIME2(0)         NOT NULL CONSTRAINT DF_user_branch_assignments_assigned_at DEFAULT SYSUTCDATETIME(),
    starts_at     DATETIME2(0)         NOT NULL,
    ends_at       DATETIME2(0)         NULL,
    status        VARCHAR(20)          NOT NULL,
    CONSTRAINT PK_user_branch_assignments PRIMARY KEY (assignment_id),
    CONSTRAINT CK_user_branch_assignments_status CHECK (status IN ('ACTIVE','SUSPENDED','REVOKED')),
    CONSTRAINT CK_user_branch_assignments_period CHECK (ends_at IS NULL OR ends_at > starts_at),
    CONSTRAINT FK_user_branch_assignments_users FOREIGN KEY (user_id) REFERENCES dbo.users (user_id),
    CONSTRAINT FK_user_branch_assignments_branches FOREIGN KEY (branch_id) REFERENCES dbo.branches (branch_id),
    CONSTRAINT FK_user_branch_assignments_roles FOREIGN KEY (role_id) REFERENCES dbo.roles (role_id),
    CONSTRAINT FK_user_branch_assignments_assigned_by FOREIGN KEY (assigned_by) REFERENCES dbo.users (user_id)
);
GO
CREATE UNIQUE INDEX UX_user_branch_assignments_user_branch_active ON dbo.user_branch_assignments (user_id, branch_id) WHERE status = 'ACTIVE';
GO
CREATE INDEX IX_user_branch_assignments_branch_id ON dbo.user_branch_assignments (branch_id, status);
GO

/* ---------------------------------------------------------------------
   NHÓM C - PHÒNG CHIẾU, GHẾ & THIẾT BỊ
   --------------------------------------------------------------------- */

/* C01. room_types - danh mục loại phòng chiếu */
CREATE TABLE dbo.room_types (
    room_type_id  INT IDENTITY(1,1) NOT NULL,
    type_code     VARCHAR(30)       NOT NULL,
    type_name     NVARCHAR(100)     NOT NULL,
    description   NVARCHAR(500)     NULL,
    is_active     BIT               NOT NULL CONSTRAINT DF_room_types_is_active DEFAULT 1,
    display_order INT               NOT NULL CONSTRAINT DF_room_types_display_order DEFAULT 0,
    created_at    DATETIME2(0)      NOT NULL CONSTRAINT DF_room_types_created_at DEFAULT SYSUTCDATETIME(),
    updated_at    DATETIME2(0)      NOT NULL CONSTRAINT DF_room_types_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_room_types PRIMARY KEY (room_type_id),
    CONSTRAINT UQ_room_types_type_code UNIQUE (type_code),
    CONSTRAINT CK_room_types_display_order CHECK (display_order >= 0)
);
GO

/* C02. auditoriums - phòng chiếu thực tế; sức chứa lấy từ version PUBLISHED của sơ đồ ghế */
CREATE TABLE dbo.auditoriums (
    auditorium_id   BIGINT IDENTITY(1,1) NOT NULL,
    branch_id       BIGINT               NOT NULL,
    room_type_id    INT                  NOT NULL,
    auditorium_code VARCHAR(30)          NOT NULL,
    auditorium_name NVARCHAR(100)        NOT NULL,
    description     NVARCHAR(500)        NULL,
    screen_width    DECIMAL(8,2)         NULL,
    screen_height   DECIMAL(8,2)         NULL,
    is_active       BIT                  NOT NULL CONSTRAINT DF_auditoriums_is_active DEFAULT 1,
    created_at      DATETIME2(0)         NOT NULL CONSTRAINT DF_auditoriums_created_at DEFAULT SYSUTCDATETIME(),
    updated_at      DATETIME2(0)         NOT NULL CONSTRAINT DF_auditoriums_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_auditoriums PRIMARY KEY (auditorium_id),
    CONSTRAINT UQ_auditoriums_branch_code UNIQUE (branch_id, auditorium_code),
    CONSTRAINT CK_auditoriums_screen_width CHECK (screen_width IS NULL OR screen_width > 0),
    CONSTRAINT CK_auditoriums_screen_height CHECK (screen_height IS NULL OR screen_height > 0),
    CONSTRAINT FK_auditoriums_branches FOREIGN KEY (branch_id) REFERENCES dbo.branches (branch_id),
    CONSTRAINT FK_auditoriums_room_types FOREIGN KEY (room_type_id) REFERENCES dbo.room_types (room_type_id)
);
GO
CREATE INDEX IX_auditoriums_room_type_id ON dbo.auditoriums (room_type_id);
GO

/* C03. seat_types - danh mục loại ghế; seat_unit_count = số vị trí ngồi chiếm chỗ (ghế đôi = 2) */
CREATE TABLE dbo.seat_types (
    seat_type_id    INT IDENTITY(1,1) NOT NULL,
    type_code       VARCHAR(30)       NOT NULL,
    type_name       NVARCHAR(100)     NOT NULL,
    description     NVARCHAR(500)     NULL,
    seat_unit_count TINYINT           NOT NULL,
    is_active       BIT               NOT NULL CONSTRAINT DF_seat_types_is_active DEFAULT 1,
    display_order   INT               NOT NULL CONSTRAINT DF_seat_types_display_order DEFAULT 0,
    created_at      DATETIME2(0)      NOT NULL CONSTRAINT DF_seat_types_created_at DEFAULT SYSUTCDATETIME(),
    updated_at      DATETIME2(0)      NOT NULL CONSTRAINT DF_seat_types_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_seat_types PRIMARY KEY (seat_type_id),
    CONSTRAINT UQ_seat_types_type_code UNIQUE (type_code),
    CONSTRAINT CK_seat_types_seat_unit_count CHECK (seat_unit_count > 0),
    CONSTRAINT CK_seat_types_display_order CHECK (display_order >= 0)
);
GO

/* C04. seats - ghế vật lý; trạng thái đặt vé thuộc nhóm G, không lưu ở đây */
CREATE TABLE dbo.seats (
    seat_id       BIGINT IDENTITY(1,1) NOT NULL,
    auditorium_id BIGINT               NOT NULL,
    seat_type_id  INT                  NOT NULL,
    seat_code     VARCHAR(20)          NOT NULL,
    row_label     NVARCHAR(10)         NOT NULL,
    seat_number   INT                  NOT NULL,
    seat_status   VARCHAR(20)          NOT NULL CONSTRAINT DF_seats_seat_status DEFAULT 'ACTIVE',
    created_at    DATETIME2(0)         NOT NULL CONSTRAINT DF_seats_created_at DEFAULT SYSUTCDATETIME(),
    updated_at    DATETIME2(0)         NOT NULL CONSTRAINT DF_seats_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_seats PRIMARY KEY (seat_id),
    CONSTRAINT UQ_seats_auditorium_code UNIQUE (auditorium_id, seat_code),
    CONSTRAINT UQ_seats_auditorium_row_number UNIQUE (auditorium_id, row_label, seat_number),
    CONSTRAINT UQ_seats_id_auditorium UNIQUE (seat_id, auditorium_id),
    CONSTRAINT CK_seats_seat_number CHECK (seat_number > 0),
    CONSTRAINT CK_seats_seat_status CHECK (seat_status IN ('ACTIVE','DISABLED','REMOVED')),
    CONSTRAINT FK_seats_auditoriums FOREIGN KEY (auditorium_id) REFERENCES dbo.auditoriums (auditorium_id),
    CONSTRAINT FK_seats_seat_types FOREIGN KEY (seat_type_id) REFERENCES dbo.seat_types (seat_type_id)
);
GO
CREATE INDEX IX_seats_seat_type_id ON dbo.seats (seat_type_id);
GO

/* C05. seat_layouts - mỗi phòng một sơ đồ quản lý chính; vòng đời nằm ở version */
CREATE TABLE dbo.seat_layouts (
    layout_id     BIGINT IDENTITY(1,1) NOT NULL,
    auditorium_id BIGINT               NOT NULL,
    layout_name   NVARCHAR(150)        NOT NULL,
    description   NVARCHAR(500)        NULL,
    created_at    DATETIME2(0)         NOT NULL CONSTRAINT DF_seat_layouts_created_at DEFAULT SYSUTCDATETIME(),
    updated_at    DATETIME2(0)         NOT NULL CONSTRAINT DF_seat_layouts_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_seat_layouts PRIMARY KEY (layout_id),
    CONSTRAINT UQ_seat_layouts_auditorium UNIQUE (auditorium_id),
    CONSTRAINT UQ_seat_layouts_id_auditorium UNIQUE (layout_id, auditorium_id),
    CONSTRAINT FK_seat_layouts_auditoriums FOREIGN KEY (auditorium_id) REFERENCES dbo.auditoriums (auditorium_id)
);
GO

/* C06. seat_layout_versions - phiên bản sơ đồ; auditorium_id để composite FK chặn lệch phòng */
CREATE TABLE dbo.seat_layout_versions (
    layout_version_id BIGINT IDENTITY(1,1) NOT NULL,
    layout_id         BIGINT               NOT NULL,
    auditorium_id     BIGINT               NOT NULL,
    version_number    INT                  NOT NULL,
    version_name      NVARCHAR(100)        NULL,
    version_status    VARCHAR(20)          NOT NULL CONSTRAINT DF_seat_layout_versions_version_status DEFAULT 'DRAFT',
    total_seats       INT                  NOT NULL CONSTRAINT DF_seat_layout_versions_total_seats DEFAULT 0,
    effective_from    DATETIME2(0)         NULL,
    effective_to      DATETIME2(0)         NULL,
    created_by        BIGINT               NULL,
    created_at        DATETIME2(0)         NOT NULL CONSTRAINT DF_seat_layout_versions_created_at DEFAULT SYSUTCDATETIME(),
    published_at      DATETIME2(0)         NULL,
    CONSTRAINT PK_seat_layout_versions PRIMARY KEY (layout_version_id),
    CONSTRAINT UQ_seat_layout_versions_layout_number UNIQUE (layout_id, version_number),
    CONSTRAINT UQ_seat_layout_versions_id_auditorium UNIQUE (layout_version_id, auditorium_id),
    CONSTRAINT CK_seat_layout_versions_version_number CHECK (version_number > 0),
    CONSTRAINT CK_seat_layout_versions_total_seats CHECK (total_seats >= 0),
    CONSTRAINT CK_seat_layout_versions_status CHECK (version_status IN ('DRAFT','PUBLISHED','ARCHIVED')),
    CONSTRAINT CK_seat_layout_versions_effective CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to > effective_from),
    CONSTRAINT FK_seat_layout_versions_layout FOREIGN KEY (layout_id, auditorium_id) REFERENCES dbo.seat_layouts (layout_id, auditorium_id),
    CONSTRAINT FK_seat_layout_versions_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (user_id)
);
GO
CREATE UNIQUE INDEX UX_seat_layout_versions_published ON dbo.seat_layout_versions (layout_id) WHERE version_status = 'PUBLISHED';
GO

/* Vị trí ghế trong từng phiên bản sơ đồ; composite FK đảm bảo ghế và version cùng phòng */
CREATE TABLE dbo.seat_layout_version_seats (
    layout_version_id BIGINT        NOT NULL,
    seat_id           BIGINT        NOT NULL,
    auditorium_id     BIGINT        NOT NULL,
    row_position      INT           NOT NULL,
    column_position   INT           NOT NULL,
    x_position        DECIMAL(10,2) NULL,
    y_position        DECIMAL(10,2) NULL,
    rotation_angle    DECIMAL(6,2)  NULL,
    is_enabled        BIT           NOT NULL CONSTRAINT DF_seat_layout_version_seats_is_enabled DEFAULT 1,
    CONSTRAINT PK_seat_layout_version_seats PRIMARY KEY (layout_version_id, seat_id),
    CONSTRAINT UQ_seat_layout_version_seats_grid UNIQUE (layout_version_id, row_position, column_position),
    CONSTRAINT CK_seat_layout_version_seats_positions CHECK (row_position >= 0 AND column_position >= 0),
    CONSTRAINT FK_slvs_version FOREIGN KEY (layout_version_id, auditorium_id) REFERENCES dbo.seat_layout_versions (layout_version_id, auditorium_id),
    CONSTRAINT FK_slvs_seat FOREIGN KEY (seat_id, auditorium_id) REFERENCES dbo.seats (seat_id, auditorium_id)
);
GO

/* C07. seat_unavailability - khóa ghế theo khoảng thời gian; chồng lấn ACTIVE phải chặn
   bằng transaction/stored procedure vì SQL Server không có exclusion constraint */
CREATE TABLE dbo.seat_unavailability (
    unavailability_id BIGINT IDENTITY(1,1) NOT NULL,
    seat_id           BIGINT               NOT NULL,
    start_at          DATETIME2(0)         NOT NULL,
    end_at            DATETIME2(0)         NULL,
    reason_code       VARCHAR(30)          NOT NULL,
    description       NVARCHAR(500)        NULL,
    status            VARCHAR(20)          NOT NULL CONSTRAINT DF_seat_unavailability_status DEFAULT 'ACTIVE',
    created_by        BIGINT               NOT NULL,
    created_at        DATETIME2(0)         NOT NULL CONSTRAINT DF_seat_unavailability_created_at DEFAULT SYSUTCDATETIME(),
    updated_at        DATETIME2(0)         NOT NULL CONSTRAINT DF_seat_unavailability_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_seat_unavailability PRIMARY KEY (unavailability_id),
    CONSTRAINT CK_seat_unavailability_reason CHECK (reason_code IN ('MAINTENANCE','DAMAGED','OPERATIONAL','RESERVED_INTERNAL','OTHER')),
    CONSTRAINT CK_seat_unavailability_status CHECK (status IN ('ACTIVE','CANCELLED')),
    CONSTRAINT CK_seat_unavailability_period CHECK (end_at IS NULL OR end_at > start_at),
    CONSTRAINT FK_seat_unavailability_seats FOREIGN KEY (seat_id) REFERENCES dbo.seats (seat_id),
    CONSTRAINT FK_seat_unavailability_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (user_id)
);
GO
CREATE INDEX IX_seat_unavailability_seat_time ON dbo.seat_unavailability (seat_id, start_at) INCLUDE (end_at, status);
GO

/* C08. auditorium_equipment - thiết bị thực tế trong từng phòng chiếu */
CREATE TABLE dbo.auditorium_equipment (
    equipment_id        BIGINT IDENTITY(1,1) NOT NULL,
    auditorium_id       BIGINT               NOT NULL,
    equipment_code      VARCHAR(50)          NOT NULL,
    equipment_name      NVARCHAR(150)        NOT NULL,
    equipment_category  VARCHAR(30)          NOT NULL,
    manufacturer        NVARCHAR(100)        NULL,
    model_number        NVARCHAR(100)        NULL,
    serial_number       NVARCHAR(100)        NULL,
    equipment_status    VARCHAR(20)          NOT NULL CONSTRAINT DF_auditorium_equipment_status DEFAULT 'OPERATIONAL',
    installed_at        DATE                 NULL,
    last_maintenance_at DATE                 NULL,
    next_maintenance_at DATE                 NULL,
    created_at          DATETIME2(0)         NOT NULL CONSTRAINT DF_auditorium_equipment_created_at DEFAULT SYSUTCDATETIME(),
    updated_at          DATETIME2(0)         NOT NULL CONSTRAINT DF_auditorium_equipment_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_auditorium_equipment PRIMARY KEY (equipment_id),
    CONSTRAINT UQ_auditorium_equipment_room_code UNIQUE (auditorium_id, equipment_code),
    CONSTRAINT CK_auditorium_equipment_category CHECK (equipment_category IN ('PROJECTOR','SCREEN','AUDIO','LIGHTING','3D_SYSTEM','CLIMATE','OTHER')),
    CONSTRAINT CK_auditorium_equipment_status CHECK (equipment_status IN ('OPERATIONAL','MAINTENANCE','BROKEN','RETIRED')),
    CONSTRAINT CK_auditorium_equipment_maintenance CHECK (next_maintenance_at IS NULL OR last_maintenance_at IS NULL OR next_maintenance_at >= last_maintenance_at),
    CONSTRAINT FK_auditorium_equipment_auditoriums FOREIGN KEY (auditorium_id) REFERENCES dbo.auditoriums (auditorium_id)
);
GO
CREATE UNIQUE INDEX UX_auditorium_equipment_serial ON dbo.auditorium_equipment (serial_number) WHERE serial_number IS NOT NULL;
GO

/* ---------------------------------------------------------------------
   HỒ SƠ, ĐỊA CHỈ & BẢO MẬT TÀI KHOẢN
   --------------------------------------------------------------------- */

/* A08. user_profiles - hồ sơ cá nhân mở rộng (1:1 với users) */
CREATE TABLE dbo.user_profiles (
    user_id             BIGINT        NOT NULL,
    display_name        NVARCHAR(100) NULL,
    date_of_birth       DATE          NULL,
    gender              VARCHAR(20)   NULL,
    bio                 NVARCHAR(500) NULL,
    preferred_branch_id BIGINT        NULL,
    created_at          DATETIME2(0)  NOT NULL CONSTRAINT DF_user_profiles_created_at DEFAULT SYSUTCDATETIME(),
    updated_at          DATETIME2(0)  NOT NULL CONSTRAINT DF_user_profiles_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_user_profiles PRIMARY KEY (user_id),
    CONSTRAINT CK_user_profiles_gender CHECK (gender IS NULL OR gender IN ('MALE','FEMALE','OTHER','PREFER_NOT_TO_SAY')),
    CONSTRAINT CK_user_profiles_date_of_birth CHECK (date_of_birth IS NULL OR date_of_birth <= CAST(SYSUTCDATETIME() AS DATE)),
    CONSTRAINT FK_user_profiles_users FOREIGN KEY (user_id) REFERENCES dbo.users (user_id),
    CONSTRAINT FK_user_profiles_preferred_branch FOREIGN KEY (preferred_branch_id) REFERENCES dbo.branches (branch_id)
);
GO
CREATE INDEX IX_user_profiles_preferred_branch_id ON dbo.user_profiles (preferred_branch_id);
GO

/* A09. user_addresses - địa chỉ liên hệ/hóa đơn, gắn đơn vị hành chính hiện hành */
CREATE TABLE dbo.user_addresses (
    address_id      BIGINT IDENTITY(1,1) NOT NULL,
    user_id         BIGINT               NOT NULL,
    recipient_name  NVARCHAR(150)        NOT NULL,
    recipient_phone VARCHAR(20)          NOT NULL,
    ward_unit_id    BIGINT               NOT NULL,
    street_address  NVARCHAR(300)        NOT NULL,
    address_label   NVARCHAR(50)         NULL,
    is_default      BIT                  NOT NULL CONSTRAINT DF_user_addresses_is_default DEFAULT 0,
    created_at      DATETIME2(0)         NOT NULL CONSTRAINT DF_user_addresses_created_at DEFAULT SYSUTCDATETIME(),
    updated_at      DATETIME2(0)         NOT NULL CONSTRAINT DF_user_addresses_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_user_addresses PRIMARY KEY (address_id),
    CONSTRAINT FK_user_addresses_users FOREIGN KEY (user_id) REFERENCES dbo.users (user_id),
    CONSTRAINT FK_user_addresses_ward FOREIGN KEY (ward_unit_id) REFERENCES dbo.administrative_units (unit_id)
);
GO
CREATE INDEX IX_user_addresses_user_id ON dbo.user_addresses (user_id);
GO
CREATE UNIQUE INDEX UX_user_addresses_one_default ON dbo.user_addresses (user_id) WHERE is_default = 1;
GO

/* A10. user_sessions - phiên đăng nhập, chỉ lưu hash token */
CREATE TABLE dbo.user_sessions (
    session_id         UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_user_sessions_session_id DEFAULT NEWID(),
    user_id            BIGINT           NOT NULL,
    session_token_hash VARCHAR(255)     NOT NULL,
    device_name        NVARCHAR(150)    NULL,
    ip_address         VARCHAR(45)      NULL,
    user_agent         NVARCHAR(500)    NULL,
    created_at         DATETIME2(0)     NOT NULL CONSTRAINT DF_user_sessions_created_at DEFAULT SYSUTCDATETIME(),
    last_activity_at   DATETIME2(0)     NOT NULL CONSTRAINT DF_user_sessions_last_activity_at DEFAULT SYSUTCDATETIME(),
    expires_at         DATETIME2(0)     NOT NULL,
    revoked_at         DATETIME2(0)     NULL,
    CONSTRAINT PK_user_sessions PRIMARY KEY (session_id),
    CONSTRAINT UQ_user_sessions_token_hash UNIQUE (session_token_hash),
    CONSTRAINT CK_user_sessions_expires CHECK (expires_at > created_at),
    CONSTRAINT FK_user_sessions_users FOREIGN KEY (user_id) REFERENCES dbo.users (user_id)
);
GO
CREATE INDEX IX_user_sessions_user_id ON dbo.user_sessions (user_id);
GO

/* A11. user_login_history - lịch sử đăng nhập, ghi cả lần thất bại */
CREATE TABLE dbo.user_login_history (
    login_history_id BIGINT IDENTITY(1,1) NOT NULL,
    user_id          BIGINT               NULL,
    login_identifier NVARCHAR(255)        NOT NULL,
    login_status     VARCHAR(20)          NOT NULL,
    failure_reason   VARCHAR(50)          NULL,
    ip_address       VARCHAR(45)          NULL,
    user_agent       NVARCHAR(500)        NULL,
    attempted_at     DATETIME2(0)         NOT NULL CONSTRAINT DF_user_login_history_attempted_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_user_login_history PRIMARY KEY (login_history_id),
    CONSTRAINT CK_user_login_history_status CHECK (login_status IN ('SUCCESS','FAILED')),
    CONSTRAINT FK_user_login_history_users FOREIGN KEY (user_id) REFERENCES dbo.users (user_id)
);
GO
CREATE INDEX IX_user_login_history_user_time ON dbo.user_login_history (user_id, attempted_at);
GO
CREATE INDEX IX_user_login_history_identifier_time ON dbo.user_login_history (login_identifier, attempted_at);
GO

/* A12. user_password_resets - đặt lại mật khẩu, token dùng một lần */
CREATE TABLE dbo.user_password_resets (
    reset_id   BIGINT IDENTITY(1,1) NOT NULL,
    user_id    BIGINT               NOT NULL,
    token_hash VARCHAR(255)         NOT NULL,
    created_at DATETIME2(0)         NOT NULL CONSTRAINT DF_user_password_resets_created_at DEFAULT SYSUTCDATETIME(),
    expires_at DATETIME2(0)         NOT NULL,
    used_at    DATETIME2(0)         NULL,
    revoked_at DATETIME2(0)         NULL,
    request_ip VARCHAR(45)          NULL,
    CONSTRAINT PK_user_password_resets PRIMARY KEY (reset_id),
    CONSTRAINT UQ_user_password_resets_token_hash UNIQUE (token_hash),
    CONSTRAINT CK_user_password_resets_expires CHECK (expires_at > created_at),
    CONSTRAINT CK_user_password_resets_used CHECK (used_at IS NULL OR used_at >= created_at),
    CONSTRAINT FK_user_password_resets_users FOREIGN KEY (user_id) REFERENCES dbo.users (user_id)
);
GO
CREATE INDEX IX_user_password_resets_user_id ON dbo.user_password_resets (user_id);
GO

/* A13. user_verifications - xác minh email/số điện thoại */
CREATE TABLE dbo.user_verifications (
    verification_id        BIGINT IDENTITY(1,1) NOT NULL,
    user_id                BIGINT               NOT NULL,
    verification_type      VARCHAR(20)          NOT NULL,
    verification_target    NVARCHAR(255)        NOT NULL,
    verification_code_hash VARCHAR(255)        NOT NULL,
    created_at             DATETIME2(0)         NOT NULL CONSTRAINT DF_user_verifications_created_at DEFAULT SYSUTCDATETIME(),
    expires_at             DATETIME2(0)         NOT NULL,
    verified_at            DATETIME2(0)         NULL,
    revoked_at             DATETIME2(0)         NULL,
    attempt_count          INT                  NOT NULL CONSTRAINT DF_user_verifications_attempt_count DEFAULT 0,
    CONSTRAINT PK_user_verifications PRIMARY KEY (verification_id),
    CONSTRAINT CK_user_verifications_type CHECK (verification_type IN ('EMAIL','PHONE')),
    CONSTRAINT CK_user_verifications_attempt_count CHECK (attempt_count >= 0),
    CONSTRAINT CK_user_verifications_expires CHECK (expires_at > created_at),
    CONSTRAINT FK_user_verifications_users FOREIGN KEY (user_id) REFERENCES dbo.users (user_id)
);
GO
CREATE INDEX IX_user_verifications_user_type ON dbo.user_verifications (user_id, verification_type);
GO

/* ---------------------------------------------------------------------
   DỮ LIỆU KHỞI TẠO
   --------------------------------------------------------------------- */

INSERT INTO dbo.roles (role_code, role_name, scope_type, description) VALUES
    ('ADMIN',    N'System Administrator', 'GLOBAL', N'Quản trị toàn hệ thống'),
    ('CUSTOMER', N'Customer',             'GLOBAL', N'Khách hàng'),
    ('MANAGER',  N'Branch Manager',       'BRANCH', N'Quản lý chi nhánh'),
    ('STAFF',    N'Branch Staff',         'BRANCH', N'Nhân viên chi nhánh');
GO

INSERT INTO dbo.permissions (permission_code, permission_name, resource, action) VALUES
    ('branch.view',      N'Xem chi nhánh',      'branch',    'view'),
    ('branch.update',    N'Cập nhật chi nhánh', 'branch',    'update'),
    ('staff.view',       N'Xem nhân viên',      'staff',     'view'),
    ('staff.create',     N'Tạo nhân viên',      'staff',     'create'),
    ('staff.update',     N'Cập nhật nhân viên', 'staff',     'update'),
    ('movie.create',     N'Tạo phim',           'movie',     'create'),
    ('movie.update',     N'Cập nhật phim',      'movie',     'update'),
    ('showtime.create',  N'Tạo suất chiếu',     'showtime',  'create'),
    ('booking.view',     N'Xem đặt vé',         'booking',   'view'),
    ('booking.cancel',   N'Hủy đặt vé',         'booking',   'cancel'),
    ('report.view',      N'Xem báo cáo',        'report',    'view'),
    ('inventory.manage', N'Quản lý kho',        'inventory', 'manage');
GO

INSERT INTO dbo.branch_facilities (facility_code, facility_name, display_order) VALUES
    ('PARKING',            N'Bãi đỗ xe',         1),
    ('FOOD_COURT',         N'Khu vực ăn uống',   2),
    ('WHEELCHAIR_ACCESS',  N'Hỗ trợ xe lăn',     3),
    ('RESTROOM',           N'Nhà vệ sinh',       4),
    ('LOUNGE',             N'Khu vực chờ',       5),
    ('TICKET_COUNTER',     N'Quầy bán vé',       6),
    ('SELF_SERVICE_KIOSK', N'Máy bán vé tự động', 7);
GO

INSERT INTO dbo.room_types (type_code, type_name, display_order) VALUES
    ('VIP',  N'Phòng VIP',  1),
    ('IMAX', N'Phòng IMAX', 2);
GO

INSERT INTO dbo.seat_types (type_code, type_name, description, seat_unit_count, display_order) VALUES
    ('STANDARD',   N'Ghế thường',    N'Ghế đơn',                  1, 1),
    ('PREMIUM',    N'Ghế cao cấp',   N'Ghế đơn cao cấp',          1, 2),
    ('COUPLE',     N'Ghế đôi',       N'Hai vị trí ngồi liên kết', 2, 3),
    ('WHEELCHAIR', N'Vị trí xe lăn', N'Chỗ dành cho xe lăn',      1, 4);
GO
-- Ma trận role_permissions chưa chốt chính thức nên chưa seed.

/* ---------------------------------------------------------------------
   DỮ LIỆU MẪU ĐỊA CHÍNH (minh họa Quận 1 cũ -> các phường hiện hành,
   không phải toàn bộ dữ liệu quốc gia; branches chưa seed vì cần chốt
   địa chỉ theo phường hiện hành cho cả 6 rạp)
   --------------------------------------------------------------------- */
DECLARE @hcm      BIGINT,
        @q1old    BIGINT,
        @pSaigon  BIGINT,
        @pTandinh BIGINT,
        @pBenthanh BIGINT,
        @wBennghe BIGINT,
        @wDakao   BIGINT,
        @wNtb     BIGINT;

INSERT INTO dbo.administrative_units (unit_code, unit_name, unit_type, parent_unit_id, valid_from, valid_to)
VALUES (NULL, N'TP. Hồ Chí Minh', 'PROVINCE', NULL, '19760702', NULL);
SET @hcm = SCOPE_IDENTITY();

INSERT INTO dbo.administrative_units (unit_code, unit_name, unit_type, parent_unit_id, valid_from, valid_to)
VALUES (NULL, N'Phường Sài Gòn', 'WARD', @hcm, '20250701', NULL);
SET @pSaigon = SCOPE_IDENTITY();

INSERT INTO dbo.administrative_units (unit_code, unit_name, unit_type, parent_unit_id, valid_from, valid_to)
VALUES (NULL, N'Phường Tân Định', 'WARD', @hcm, '20250701', NULL);
SET @pTandinh = SCOPE_IDENTITY();

INSERT INTO dbo.administrative_units (unit_code, unit_name, unit_type, parent_unit_id, valid_from, valid_to)
VALUES (NULL, N'Phường Bến Thành', 'WARD', @hcm, '20250701', NULL);
SET @pBenthanh = SCOPE_IDENTITY();

INSERT INTO dbo.administrative_units (unit_code, unit_name, unit_type, parent_unit_id, valid_from, valid_to)
VALUES (NULL, N'Quận 1', 'DISTRICT', @hcm, '19760702', '20250701');
SET @q1old = SCOPE_IDENTITY();

INSERT INTO dbo.administrative_units (unit_code, unit_name, unit_type, parent_unit_id, valid_from, valid_to)
VALUES (NULL, N'Phường Bến Nghé', 'WARD', @q1old, '19760702', '20250701');
SET @wBennghe = SCOPE_IDENTITY();

INSERT INTO dbo.administrative_units (unit_code, unit_name, unit_type, parent_unit_id, valid_from, valid_to)
VALUES (NULL, N'Phường Đa Kao', 'WARD', @q1old, '19760702', '20250701');
SET @wDakao = SCOPE_IDENTITY();

INSERT INTO dbo.administrative_units (unit_code, unit_name, unit_type, parent_unit_id, valid_from, valid_to)
VALUES (NULL, N'Phường Nguyễn Thái Bình', 'WARD', @q1old, '19760702', '20250701');
SET @wNtb = SCOPE_IDENTITY();

INSERT INTO dbo.administrative_unit_mergers (old_unit_id, new_unit_id, effective_date, relation_type) VALUES
    (@wBennghe, @pSaigon,   '20250701', 'FULL'),
    (@wDakao,   @pSaigon,   '20250701', 'PARTIAL'),
    (@wDakao,   @pTandinh,  '20250701', 'PARTIAL'),
    (@wNtb,     @pSaigon,   '20250701', 'PARTIAL'),
    (@wNtb,     @pBenthanh, '20250701', 'PARTIAL');

INSERT INTO dbo.location_search_aliases (unit_id, alias_name, normalized_name, alias_type) VALUES
    (@q1old,    N'Quận 1',            N'quan 1',            'OLD_NAME'),
    (@q1old,    N'Q1',                N'q1',                'ABBREVIATION'),
    (@q1old,    N'Quận 1 cũ',         N'quan 1 cu',         'OLD_NAME'),
    (@q1old,    N'Trung tâm Quận 1',  N'trung tam quan 1',  'COMMON_NAME'),
    (@wBennghe, N'Bến Nghé',          N'ben nghe',          'OLD_NAME'),
    (@wBennghe, N'Phường Bến Nghé cũ', N'phuong ben nghe cu', 'OLD_NAME');
GO

/* ---------------------------------------------------------------------
   Ví dụ truy vấn gợi ý: người dùng gõ "Quận 1"
   Kết quả: các phường hiện hành liên quan + độ mạnh gợi ý.
   Production: dùng truy vấn đệ quy để hỗ trợ nhiều đợt sáp nhập liên tiếp
   (ví dụ chuỗi Quận 9 -> TP. Thủ Đức -> phường hiện hành).
   Bỏ comment để chạy thử:

DECLARE @input NVARCHAR(200) = N'quan 1';

WITH start_units AS (
    SELECT a.unit_id
    FROM dbo.location_search_aliases a
    WHERE a.normalized_name = @input AND a.is_active = 1
    UNION
    SELECT child.unit_id
    FROM dbo.administrative_units child
    JOIN dbo.location_search_aliases a ON a.unit_id = child.parent_unit_id
    WHERE a.normalized_name = @input AND a.is_active = 1
)
SELECT DISTINCT
    cur.unit_name   AS current_ward,
    m.relation_type AS suggestion_strength  -- FULL = chắc chắn, PARTIAL = có thể liên quan
FROM start_units s
JOIN dbo.administrative_unit_mergers m ON m.old_unit_id = s.unit_id
JOIN dbo.administrative_units cur ON cur.unit_id = m.new_unit_id AND cur.valid_to IS NULL
ORDER BY suggestion_strength, current_ward;
   --------------------------------------------------------------------- */
