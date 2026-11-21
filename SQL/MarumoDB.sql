SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF DB_ID(N'MarumoDB') IS NULL
    CREATE DATABASE MarumoDB COLLATE Vietnamese_CI_AS;
GO
USE MarumoDB;
GO






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
    CONSTRAINT UQ_auditoriums_id_branch UNIQUE (auditorium_id, branch_id),
    CONSTRAINT UQ_auditoriums_branch_code UNIQUE (branch_id, auditorium_code),
    CONSTRAINT CK_auditoriums_screen_width CHECK (screen_width IS NULL OR screen_width > 0),
    CONSTRAINT CK_auditoriums_screen_height CHECK (screen_height IS NULL OR screen_height > 0),
    CONSTRAINT FK_auditoriums_branches FOREIGN KEY (branch_id) REFERENCES dbo.branches (branch_id),
    CONSTRAINT FK_auditoriums_room_types FOREIGN KEY (room_type_id) REFERENCES dbo.room_types (room_type_id)
);
GO
CREATE INDEX IX_auditoriums_room_type_id ON dbo.auditoriums (room_type_id);
GO


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













CREATE TABLE dbo.movies (
    movie_id               BIGINT IDENTITY(1,1) NOT NULL,
    movie_code             VARCHAR(30)          NOT NULL,
    title                  NVARCHAR(250)        NOT NULL,
    original_title         NVARCHAR(250)        NULL,
    slug                   VARCHAR(280)         NOT NULL,
    synopsis               NVARCHAR(MAX)        NULL,
    duration_minutes       SMALLINT             NOT NULL,
    release_date           DATE                 NULL,
    end_date               DATE                 NULL,
    production_year        SMALLINT             NULL,
    production_company     NVARCHAR(200)        NULL,
    director_display       NVARCHAR(250)        NULL,
    original_language_code VARCHAR(10)          NULL,
    status                 VARCHAR(20)          NOT NULL CONSTRAINT DF_movies_status DEFAULT 'DRAFT',
    is_featured            BIT                  NOT NULL CONSTRAINT DF_movies_is_featured DEFAULT 0,
    created_at             DATETIME2(0)         NOT NULL CONSTRAINT DF_movies_created_at DEFAULT SYSUTCDATETIME(),
    updated_at             DATETIME2(0)         NOT NULL CONSTRAINT DF_movies_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_movies PRIMARY KEY (movie_id),
    CONSTRAINT UQ_movies_movie_code UNIQUE (movie_code),
    CONSTRAINT UQ_movies_slug UNIQUE (slug),
    CONSTRAINT CK_movies_duration CHECK (duration_minutes > 0 AND duration_minutes <= 600),
    CONSTRAINT CK_movies_status CHECK (status IN ('DRAFT','PUBLISHED','COMING_SOON','NOW_SHOWING','ENDED','ARCHIVED')),
    CONSTRAINT CK_movies_release_window CHECK (end_date IS NULL OR release_date IS NULL OR end_date >= release_date),
    CONSTRAINT CK_movies_production_year CHECK (production_year IS NULL OR production_year BETWEEN 1888 AND 2100)
);
GO
CREATE INDEX IX_movies_status_release ON dbo.movies (status, release_date);
GO


CREATE TABLE dbo.genres (
    genre_id      INT IDENTITY(1,1) NOT NULL,
    genre_code    VARCHAR(30)       NOT NULL,
    genre_name    NVARCHAR(100)     NOT NULL,
    description   NVARCHAR(500)     NULL,
    is_active     BIT               NOT NULL CONSTRAINT DF_genres_is_active DEFAULT 1,
    display_order SMALLINT          NOT NULL CONSTRAINT DF_genres_display_order DEFAULT 0,
    created_at    DATETIME2(0)      NOT NULL CONSTRAINT DF_genres_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_genres PRIMARY KEY (genre_id),
    CONSTRAINT UQ_genres_genre_code UNIQUE (genre_code),
    CONSTRAINT CK_genres_display_order CHECK (display_order >= 0)
);
GO


CREATE TABLE dbo.movie_genres (
    movie_id   BIGINT NOT NULL,
    genre_id   INT    NOT NULL,
    is_primary BIT    NOT NULL CONSTRAINT DF_movie_genres_is_primary DEFAULT 0,
    CONSTRAINT PK_movie_genres PRIMARY KEY (movie_id, genre_id),
    CONSTRAINT FK_movie_genres_movies FOREIGN KEY (movie_id) REFERENCES dbo.movies (movie_id),
    CONSTRAINT FK_movie_genres_genres FOREIGN KEY (genre_id) REFERENCES dbo.genres (genre_id)
);
GO
CREATE UNIQUE INDEX UX_movie_genres_primary ON dbo.movie_genres (movie_id) WHERE is_primary = 1;
GO
CREATE INDEX IX_movie_genres_genre_id ON dbo.movie_genres (genre_id);
GO


CREATE TABLE dbo.people (
    person_id         BIGINT IDENTITY(1,1) NOT NULL,
    full_name         NVARCHAR(200)        NOT NULL,
    stage_name        NVARCHAR(200)        NULL,
    slug              VARCHAR(220)         NOT NULL,
    biography         NVARCHAR(MAX)        NULL,
    birth_date        DATE                 NULL,
    death_date        DATE                 NULL,
    nationality       NVARCHAR(100)        NULL,
    profile_image_url NVARCHAR(1000)       NULL,
    created_at        DATETIME2(0)         NOT NULL CONSTRAINT DF_people_created_at DEFAULT SYSUTCDATETIME(),
    updated_at        DATETIME2(0)         NOT NULL CONSTRAINT DF_people_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_people PRIMARY KEY (person_id),
    CONSTRAINT UQ_people_slug UNIQUE (slug),
    CONSTRAINT CK_people_life_dates CHECK (death_date IS NULL OR birth_date IS NULL OR death_date >= birth_date)
);
GO


CREATE TABLE dbo.movie_cast (
    movie_cast_id  BIGINT IDENTITY(1,1) NOT NULL,
    movie_id       BIGINT               NOT NULL,
    person_id      BIGINT               NOT NULL,
    character_name NVARCHAR(200)        NULL,
    cast_type      VARCHAR(20)          NOT NULL CONSTRAINT DF_movie_cast_cast_type DEFAULT 'SUPPORTING',
    display_order  SMALLINT             NOT NULL CONSTRAINT DF_movie_cast_display_order DEFAULT 0,
    created_at     DATETIME2(0)         NOT NULL CONSTRAINT DF_movie_cast_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_movie_cast PRIMARY KEY (movie_cast_id),
    CONSTRAINT UQ_movie_cast_movie_person_character UNIQUE (movie_id, person_id, character_name),
    CONSTRAINT CK_movie_cast_cast_type CHECK (cast_type IN ('LEAD','SUPPORTING','CAMEO','VOICE')),
    CONSTRAINT CK_movie_cast_display_order CHECK (display_order >= 0),
    CONSTRAINT FK_movie_cast_movies FOREIGN KEY (movie_id) REFERENCES dbo.movies (movie_id),
    CONSTRAINT FK_movie_cast_people FOREIGN KEY (person_id) REFERENCES dbo.people (person_id)
);
GO
CREATE INDEX IX_movie_cast_person_id ON dbo.movie_cast (person_id);
GO


CREATE TABLE dbo.movie_crew (
    movie_crew_id BIGINT IDENTITY(1,1) NOT NULL,
    movie_id      BIGINT               NOT NULL,
    person_id     BIGINT               NOT NULL,
    department    VARCHAR(40)          NOT NULL,
    job_title     NVARCHAR(150)        NOT NULL,
    display_order SMALLINT             NOT NULL CONSTRAINT DF_movie_crew_display_order DEFAULT 0,
    created_at    DATETIME2(0)         NOT NULL CONSTRAINT DF_movie_crew_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_movie_crew PRIMARY KEY (movie_crew_id),
    CONSTRAINT CK_movie_crew_display_order CHECK (display_order >= 0),
    CONSTRAINT FK_movie_crew_movies FOREIGN KEY (movie_id) REFERENCES dbo.movies (movie_id),
    CONSTRAINT FK_movie_crew_people FOREIGN KEY (person_id) REFERENCES dbo.people (person_id)
);
GO
CREATE INDEX IX_movie_crew_movie_department ON dbo.movie_crew (movie_id, department, display_order);
GO
CREATE INDEX IX_movie_crew_person_id ON dbo.movie_crew (person_id);
GO


CREATE TABLE dbo.movie_media (
    media_id      BIGINT IDENTITY(1,1) NOT NULL,
    movie_id      BIGINT               NOT NULL,
    media_type    VARCHAR(30)          NOT NULL,
    media_url     NVARCHAR(1000)       NOT NULL,
    thumbnail_url NVARCHAR(1000)       NULL,
    title         NVARCHAR(200)        NULL,
    is_primary    BIT                  NOT NULL CONSTRAINT DF_movie_media_is_primary DEFAULT 0,
    display_order SMALLINT             NOT NULL CONSTRAINT DF_movie_media_display_order DEFAULT 0,
    created_at    DATETIME2(0)         NOT NULL CONSTRAINT DF_movie_media_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_movie_media PRIMARY KEY (media_id),
    CONSTRAINT CK_movie_media_type CHECK (media_type IN ('POSTER','BACKDROP','TRAILER','TEASER','STILL','BEHIND_THE_SCENES')),
    CONSTRAINT CK_movie_media_display_order CHECK (display_order >= 0),
    CONSTRAINT FK_movie_media_movies FOREIGN KEY (movie_id) REFERENCES dbo.movies (movie_id)
);
GO
CREATE UNIQUE INDEX UX_movie_media_primary ON dbo.movie_media (movie_id, media_type) WHERE is_primary = 1;
GO
CREATE INDEX IX_movie_media_movie_type_order ON dbo.movie_media (movie_id, media_type, display_order);
GO


CREATE TABLE dbo.languages (
    language_id   SMALLINT IDENTITY(1,1) NOT NULL,
    language_code VARCHAR(20)            NOT NULL,
    language_name NVARCHAR(100)          NOT NULL,
    native_name   NVARCHAR(100)          NULL,
    is_active     BIT                    NOT NULL CONSTRAINT DF_languages_is_active DEFAULT 1,
    created_at    DATETIME2(0)           NOT NULL CONSTRAINT DF_languages_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_languages PRIMARY KEY (language_id),
    CONSTRAINT UQ_languages_language_code UNIQUE (language_code)
);
GO


CREATE TABLE dbo.movie_languages (
    movie_language_id BIGINT IDENTITY(1,1) NOT NULL,
    movie_id          BIGINT               NOT NULL,
    language_id       SMALLINT             NOT NULL,
    language_type     VARCHAR(20)          NOT NULL,
    is_original       BIT                  NOT NULL CONSTRAINT DF_movie_languages_is_original DEFAULT 0,
    is_default        BIT                  NOT NULL CONSTRAINT DF_movie_languages_is_default DEFAULT 0,
    display_order     SMALLINT             NOT NULL CONSTRAINT DF_movie_languages_display_order DEFAULT 0,
    CONSTRAINT PK_movie_languages PRIMARY KEY (movie_language_id),
    CONSTRAINT UQ_movie_languages_movie_language_type UNIQUE (movie_id, language_id, language_type),
    CONSTRAINT CK_movie_languages_type CHECK (language_type IN ('AUDIO','SUBTITLE')),
    CONSTRAINT CK_movie_languages_display_order CHECK (display_order >= 0),
    CONSTRAINT FK_movie_languages_movies FOREIGN KEY (movie_id) REFERENCES dbo.movies (movie_id),
    CONSTRAINT FK_movie_languages_languages FOREIGN KEY (language_id) REFERENCES dbo.languages (language_id)
);
GO
CREATE INDEX IX_movie_languages_language_id ON dbo.movie_languages (language_id);
GO


CREATE TABLE dbo.movie_content_ratings (
    movie_content_rating_id BIGINT IDENTITY(1,1) NOT NULL,
    movie_id                BIGINT               NOT NULL,
    country_code            CHAR(2)              NOT NULL,
    rating_system           VARCHAR(50)          NOT NULL,
    rating_code             VARCHAR(20)          NOT NULL,
    minimum_age             TINYINT              NULL,
    rating_description      NVARCHAR(500)        NULL,
    certification_number    NVARCHAR(100)        NULL,
    certified_date          DATE                 NULL,
    created_at              DATETIME2(0)         NOT NULL CONSTRAINT DF_movie_content_ratings_created_at DEFAULT SYSUTCDATETIME(),
    updated_at              DATETIME2(0)         NOT NULL CONSTRAINT DF_movie_content_ratings_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_movie_content_ratings PRIMARY KEY (movie_content_rating_id),
    CONSTRAINT UQ_movie_content_ratings_movie_country_system UNIQUE (movie_id, country_code, rating_system),
    CONSTRAINT CK_movie_content_ratings_minimum_age CHECK (minimum_age IS NULL OR minimum_age BETWEEN 0 AND 21),
    CONSTRAINT FK_movie_content_ratings_movies FOREIGN KEY (movie_id) REFERENCES dbo.movies (movie_id)
);
GO


























CREATE TABLE dbo.screening_formats (
    format_id   INT IDENTITY(1,1) NOT NULL,
    format_code VARCHAR(30)       NOT NULL,
    format_name NVARCHAR(100)     NOT NULL,
    description NVARCHAR(500)     NULL,
    is_active   BIT               NOT NULL CONSTRAINT DF_screening_formats_is_active DEFAULT 1,
    created_at  DATETIME2(0)      NOT NULL CONSTRAINT DF_screening_formats_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_screening_formats PRIMARY KEY (format_id),
    CONSTRAINT UQ_screening_formats_format_code UNIQUE (format_code)
);
GO


CREATE TABLE dbo.movie_versions (
    movie_version_id     BIGINT IDENTITY(1,1) NOT NULL,
    movie_id             BIGINT               NOT NULL,
    version_code         VARCHAR(50)          NOT NULL,
    version_name         NVARCHAR(150)        NOT NULL,
    audio_language_id    SMALLINT             NOT NULL,
    subtitle_language_id SMALLINT             NULL,
    format_id            INT                  NOT NULL,
    is_original_audio    BIT                  NOT NULL CONSTRAINT DF_movie_versions_is_original_audio DEFAULT 0,
    is_active            BIT                  NOT NULL CONSTRAINT DF_movie_versions_is_active DEFAULT 1,
    created_at           DATETIME2(0)         NOT NULL CONSTRAINT DF_movie_versions_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_movie_versions PRIMARY KEY (movie_version_id),
    CONSTRAINT UQ_movie_versions_movie_code UNIQUE (movie_id, version_code),
    CONSTRAINT FK_movie_versions_movies FOREIGN KEY (movie_id) REFERENCES dbo.movies (movie_id),
    CONSTRAINT FK_movie_versions_audio_language FOREIGN KEY (audio_language_id) REFERENCES dbo.languages (language_id),
    CONSTRAINT FK_movie_versions_subtitle_language FOREIGN KEY (subtitle_language_id) REFERENCES dbo.languages (language_id),
    CONSTRAINT FK_movie_versions_formats FOREIGN KEY (format_id) REFERENCES dbo.screening_formats (format_id)
);
GO
CREATE INDEX IX_movie_versions_format_id ON dbo.movie_versions (format_id);
GO
CREATE INDEX IX_movie_versions_audio_language_id ON dbo.movie_versions (audio_language_id);
GO
CREATE INDEX IX_movie_versions_subtitle_language_id ON dbo.movie_versions (subtitle_language_id);
GO


CREATE TABLE dbo.showtime_statuses (
    status_id     SMALLINT IDENTITY(1,1) NOT NULL,
    status_code   VARCHAR(30)            NOT NULL,
    status_name   NVARCHAR(100)          NOT NULL,
    description   NVARCHAR(300)          NULL,
    is_terminal   BIT                    NOT NULL CONSTRAINT DF_showtime_statuses_is_terminal DEFAULT 0,
    is_active     BIT                    NOT NULL CONSTRAINT DF_showtime_statuses_is_active DEFAULT 1,
    display_order SMALLINT               NOT NULL CONSTRAINT DF_showtime_statuses_display_order DEFAULT 0,
    CONSTRAINT PK_showtime_statuses PRIMARY KEY (status_id),
    CONSTRAINT UQ_showtime_statuses_status_code UNIQUE (status_code),
    CONSTRAINT CK_showtime_statuses_display_order CHECK (display_order >= 0)
);
GO










CREATE TABLE dbo.showtimes (
    showtime_id         BIGINT IDENTITY(1,1) NOT NULL,
    showtime_code       VARCHAR(40)          NOT NULL,
    branch_id           BIGINT               NOT NULL,
    auditorium_id       BIGINT               NOT NULL,
    movie_version_id    BIGINT               NOT NULL,
    status_id           SMALLINT             NOT NULL,
    start_at            DATETIME2(0)         NOT NULL,
    end_at              DATETIME2(0)         NOT NULL,
    preparation_minutes SMALLINT             NOT NULL CONSTRAINT DF_showtimes_preparation_minutes DEFAULT 15,
    cleanup_minutes     SMALLINT             NOT NULL CONSTRAINT DF_showtimes_cleanup_minutes DEFAULT 15,
    base_ticket_price   DECIMAL(12,2)        NOT NULL,
    sales_open_at       DATETIME2(0)         NULL,
    sales_close_at      DATETIME2(0)         NULL,
    created_by_user_id  BIGINT               NOT NULL,
    approved_by_user_id BIGINT               NULL,
    approved_at         DATETIME2(0)         NULL,
    created_at          DATETIME2(0)         NOT NULL CONSTRAINT DF_showtimes_created_at DEFAULT SYSUTCDATETIME(),
    updated_at          DATETIME2(0)         NOT NULL CONSTRAINT DF_showtimes_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_showtimes PRIMARY KEY (showtime_id),
    CONSTRAINT UQ_showtimes_showtime_code UNIQUE (showtime_code),
    CONSTRAINT UQ_showtimes_id_branch UNIQUE (showtime_id, branch_id),
    CONSTRAINT UQ_showtimes_id_auditorium UNIQUE (showtime_id, auditorium_id),
    CONSTRAINT CK_showtimes_time_window CHECK (end_at > start_at),
    CONSTRAINT CK_showtimes_preparation_minutes CHECK (preparation_minutes BETWEEN 0 AND 180),
    CONSTRAINT CK_showtimes_cleanup_minutes CHECK (cleanup_minutes BETWEEN 0 AND 180),
    CONSTRAINT CK_showtimes_base_ticket_price CHECK (base_ticket_price >= 0),
    CONSTRAINT CK_showtimes_sales_window CHECK (sales_close_at IS NULL OR sales_open_at IS NULL OR sales_close_at > sales_open_at),
    CONSTRAINT CK_showtimes_approval CHECK (approved_at IS NULL OR approved_by_user_id IS NOT NULL),
    CONSTRAINT FK_showtimes_branches FOREIGN KEY (branch_id) REFERENCES dbo.branches (branch_id),
    CONSTRAINT FK_showtimes_auditoriums FOREIGN KEY (auditorium_id, branch_id) REFERENCES dbo.auditoriums (auditorium_id, branch_id),
    CONSTRAINT FK_showtimes_movie_versions FOREIGN KEY (movie_version_id) REFERENCES dbo.movie_versions (movie_version_id),
    CONSTRAINT FK_showtimes_statuses FOREIGN KEY (status_id) REFERENCES dbo.showtime_statuses (status_id),
    CONSTRAINT FK_showtimes_created_by FOREIGN KEY (created_by_user_id) REFERENCES dbo.users (user_id),
    CONSTRAINT FK_showtimes_approved_by FOREIGN KEY (approved_by_user_id) REFERENCES dbo.users (user_id)
);
GO
CREATE INDEX IX_showtimes_auditorium_start ON dbo.showtimes (auditorium_id, start_at) INCLUDE (end_at, preparation_minutes, cleanup_minutes, status_id);
GO
CREATE INDEX IX_showtimes_branch_start ON dbo.showtimes (branch_id, start_at);
GO
CREATE INDEX IX_showtimes_movie_version_start ON dbo.showtimes (movie_version_id, start_at);
GO
CREATE INDEX IX_showtimes_status_start ON dbo.showtimes (status_id, start_at);
GO



CREATE TABLE dbo.showtime_seat_statuses (
    seat_status_id        SMALLINT IDENTITY(1,1) NOT NULL,
    status_code           VARCHAR(30)            NOT NULL,
    status_name           NVARCHAR(100)          NOT NULL,
    description           NVARCHAR(300)          NULL,
    is_available_for_sale BIT                    NOT NULL CONSTRAINT DF_showtime_seat_statuses_is_available_for_sale DEFAULT 0,
    is_active             BIT                    NOT NULL CONSTRAINT DF_showtime_seat_statuses_is_active DEFAULT 1,
    CONSTRAINT PK_showtime_seat_statuses PRIMARY KEY (seat_status_id),
    CONSTRAINT UQ_showtime_seat_statuses_status_code UNIQUE (status_code)
);
GO



CREATE TABLE dbo.showtime_schedule_changes (
    change_id            BIGINT IDENTITY(1,1) NOT NULL,
    showtime_id          BIGINT               NOT NULL,
    changed_by_user_id   BIGINT               NOT NULL,
    change_type          VARCHAR(30)          NOT NULL,
    old_status_id        SMALLINT             NULL,
    new_status_id        SMALLINT             NULL,
    old_auditorium_id    BIGINT               NULL,
    new_auditorium_id    BIGINT               NULL,
    old_movie_version_id BIGINT               NULL,
    new_movie_version_id BIGINT               NULL,
    old_start_at         DATETIME2(0)         NULL,
    new_start_at         DATETIME2(0)         NULL,
    old_end_at           DATETIME2(0)         NULL,
    new_end_at           DATETIME2(0)         NULL,
    change_reason        NVARCHAR(1000)       NOT NULL,
    changed_at           DATETIME2(0)         NOT NULL CONSTRAINT DF_showtime_schedule_changes_changed_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_showtime_schedule_changes PRIMARY KEY (change_id),
    CONSTRAINT CK_showtime_schedule_changes_type CHECK (change_type IN ('TIME_CHANGE','ROOM_CHANGE','MOVIE_VERSION_CHANGE','CANCELLATION','RESTORATION')),
    CONSTRAINT FK_showtime_schedule_changes_showtime FOREIGN KEY (showtime_id) REFERENCES dbo.showtimes (showtime_id),
    CONSTRAINT FK_showtime_schedule_changes_changed_by FOREIGN KEY (changed_by_user_id) REFERENCES dbo.users (user_id),
    CONSTRAINT FK_showtime_schedule_changes_old_status FOREIGN KEY (old_status_id) REFERENCES dbo.showtime_statuses (status_id),
    CONSTRAINT FK_showtime_schedule_changes_new_status FOREIGN KEY (new_status_id) REFERENCES dbo.showtime_statuses (status_id),
    CONSTRAINT FK_showtime_schedule_changes_old_auditorium FOREIGN KEY (old_auditorium_id) REFERENCES dbo.auditoriums (auditorium_id),
    CONSTRAINT FK_showtime_schedule_changes_new_auditorium FOREIGN KEY (new_auditorium_id) REFERENCES dbo.auditoriums (auditorium_id),
    CONSTRAINT FK_showtime_schedule_changes_old_version FOREIGN KEY (old_movie_version_id) REFERENCES dbo.movie_versions (movie_version_id),
    CONSTRAINT FK_showtime_schedule_changes_new_version FOREIGN KEY (new_movie_version_id) REFERENCES dbo.movie_versions (movie_version_id)
);
GO
CREATE INDEX IX_showtime_schedule_changes_showtime_time ON dbo.showtime_schedule_changes (showtime_id, changed_at);
GO


CREATE TABLE dbo.showtime_price_rules (
    price_rule_id    BIGINT IDENTITY(1,1) NOT NULL,
    showtime_id      BIGINT               NOT NULL,
    rule_code        VARCHAR(40)          NOT NULL,
    rule_name        NVARCHAR(150)        NOT NULL,
    adjustment_type  VARCHAR(20)          NOT NULL,
    adjustment_value DECIMAL(12,2)        NOT NULL,
    priority         SMALLINT             NOT NULL CONSTRAINT DF_showtime_price_rules_priority DEFAULT 0,
    is_active        BIT                  NOT NULL CONSTRAINT DF_showtime_price_rules_is_active DEFAULT 1,
    created_at       DATETIME2(0)         NOT NULL CONSTRAINT DF_showtime_price_rules_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_showtime_price_rules PRIMARY KEY (price_rule_id),
    CONSTRAINT UQ_showtime_price_rules_showtime_code UNIQUE (showtime_id, rule_code),
    CONSTRAINT CK_showtime_price_rules_adjustment_type CHECK (adjustment_type IN ('FIXED_ADD','FIXED_OVERRIDE','PERCENT_ADD','PERCENT_DISCOUNT')),
    CONSTRAINT CK_showtime_price_rules_value CHECK (
        adjustment_type = 'FIXED_ADD'
        OR (adjustment_type = 'FIXED_OVERRIDE' AND adjustment_value >= 0)
        OR (adjustment_type IN ('PERCENT_ADD','PERCENT_DISCOUNT') AND adjustment_value BETWEEN 0 AND 100)
    ),
    CONSTRAINT CK_showtime_price_rules_priority CHECK (priority >= 0),
    CONSTRAINT FK_showtime_price_rules_showtimes FOREIGN KEY (showtime_id) REFERENCES dbo.showtimes (showtime_id)
);
GO


CREATE TABLE dbo.showtime_special_tags (
    tag_id        INT IDENTITY(1,1) NOT NULL,
    tag_code      VARCHAR(40)       NOT NULL,
    tag_name      NVARCHAR(100)     NOT NULL,
    description   NVARCHAR(300)     NULL,
    display_color VARCHAR(20)       NULL,
    is_active     BIT               NOT NULL CONSTRAINT DF_showtime_special_tags_is_active DEFAULT 1,
    display_order SMALLINT          NOT NULL CONSTRAINT DF_showtime_special_tags_display_order DEFAULT 0,
    CONSTRAINT PK_showtime_special_tags PRIMARY KEY (tag_id),
    CONSTRAINT UQ_showtime_special_tags_tag_code UNIQUE (tag_code),
    CONSTRAINT CK_showtime_special_tags_display_order CHECK (display_order >= 0)
);
GO


CREATE TABLE dbo.showtime_tags (
    showtime_id         BIGINT      NOT NULL,
    tag_id              INT         NOT NULL,
    assigned_by_user_id BIGINT      NOT NULL,
    assigned_at         DATETIME2(0) NOT NULL CONSTRAINT DF_showtime_tags_assigned_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_showtime_tags PRIMARY KEY (showtime_id, tag_id),
    CONSTRAINT FK_showtime_tags_showtimes FOREIGN KEY (showtime_id) REFERENCES dbo.showtimes (showtime_id),
    CONSTRAINT FK_showtime_tags_tags FOREIGN KEY (tag_id) REFERENCES dbo.showtime_special_tags (tag_id),
    CONSTRAINT FK_showtime_tags_assigned_by FOREIGN KEY (assigned_by_user_id) REFERENCES dbo.users (user_id)
);
GO
CREATE INDEX IX_showtime_tags_tag_id ON dbo.showtime_tags (tag_id);
GO


CREATE TABLE dbo.showtime_audit_logs (
    audit_log_id  BIGINT IDENTITY(1,1) NOT NULL,
    showtime_id   BIGINT               NOT NULL,
    actor_user_id BIGINT               NULL,
    action_code   VARCHAR(50)          NOT NULL,
    old_values    NVARCHAR(MAX)        NULL,
    new_values    NVARCHAR(MAX)        NULL,
    ip_address    VARCHAR(45)          NULL,
    user_agent    NVARCHAR(500)        NULL,
    created_at    DATETIME2(0)         NOT NULL CONSTRAINT DF_showtime_audit_logs_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_showtime_audit_logs PRIMARY KEY (audit_log_id),
    CONSTRAINT CK_showtime_audit_logs_old_json CHECK (old_values IS NULL OR ISJSON(old_values) = 1),
    CONSTRAINT CK_showtime_audit_logs_new_json CHECK (new_values IS NULL OR ISJSON(new_values) = 1),
    CONSTRAINT FK_showtime_audit_logs_showtimes FOREIGN KEY (showtime_id) REFERENCES dbo.showtimes (showtime_id),
    CONSTRAINT FK_showtime_audit_logs_actor FOREIGN KEY (actor_user_id) REFERENCES dbo.users (user_id)
);
GO
CREATE INDEX IX_showtime_audit_logs_showtime_time ON dbo.showtime_audit_logs (showtime_id, created_at);
GO
CREATE INDEX IX_showtime_audit_logs_actor_time ON dbo.showtime_audit_logs (actor_user_id, created_at);
GO



CREATE TABLE dbo.auditorium_screening_formats (
    auditorium_id BIGINT       NOT NULL,
    format_id     INT          NOT NULL,
    is_active     BIT          NOT NULL CONSTRAINT DF_auditorium_screening_formats_is_active DEFAULT 1,
    created_at    DATETIME2(0) NOT NULL CONSTRAINT DF_auditorium_screening_formats_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_auditorium_screening_formats PRIMARY KEY (auditorium_id, format_id),
    CONSTRAINT FK_auditorium_screening_formats_auditoriums FOREIGN KEY (auditorium_id) REFERENCES dbo.auditoriums (auditorium_id),
    CONSTRAINT FK_auditorium_screening_formats_formats FOREIGN KEY (format_id) REFERENCES dbo.screening_formats (format_id)
);
GO
CREATE INDEX IX_auditorium_screening_formats_format_id ON dbo.auditorium_screening_formats (format_id);
GO




CREATE PROCEDURE dbo.usp_showtime_create
    @showtime_code       VARCHAR(40),
    @branch_id           BIGINT,
    @auditorium_id       BIGINT,
    @movie_version_id    BIGINT,
    @status_code         VARCHAR(30) = 'DRAFT',
    @start_at            DATETIME2(0),
    @end_at              DATETIME2(0),
    @preparation_minutes SMALLINT = 15,
    @cleanup_minutes     SMALLINT = 15,
    @base_ticket_price   DECIMAL(12,2),
    @sales_open_at       DATETIME2(0) = NULL,
    @sales_close_at      DATETIME2(0) = NULL,
    @created_by_user_id  BIGINT,
    @showtime_id         BIGINT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @status_id SMALLINT =
        (SELECT status_id FROM dbo.showtime_statuses WHERE status_code = @status_code AND is_active = 1);
    IF @status_id IS NULL
        THROW 51001, N'Trạng thái suất chiếu không tồn tại hoặc đã ngừng sử dụng.', 1;

    IF @end_at <= @start_at
        THROW 51002, N'Thời điểm kết thúc phải sau thời điểm bắt đầu.', 1;

    IF NOT EXISTS (
        SELECT 1
        FROM dbo.auditoriums a
        JOIN dbo.movie_versions mv
          ON mv.movie_version_id = @movie_version_id
         AND mv.is_active = 1
        JOIN dbo.auditorium_screening_formats asf
          ON asf.auditorium_id = a.auditorium_id
         AND asf.format_id = mv.format_id
         AND asf.is_active = 1
        WHERE a.auditorium_id = @auditorium_id
          AND a.branch_id = @branch_id
          AND a.is_active = 1
    )
        THROW 51003, N'Phòng chiếu không thuộc chi nhánh hoặc không hỗ trợ định dạng của phiên bản phim.', 1;

    DECLARE @movie_duration SMALLINT;
    SELECT @movie_duration = m.duration_minutes
    FROM dbo.movie_versions mv
    JOIN dbo.movies m ON m.movie_id = mv.movie_id
    WHERE mv.movie_version_id = @movie_version_id;

    IF @movie_duration IS NOT NULL
       AND @end_at < DATEADD(MINUTE, @movie_duration, @start_at)
        THROW 51004, N'Thời điểm kết thúc phải sau khi phim kết thúc (tối thiểu bằng thời lượng phim).', 1;

    DECLARE @cancelled_status_id SMALLINT =
        (SELECT status_id FROM dbo.showtime_statuses WHERE status_code = 'CANCELLED');
    IF @cancelled_status_id IS NULL
        THROW 51005, N'Chưa cấu hình trạng thái CANCELLED.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        IF EXISTS (
            SELECT 1
            FROM dbo.showtimes s WITH (UPDLOCK, HOLDLOCK)
            WHERE s.auditorium_id = @auditorium_id
              AND s.status_id <> @cancelled_status_id
              AND DATEADD(MINUTE, -s.preparation_minutes, s.start_at) < DATEADD(MINUTE, @cleanup_minutes, @end_at)
              AND DATEADD(MINUTE, s.cleanup_minutes, s.end_at) > DATEADD(MINUTE, -@preparation_minutes, @start_at)
        )
            THROW 51006, N'Khoảng chiếm dụng phòng bị trùng với suất chiếu khác.', 1;

        INSERT INTO dbo.showtimes (
            showtime_code, branch_id, auditorium_id, movie_version_id, status_id,
            start_at, end_at, preparation_minutes, cleanup_minutes, base_ticket_price,
            sales_open_at, sales_close_at, created_by_user_id
        )
        VALUES (
            @showtime_code, @branch_id, @auditorium_id, @movie_version_id, @status_id,
            @start_at, @end_at, @preparation_minutes, @cleanup_minutes, @base_ticket_price,
            @sales_open_at, @sales_close_at, @created_by_user_id
        );

        SET @showtime_id = SCOPE_IDENTITY();
        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END
GO



CREATE PROCEDURE dbo.usp_showtime_reschedule
    @showtime_id         BIGINT,
    @changed_by_user_id  BIGINT,
    @change_type         VARCHAR(30),
    @change_reason       NVARCHAR(1000),
    @auditorium_id       BIGINT = NULL,
    @movie_version_id    BIGINT = NULL,
    @start_at            DATETIME2(0) = NULL,
    @end_at              DATETIME2(0) = NULL,
    @preparation_minutes SMALLINT = NULL,
    @cleanup_minutes     SMALLINT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @change_type IS NULL OR @change_type NOT IN ('TIME_CHANGE','ROOM_CHANGE','MOVIE_VERSION_CHANGE')
        THROW 51010, N'Loại thay đổi không được hỗ trợ bởi procedure này.', 1;

    IF @change_reason IS NULL OR LTRIM(RTRIM(@change_reason)) = N''
        THROW 51011, N'Lý do thay đổi không được để trống.', 1;

    IF @auditorium_id IS NULL AND @movie_version_id IS NULL
       AND @start_at IS NULL AND @end_at IS NULL
       AND @preparation_minutes IS NULL AND @cleanup_minutes IS NULL
        THROW 51012, N'Không có thay đổi nào được cung cấp.', 1;

    DECLARE @old_auditorium_id BIGINT,
            @old_movie_version_id BIGINT,
            @old_start_at DATETIME2(0),
            @old_end_at DATETIME2(0),
            @old_preparation_minutes SMALLINT,
            @old_cleanup_minutes SMALLINT;

    BEGIN TRY
        BEGIN TRANSACTION;

        SELECT @old_auditorium_id = auditorium_id,
               @old_movie_version_id = movie_version_id,
               @old_start_at = start_at,
               @old_end_at = end_at,
               @old_preparation_minutes = preparation_minutes,
               @old_cleanup_minutes = cleanup_minutes
        FROM dbo.showtimes WITH (UPDLOCK, HOLDLOCK)
        WHERE showtime_id = @showtime_id;

        IF @old_auditorium_id IS NULL
            THROW 51013, N'Suất chiếu không tồn tại.', 1;

        DECLARE @new_auditorium_id BIGINT = COALESCE(@auditorium_id, @old_auditorium_id);
        DECLARE @new_movie_version_id BIGINT = COALESCE(@movie_version_id, @old_movie_version_id);
        DECLARE @new_start_at DATETIME2(0) = COALESCE(@start_at, @old_start_at);
        DECLARE @new_end_at DATETIME2(0) = COALESCE(@end_at, @old_end_at);
        DECLARE @new_preparation_minutes SMALLINT = COALESCE(@preparation_minutes, @old_preparation_minutes);
        DECLARE @new_cleanup_minutes SMALLINT = COALESCE(@cleanup_minutes, @old_cleanup_minutes);

        IF @new_end_at <= @new_start_at
            THROW 51014, N'Thời điểm kết thúc phải sau thời điểm bắt đầu.', 1;

        DECLARE @new_branch_id BIGINT =
            (SELECT branch_id FROM dbo.auditoriums WHERE auditorium_id = @new_auditorium_id AND is_active = 1);
        IF @new_branch_id IS NULL
            THROW 51015, N'Phòng chiếu không tồn tại hoặc đã ngừng sử dụng.', 1;

        IF NOT EXISTS (
            SELECT 1
            FROM dbo.movie_versions mv
            JOIN dbo.auditorium_screening_formats asf
              ON asf.auditorium_id = @new_auditorium_id
             AND asf.format_id = mv.format_id
             AND asf.is_active = 1
            WHERE mv.movie_version_id = @new_movie_version_id
              AND mv.is_active = 1
        )
            THROW 51016, N'Phòng chiếu không hỗ trợ định dạng của phiên bản phim.', 1;

        DECLARE @movie_duration SMALLINT;
        SELECT @movie_duration = m.duration_minutes
        FROM dbo.movie_versions mv
        JOIN dbo.movies m ON m.movie_id = mv.movie_id
        WHERE mv.movie_version_id = @new_movie_version_id;

        IF @movie_duration IS NOT NULL
           AND @new_end_at < DATEADD(MINUTE, @movie_duration, @new_start_at)
            THROW 51017, N'Thời điểm kết thúc phải sau khi phim kết thúc (tối thiểu bằng thời lượng phim).', 1;

        DECLARE @cancelled_status_id SMALLINT =
            (SELECT status_id FROM dbo.showtime_statuses WHERE status_code = 'CANCELLED');
        IF @cancelled_status_id IS NULL
            THROW 51018, N'Chưa cấu hình trạng thái CANCELLED.', 1;

        IF EXISTS (
            SELECT 1
            FROM dbo.showtimes s WITH (UPDLOCK, HOLDLOCK)
            WHERE s.auditorium_id = @new_auditorium_id
              AND s.showtime_id <> @showtime_id
              AND s.status_id <> @cancelled_status_id
              AND DATEADD(MINUTE, -s.preparation_minutes, s.start_at) < DATEADD(MINUTE, @new_cleanup_minutes, @new_end_at)
              AND DATEADD(MINUTE, s.cleanup_minutes, s.end_at) > DATEADD(MINUTE, -@new_preparation_minutes, @new_start_at)
        )
            THROW 51019, N'Khoảng chiếm dụng phòng bị trùng với suất chiếu khác.', 1;

        IF @new_auditorium_id <> @old_auditorium_id AND EXISTS (
            SELECT 1 FROM dbo.showtime_seats WHERE showtime_id = @showtime_id
        )
            THROW 51022, N'Không thể đổi phòng khi suất chiếu đã có dữ liệu ghế.', 1;

        UPDATE dbo.showtimes
        SET branch_id = @new_branch_id,
            auditorium_id = @new_auditorium_id,
            movie_version_id = @new_movie_version_id,
            start_at = @new_start_at,
            end_at = @new_end_at,
            preparation_minutes = @new_preparation_minutes,
            cleanup_minutes = @new_cleanup_minutes,
            updated_at = SYSUTCDATETIME()
        WHERE showtime_id = @showtime_id;

        INSERT INTO dbo.showtime_schedule_changes (
            showtime_id, changed_by_user_id, change_type,
            old_auditorium_id, new_auditorium_id,
            old_movie_version_id, new_movie_version_id,
            old_start_at, new_start_at,
            old_end_at, new_end_at,
            change_reason
        )
        VALUES (
            @showtime_id, @changed_by_user_id, @change_type,
            @old_auditorium_id, @new_auditorium_id,
            @old_movie_version_id, @new_movie_version_id,
            @old_start_at, @new_start_at,
            @old_end_at, @new_end_at,
            @change_reason
        );

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END
GO


CREATE TRIGGER dbo.TRG_showtime_schedule_changes_append_only
ON dbo.showtime_schedule_changes
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 51020, N'showtime_schedule_changes chỉ được ghi thêm; không sửa hoặc xóa.', 1;
END
GO

CREATE TRIGGER dbo.TRG_showtime_audit_logs_append_only
ON dbo.showtime_audit_logs
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 51021, N'showtime_audit_logs chỉ được ghi thêm; không sửa hoặc xóa.', 1;
END
GO






















CREATE TABLE dbo.booking_statuses (
    booking_status_id SMALLINT IDENTITY(1,1) NOT NULL,
    status_code       VARCHAR(30)            NOT NULL,
    status_name       NVARCHAR(100)          NOT NULL,
    description       NVARCHAR(300)          NULL,
    is_terminal       BIT                    NOT NULL CONSTRAINT DF_booking_statuses_is_terminal DEFAULT 0,
    is_active         BIT                    NOT NULL CONSTRAINT DF_booking_statuses_is_active DEFAULT 1,
    display_order     SMALLINT               NOT NULL CONSTRAINT DF_booking_statuses_display_order DEFAULT 0,
    CONSTRAINT PK_booking_statuses PRIMARY KEY (booking_status_id),
    CONSTRAINT UQ_booking_statuses_status_code UNIQUE (status_code),
    CONSTRAINT CK_booking_statuses_display_order CHECK (display_order >= 0)
);
GO


CREATE TABLE dbo.bookings (
    booking_id         BIGINT IDENTITY(1,1) NOT NULL,
    booking_code       VARCHAR(40)          NOT NULL,
    user_id            BIGINT               NULL,
    branch_id          BIGINT               NOT NULL,
    showtime_id        BIGINT               NOT NULL,
    booking_status_id  SMALLINT             NOT NULL,
    booking_channel    VARCHAR(20)          NOT NULL,
    guest_name         NVARCHAR(150)        NULL,
    guest_email        VARCHAR(254)         NULL,
    guest_phone        VARCHAR(20)          NULL,
    subtotal_amount    DECIMAL(14,2)        NOT NULL,
    discount_amount    DECIMAL(14,2)        NOT NULL CONSTRAINT DF_bookings_discount_amount DEFAULT 0,
    total_amount       DECIMAL(14,2)        NOT NULL,
    currency_code      CHAR(3)              NOT NULL CONSTRAINT DF_bookings_currency_code DEFAULT 'VND',
    expires_at         DATETIME2(0)         NULL,
    confirmed_at       DATETIME2(0)         NULL,
    created_by_user_id BIGINT               NULL,
    created_at         DATETIME2(0)         NOT NULL CONSTRAINT DF_bookings_created_at DEFAULT SYSUTCDATETIME(),
    updated_at         DATETIME2(0)         NOT NULL CONSTRAINT DF_bookings_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_bookings PRIMARY KEY (booking_id),
    CONSTRAINT UQ_bookings_booking_code UNIQUE (booking_code),
    CONSTRAINT UQ_bookings_id_showtime UNIQUE (booking_id, showtime_id),
    CONSTRAINT UQ_bookings_id_branch UNIQUE (booking_id, branch_id),
    CONSTRAINT CK_bookings_channel CHECK (booking_channel IN ('WEB','MOBILE','POS')),
    CONSTRAINT CK_bookings_subtotal_amount CHECK (subtotal_amount >= 0),
    CONSTRAINT CK_bookings_discount_amount CHECK (discount_amount >= 0),
    CONSTRAINT CK_bookings_total_amount CHECK (total_amount >= 0),
    CONSTRAINT CK_bookings_amount_math CHECK (total_amount = subtotal_amount - discount_amount),
    CONSTRAINT FK_bookings_users FOREIGN KEY (user_id) REFERENCES dbo.users (user_id),
    CONSTRAINT FK_bookings_branches FOREIGN KEY (branch_id) REFERENCES dbo.branches (branch_id),
    CONSTRAINT FK_bookings_showtimes FOREIGN KEY (showtime_id, branch_id) REFERENCES dbo.showtimes (showtime_id, branch_id),
    CONSTRAINT FK_bookings_statuses FOREIGN KEY (booking_status_id) REFERENCES dbo.booking_statuses (booking_status_id),
    CONSTRAINT FK_bookings_created_by FOREIGN KEY (created_by_user_id) REFERENCES dbo.users (user_id)
);
GO
CREATE INDEX IX_bookings_showtime_id ON dbo.bookings (showtime_id);
GO
CREATE INDEX IX_bookings_user_id ON dbo.bookings (user_id);
GO
CREATE INDEX IX_bookings_branch_status_created ON dbo.bookings (branch_id, booking_status_id, created_at);
GO
CREATE INDEX IX_bookings_status_expires ON dbo.bookings (booking_status_id, expires_at) WHERE expires_at IS NOT NULL;
GO


CREATE TABLE dbo.showtime_seats (
    showtime_seat_id   BIGINT IDENTITY(1,1) NOT NULL,
    auditorium_id     BIGINT               NOT NULL,
    showtime_id        BIGINT               NOT NULL,
    seat_id            BIGINT               NOT NULL,
    seat_status        VARCHAR(30)          NOT NULL,
    base_price         DECIMAL(12,2)        NOT NULL,
    final_price        DECIMAL(12,2)        NOT NULL,
    hold_expires_at    DATETIME2(0)         NULL,
    held_by_session_id UNIQUEIDENTIFIER     NULL,
    created_at         DATETIME2(0)         NOT NULL CONSTRAINT DF_showtime_seats_created_at DEFAULT SYSUTCDATETIME(),
    updated_at         DATETIME2(0)         NOT NULL CONSTRAINT DF_showtime_seats_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_showtime_seats PRIMARY KEY (showtime_seat_id),
    CONSTRAINT UQ_showtime_seats_showtime_seat UNIQUE (showtime_id, seat_id),
    CONSTRAINT UQ_showtime_seats_id_showtime UNIQUE (showtime_seat_id, showtime_id),
    CONSTRAINT CK_showtime_seats_status CHECK (seat_status IN ('AVAILABLE','HELD','BOOKED','SOLD','BLOCKED','UNAVAILABLE')),
    CONSTRAINT CK_showtime_seats_base_price CHECK (base_price >= 0),
    CONSTRAINT CK_showtime_seats_final_price CHECK (final_price >= 0),
    CONSTRAINT CK_showtime_seats_held CHECK ((seat_status = 'HELD' AND hold_expires_at IS NOT NULL) OR (seat_status <> 'HELD')),
    CONSTRAINT FK_showtime_seats_showtimes FOREIGN KEY (showtime_id, auditorium_id) REFERENCES dbo.showtimes (showtime_id, auditorium_id),
    CONSTRAINT FK_showtime_seats_seats FOREIGN KEY (seat_id, auditorium_id) REFERENCES dbo.seats (seat_id, auditorium_id),
    CONSTRAINT FK_showtime_seats_status FOREIGN KEY (seat_status) REFERENCES dbo.showtime_seat_statuses (status_code)
);
GO
CREATE INDEX IX_showtime_seats_seat_id ON dbo.showtime_seats (seat_id);
GO
CREATE INDEX IX_showtime_seats_showtime_status ON dbo.showtime_seats (showtime_id, seat_status);
GO


CREATE TABLE dbo.seat_holds (
    seat_hold_id     BIGINT IDENTITY(1,1) NOT NULL,
    hold_token       UNIQUEIDENTIFIER     NOT NULL,
    showtime_id      BIGINT               NOT NULL,
    showtime_seat_id BIGINT               NOT NULL,
    user_id          BIGINT               NULL,
    session_id       UNIQUEIDENTIFIER     NOT NULL,
    booking_id       BIGINT               NULL,
    hold_status      VARCHAR(20)          NOT NULL,
    held_at          DATETIME2(0)         NOT NULL CONSTRAINT DF_seat_holds_held_at DEFAULT SYSDATETIME(),
    expires_at       DATETIME2(0)         NOT NULL,
    released_at      DATETIME2(0)         NULL,
    CONSTRAINT PK_seat_holds PRIMARY KEY (seat_hold_id),
    CONSTRAINT UQ_seat_holds_token_seat UNIQUE (hold_token, showtime_seat_id),
    CONSTRAINT CK_seat_holds_status CHECK (hold_status IN ('ACTIVE','CONVERTED','EXPIRED','RELEASED')),
    CONSTRAINT CK_seat_holds_period CHECK (expires_at > held_at),
    CONSTRAINT FK_seat_holds_seats FOREIGN KEY (showtime_seat_id, showtime_id) REFERENCES dbo.showtime_seats (showtime_seat_id, showtime_id),
    CONSTRAINT FK_seat_holds_users FOREIGN KEY (user_id) REFERENCES dbo.users (user_id),
    CONSTRAINT FK_seat_holds_bookings FOREIGN KEY (booking_id, showtime_id) REFERENCES dbo.bookings (booking_id, showtime_id)
);
GO
CREATE UNIQUE INDEX UX_seat_holds_active_seat ON dbo.seat_holds (showtime_seat_id) WHERE hold_status = 'ACTIVE';
GO
CREATE INDEX IX_seat_holds_hold_token ON dbo.seat_holds (hold_token);
GO
CREATE INDEX IX_seat_holds_showtime_id ON dbo.seat_holds (showtime_id);
GO
CREATE INDEX IX_seat_holds_booking_id ON dbo.seat_holds (booking_id);
GO



CREATE TABLE dbo.booking_seats (
    booking_seat_id  BIGINT IDENTITY(1,1) NOT NULL,
    booking_id       BIGINT               NOT NULL,
    showtime_id      BIGINT               NOT NULL,
    showtime_seat_id BIGINT               NOT NULL,
    seat_price       DECIMAL(12,2)        NOT NULL,
    discount_amount  DECIMAL(12,2)        NOT NULL CONSTRAINT DF_booking_seats_discount_amount DEFAULT 0,
    final_price      DECIMAL(12,2)        NOT NULL,
    created_at       DATETIME2(0)         NOT NULL CONSTRAINT DF_booking_seats_created_at DEFAULT SYSUTCDATETIME(),
    released_at     DATETIME2(0)         NULL,
    CONSTRAINT PK_booking_seats PRIMARY KEY (booking_seat_id),
    CONSTRAINT CK_booking_seats_seat_price CHECK (seat_price >= 0),
    CONSTRAINT CK_booking_seats_discount_amount CHECK (discount_amount >= 0),
    CONSTRAINT CK_booking_seats_final_price CHECK (final_price >= 0),
    CONSTRAINT CK_booking_seats_amount_math CHECK (final_price = seat_price - discount_amount),
    CONSTRAINT FK_booking_seats_bookings FOREIGN KEY (booking_id, showtime_id) REFERENCES dbo.bookings (booking_id, showtime_id),
    CONSTRAINT FK_booking_seats_showtime_seats FOREIGN KEY (showtime_seat_id, showtime_id) REFERENCES dbo.showtime_seats (showtime_seat_id, showtime_id)
);
GO
CREATE UNIQUE INDEX UX_booking_seats_active_seat ON dbo.booking_seats (showtime_seat_id) WHERE released_at IS NULL;
GO
CREATE INDEX IX_booking_seats_booking_id ON dbo.booking_seats (booking_id);
GO


CREATE TABLE dbo.ticket_statuses (
    ticket_status_id SMALLINT IDENTITY(1,1) NOT NULL,
    status_code      VARCHAR(30)            NOT NULL,
    status_name      NVARCHAR(100)          NOT NULL,
    description      NVARCHAR(300)          NULL,
    is_terminal      BIT                    NOT NULL CONSTRAINT DF_ticket_statuses_is_terminal DEFAULT 0,
    is_active        BIT                    NOT NULL CONSTRAINT DF_ticket_statuses_is_active DEFAULT 1,
    CONSTRAINT PK_ticket_statuses PRIMARY KEY (ticket_status_id),
    CONSTRAINT UQ_ticket_statuses_status_code UNIQUE (status_code)
);
GO


CREATE TABLE dbo.tickets (
    ticket_id        BIGINT IDENTITY(1,1) NOT NULL,
    ticket_code      VARCHAR(40)          NOT NULL,
    booking_seat_id  BIGINT               NOT NULL,
    ticket_status_id SMALLINT             NOT NULL,
    qr_token_hash    VARCHAR(128)         NOT NULL,
    issued_at        DATETIME2(0)         NOT NULL CONSTRAINT DF_tickets_issued_at DEFAULT SYSDATETIME(),
    used_at          DATETIME2(0)         NULL,
    voided_at        DATETIME2(0)         NULL,
    created_at       DATETIME2(0)         NOT NULL CONSTRAINT DF_tickets_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_tickets PRIMARY KEY (ticket_id),
    CONSTRAINT UQ_tickets_ticket_code UNIQUE (ticket_code),
    CONSTRAINT UQ_tickets_booking_seat UNIQUE (booking_seat_id),
    CONSTRAINT UQ_tickets_qr_token_hash UNIQUE (qr_token_hash),
    CONSTRAINT FK_tickets_booking_seats FOREIGN KEY (booking_seat_id) REFERENCES dbo.booking_seats (booking_seat_id),
    CONSTRAINT FK_tickets_statuses FOREIGN KEY (ticket_status_id) REFERENCES dbo.ticket_statuses (ticket_status_id)
);
GO
CREATE INDEX IX_tickets_status_id ON dbo.tickets (ticket_status_id);
GO



CREATE TABLE dbo.ticket_validations (
    validation_id        BIGINT IDENTITY(1,1) NOT NULL,
    ticket_id            BIGINT               NULL,
    scanned_qr_hash      VARCHAR(128)         NULL,
    validated_by_user_id BIGINT               NULL,
    branch_id            BIGINT               NOT NULL,
    validation_result    VARCHAR(20)          NOT NULL,
    rejection_reason     NVARCHAR(300)        NULL,
    device_code          VARCHAR(50)          NULL,
    scanned_at           DATETIME2(0)         NOT NULL CONSTRAINT DF_ticket_validations_scanned_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_ticket_validations PRIMARY KEY (validation_id),
    CONSTRAINT CK_ticket_validations_result CHECK (
        (validation_result = 'ACCEPTED' AND ticket_id IS NOT NULL AND rejection_reason IS NULL)
        OR (validation_result = 'REJECTED' AND rejection_reason IS NOT NULL)
    ),
    CONSTRAINT CK_ticket_validations_identified CHECK (ticket_id IS NOT NULL OR scanned_qr_hash IS NOT NULL),
    CONSTRAINT FK_ticket_validations_tickets FOREIGN KEY (ticket_id) REFERENCES dbo.tickets (ticket_id),
    CONSTRAINT FK_ticket_validations_users FOREIGN KEY (validated_by_user_id) REFERENCES dbo.users (user_id),
    CONSTRAINT FK_ticket_validations_branches FOREIGN KEY (branch_id) REFERENCES dbo.branches (branch_id)
);
GO
CREATE INDEX IX_ticket_validations_ticket_time ON dbo.ticket_validations (ticket_id, scanned_at);
GO
CREATE INDEX IX_ticket_validations_branch_time ON dbo.ticket_validations (branch_id, scanned_at);
GO
CREATE INDEX IX_ticket_validations_qr_hash ON dbo.ticket_validations (scanned_qr_hash) WHERE scanned_qr_hash IS NOT NULL;
GO


CREATE TABLE dbo.booking_cancellations (
    cancellation_id      BIGINT IDENTITY(1,1) NOT NULL,
    booking_id           BIGINT               NOT NULL,
    requested_by_user_id BIGINT               NULL,
    processed_by_user_id BIGINT               NULL,
    cancellation_code    VARCHAR(40)          NOT NULL,
    cancellation_reason  NVARCHAR(1000)       NOT NULL,
    cancellation_status  VARCHAR(20)          NOT NULL,
    requested_at         DATETIME2(0)         NOT NULL CONSTRAINT DF_booking_cancellations_requested_at DEFAULT SYSDATETIME(),
    processed_at         DATETIME2(0)         NULL,
    staff_note           NVARCHAR(1000)       NULL,
    CONSTRAINT PK_booking_cancellations PRIMARY KEY (cancellation_id),
    CONSTRAINT UQ_booking_cancellations_code UNIQUE (cancellation_code),
    CONSTRAINT CK_booking_cancellations_status CHECK (cancellation_status IN ('PENDING','APPROVED','REJECTED','COMPLETED')),
    CONSTRAINT CK_booking_cancellations_processed CHECK (processed_at IS NULL OR processed_at >= requested_at),
    CONSTRAINT FK_booking_cancellations_bookings FOREIGN KEY (booking_id) REFERENCES dbo.bookings (booking_id),
    CONSTRAINT FK_booking_cancellations_requested_by FOREIGN KEY (requested_by_user_id) REFERENCES dbo.users (user_id),
    CONSTRAINT FK_booking_cancellations_processed_by FOREIGN KEY (processed_by_user_id) REFERENCES dbo.users (user_id)
);
GO
CREATE INDEX IX_booking_cancellations_booking_time ON dbo.booking_cancellations (booking_id, requested_at);
GO
CREATE INDEX IX_booking_cancellations_status ON dbo.booking_cancellations (cancellation_status);
GO


CREATE TABLE dbo.booking_audit_logs (
    audit_log_id  BIGINT IDENTITY(1,1) NOT NULL,
    booking_id    BIGINT               NULL,
    ticket_id     BIGINT               NULL,
    actor_user_id BIGINT               NULL,
    actor_type    VARCHAR(20)          NOT NULL,
    action_code   VARCHAR(50)          NOT NULL,
    old_values    NVARCHAR(MAX)        NULL,
    new_values    NVARCHAR(MAX)        NULL,
    ip_address    VARCHAR(45)          NULL,
    created_at    DATETIME2(0)         NOT NULL CONSTRAINT DF_booking_audit_logs_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_booking_audit_logs PRIMARY KEY (audit_log_id),
    CONSTRAINT CK_booking_audit_logs_actor_type CHECK (actor_type IN ('CUSTOMER','MANAGER','ADMIN','STAFF','SYSTEM')),
    CONSTRAINT CK_booking_audit_logs_old_json CHECK (old_values IS NULL OR ISJSON(old_values) = 1),
    CONSTRAINT CK_booking_audit_logs_new_json CHECK (new_values IS NULL OR ISJSON(new_values) = 1),
    CONSTRAINT FK_booking_audit_logs_bookings FOREIGN KEY (booking_id) REFERENCES dbo.bookings (booking_id),
    CONSTRAINT FK_booking_audit_logs_tickets FOREIGN KEY (ticket_id) REFERENCES dbo.tickets (ticket_id),
    CONSTRAINT FK_booking_audit_logs_actor FOREIGN KEY (actor_user_id) REFERENCES dbo.users (user_id)
);
GO
CREATE INDEX IX_booking_audit_logs_booking_time ON dbo.booking_audit_logs (booking_id, created_at);
GO
CREATE INDEX IX_booking_audit_logs_ticket_time ON dbo.booking_audit_logs (ticket_id, created_at);
GO
CREATE INDEX IX_booking_audit_logs_actor_time ON dbo.booking_audit_logs (actor_user_id, created_at);
GO

CREATE TRIGGER dbo.TRG_booking_audit_logs_append_only
ON dbo.booking_audit_logs
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 51030, N'booking_audit_logs chỉ được ghi thêm; không sửa hoặc xóa.', 1;
END
GO



CREATE PROCEDURE dbo.usp_showtime_hold_seats
    @showtime_id   BIGINT,
    @seat_ids_json NVARCHAR(MAX),
    @hold_token    UNIQUEIDENTIFIER,
    @session_id    UNIQUEIDENTIFIER,
    @user_id       BIGINT = NULL,
    @booking_id    BIGINT = NULL,
    @hold_minutes  SMALLINT = 10
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @hold_minutes <= 0 OR @hold_minutes > 120
        THROW 51041, N'Thời gian giữ ghế phải trong khoảng 1-120 phút.', 1;

    IF @seat_ids_json IS NULL OR ISJSON(@seat_ids_json) = 0
        THROW 51040, N'Danh sách ghế phải là mảng JSON hợp lệ.', 1;

    CREATE TABLE #requested (seat_id BIGINT NOT NULL PRIMARY KEY);

    INSERT INTO #requested (seat_id)
    SELECT CAST(value AS BIGINT)
    FROM OPENJSON(@seat_ids_json);

    IF NOT EXISTS (SELECT 1 FROM #requested)
        THROW 51040, N'Danh sách ghế không được rỗng.', 1;

    CREATE TABLE #targets (
        showtime_seat_id BIGINT NOT NULL PRIMARY KEY,
        seat_id          BIGINT NOT NULL,
        seat_status      VARCHAR(30) NOT NULL
    );

    BEGIN TRY
        BEGIN TRANSACTION;

        INSERT INTO #targets (showtime_seat_id, seat_id, seat_status)
        SELECT ss.showtime_seat_id, ss.seat_id, ss.seat_status
        FROM dbo.showtime_seats ss WITH (UPDLOCK, HOLDLOCK)
        JOIN #requested r ON r.seat_id = ss.seat_id
        WHERE ss.showtime_id = @showtime_id;

        IF (SELECT COUNT(*) FROM #targets) <> (SELECT COUNT(*) FROM #requested)
            THROW 51042, N'Có ghế không thuộc suất chiếu.', 1;

        IF EXISTS (SELECT 1 FROM #targets WHERE seat_status <> 'AVAILABLE')
            THROW 51043, N'Có ghế không còn trống.', 1;

        DECLARE @now_local DATETIME2(0) = SYSDATETIME();
        DECLARE @now_utc DATETIME2(0) = SYSUTCDATETIME();
        DECLARE @expires_at DATETIME2(0) = DATEADD(MINUTE, @hold_minutes, @now_local);

        UPDATE ss
        SET seat_status = 'HELD',
            hold_expires_at = @expires_at,
            held_by_session_id = @session_id,
            updated_at = @now_utc
        FROM dbo.showtime_seats ss
        JOIN #targets t ON t.showtime_seat_id = ss.showtime_seat_id
        WHERE ss.seat_status = 'AVAILABLE';

        IF @@ROWCOUNT <> (SELECT COUNT(*) FROM #targets)
            THROW 51044, N'Ghế vừa bị thay đổi bởi giao dịch khác.', 1;

        INSERT INTO dbo.seat_holds (
            hold_token, showtime_id, showtime_seat_id, user_id, session_id,
            booking_id, hold_status, held_at, expires_at
        )
        SELECT @hold_token, @showtime_id, t.showtime_seat_id, @user_id, @session_id,
               @booking_id, 'ACTIVE', @now_local, @expires_at
        FROM #targets t;

        COMMIT TRANSACTION;

        SELECT t.showtime_seat_id, t.seat_id
        FROM #targets t
        ORDER BY t.seat_id;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END
GO



CREATE PROCEDURE dbo.usp_ticket_validate
    @qr_token_hash        VARCHAR(128),
    @branch_id            BIGINT,
    @validated_by_user_id BIGINT = NULL,
    @device_code          VARCHAR(50) = NULL,
    @scan_at              DATETIME2(0) = NULL,
    @early_entry_minutes  SMALLINT = 30,
    @late_entry_minutes   SMALLINT = 0
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @qr_token_hash IS NULL OR LTRIM(RTRIM(@qr_token_hash)) = ''
        THROW 51050, N'Mã QR không được để trống.', 1;

    IF @early_entry_minutes < 0 OR @late_entry_minutes < 0
        THROW 51051, N'Khung thời gian vào rạp không hợp lệ.', 1;

    SET @scan_at = COALESCE(@scan_at, SYSDATETIME());

    DECLARE @issued_status_id SMALLINT =
        (SELECT ticket_status_id FROM dbo.ticket_statuses WHERE status_code = 'ISSUED');
    DECLARE @used_status_id SMALLINT =
        (SELECT ticket_status_id FROM dbo.ticket_statuses WHERE status_code = 'USED');
    IF @issued_status_id IS NULL OR @used_status_id IS NULL
        THROW 51052, N'Chưa cấu hình trạng thái vé ISSUED/USED.', 1;

    DECLARE @ticket_id BIGINT,
            @ticket_status_code VARCHAR(30),
            @showtime_branch_id BIGINT,
            @showtime_start_at DATETIME2(0),
            @showtime_end_at DATETIME2(0);

    DECLARE @result VARCHAR(20) = 'REJECTED';
    DECLARE @reason NVARCHAR(300);

    BEGIN TRY
        BEGIN TRANSACTION;

        SELECT @ticket_id = t.ticket_id,
               @ticket_status_code = ts.status_code,
               @showtime_branch_id = b.branch_id,
               @showtime_start_at = s.start_at,
               @showtime_end_at = s.end_at
        FROM dbo.tickets t WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.ticket_statuses ts ON ts.ticket_status_id = t.ticket_status_id
        JOIN dbo.booking_seats bs ON bs.booking_seat_id = t.booking_seat_id
        JOIN dbo.bookings b ON b.booking_id = bs.booking_id
        JOIN dbo.showtimes s ON s.showtime_id = b.showtime_id
        WHERE t.qr_token_hash = @qr_token_hash;

        IF @ticket_id IS NULL
            SET @reason = N'Vé không tồn tại';
        ELSE IF @ticket_status_code <> 'ISSUED'
            SET @reason = CASE @ticket_status_code
                WHEN 'USED' THEN N'Vé đã sử dụng'
                WHEN 'VOIDED' THEN N'Vé đã bị vô hiệu hóa'
                ELSE N'Vé không còn hiệu lực'
            END;
        ELSE IF @showtime_branch_id <> @branch_id
            SET @reason = N'Vé thuộc chi nhánh khác';
        ELSE IF @scan_at < DATEADD(MINUTE, -@early_entry_minutes, @showtime_start_at)
             OR @scan_at > DATEADD(MINUTE, @late_entry_minutes, @showtime_end_at)
            SET @reason = N'Ngoài thời gian cho phép vào rạp';
        ELSE
        BEGIN
            UPDATE dbo.tickets
            SET ticket_status_id = @used_status_id,
                used_at = @scan_at
            WHERE ticket_id = @ticket_id
              AND ticket_status_id = @issued_status_id;

            IF @@ROWCOUNT = 1
            BEGIN
                SET @result = 'ACCEPTED';
                SET @reason = NULL;
            END
            ELSE
                SET @reason = N'Vé đã được sử dụng bởi giao dịch khác';
        END;

        INSERT INTO dbo.ticket_validations (
            ticket_id, scanned_qr_hash, validated_by_user_id, branch_id,
            validation_result, rejection_reason, device_code, scanned_at
        )
        VALUES (
            @ticket_id, @qr_token_hash, @validated_by_user_id, @branch_id,
            @result, @reason, @device_code, @scan_at
        );

        COMMIT TRANSACTION;

        SELECT @ticket_id AS ticket_id, @result AS validation_result, @reason AS rejection_reason;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END
GO




CREATE TABLE dbo.fnb_categories (
    category_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_fnb_categories PRIMARY KEY,
    parent_category_id BIGINT NULL REFERENCES dbo.fnb_categories (category_id),
    category_code VARCHAR(30) NOT NULL CONSTRAINT UQ_fnb_categories_code UNIQUE,
    category_name NVARCHAR(100) NOT NULL,
    description NVARCHAR(500) NULL,
    display_order SMALLINT NOT NULL DEFAULT 0,
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2(0) NULL
);
GO
CREATE TRIGGER dbo.TRG_fnb_categories_no_cycle ON dbo.fnb_categories
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @cycle BIT = 0;
    ;WITH ancestors AS (
        SELECT category_id AS origin_id, parent_category_id AS ancestor_id FROM inserted
        UNION ALL
        SELECT a.origin_id, c.parent_category_id
        FROM ancestors a
        JOIN dbo.fnb_categories c WITH (UPDLOCK, HOLDLOCK) ON c.category_id = a.ancestor_id
        WHERE a.ancestor_id <> a.origin_id
    )
    SELECT @cycle = 1 FROM ancestors WHERE origin_id = ancestor_id OPTION (MAXRECURSION 0);
    IF @cycle = 1 THROW 52400, N'Danh mục không được tạo vòng lặp.', 1;
END;
GO
CREATE TABLE dbo.fnb_products (
    product_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_fnb_products PRIMARY KEY,
    category_id BIGINT NOT NULL REFERENCES dbo.fnb_categories (category_id),
    product_code VARCHAR(40) NOT NULL CONSTRAINT UQ_fnb_products_code UNIQUE,
    product_name NVARCHAR(150) NOT NULL,
    description NVARCHAR(1000) NULL,
    image_url NVARCHAR(500) NULL,
    unit_name NVARCHAR(30) NOT NULL,
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2(0) NULL
);
GO
CREATE TABLE dbo.fnb_product_variants (
    variant_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_fnb_product_variants PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES dbo.fnb_products (product_id),
    variant_code VARCHAR(50) NOT NULL CONSTRAINT UQ_fnb_product_variants_code UNIQUE,
    variant_name NVARCHAR(100) NOT NULL,
    barcode VARCHAR(100) NULL,
    size_label NVARCHAR(30) NULL,
    volume_ml INT NULL CHECK (volume_ml > 0),
    weight_gram INT NULL CHECK (weight_gram > 0),
    is_default BIT NOT NULL DEFAULT 0,
    is_stock_tracked BIT NOT NULL DEFAULT 1,
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME()
);
GO
CREATE UNIQUE INDEX UX_fnb_product_variants_barcode ON dbo.fnb_product_variants (barcode) WHERE barcode IS NOT NULL;
GO
CREATE UNIQUE INDEX UX_fnb_product_variants_default ON dbo.fnb_product_variants (product_id) WHERE is_default = 1;
GO
CREATE TABLE dbo.fnb_branch_products (
    branch_product_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_fnb_branch_products PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES dbo.branches (branch_id),
    variant_id BIGINT NOT NULL REFERENCES dbo.fnb_product_variants (variant_id),
    selling_price DECIMAL(14,2) NOT NULL CHECK (selling_price >= 0),
    is_available BIT NOT NULL DEFAULT 1,
    available_from DATETIME2(0) NULL,
    available_until DATETIME2(0) NULL,
    created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2(0) NULL,
    CONSTRAINT UQ_fnb_branch_products_variant UNIQUE (branch_id, variant_id),
    CONSTRAINT UQ_fnb_branch_products_id_branch UNIQUE (branch_product_id, branch_id),
    CONSTRAINT CK_fnb_branch_products_dates CHECK (available_until > available_from)
);
GO
CREATE TABLE dbo.fnb_combos (
    combo_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_fnb_combos PRIMARY KEY,
    branch_id BIGINT NOT NULL REFERENCES dbo.branches (branch_id),
    combo_code VARCHAR(40) NOT NULL,
    combo_name NVARCHAR(150) NOT NULL,
    description NVARCHAR(500) NULL,
    image_url NVARCHAR(500) NULL,
    combo_price DECIMAL(14,2) NOT NULL CHECK (combo_price >= 0),
    is_active BIT NOT NULL DEFAULT 0,
    valid_from DATETIME2(0) NULL,
    valid_until DATETIME2(0) NULL,
    created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_fnb_combos_code UNIQUE (branch_id, combo_code),
    CONSTRAINT UQ_fnb_combos_id_branch UNIQUE (combo_id, branch_id),
    CONSTRAINT CK_fnb_combos_dates CHECK (valid_until > valid_from)
);
GO
CREATE TABLE dbo.fnb_combo_items (
    combo_item_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_fnb_combo_items PRIMARY KEY,
    combo_id BIGINT NOT NULL,
    branch_product_id BIGINT NOT NULL,
    branch_id BIGINT NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_fnb_combo_items_product UNIQUE (combo_id, branch_product_id),
    CONSTRAINT FK_fnb_combo_items_combo FOREIGN KEY (combo_id, branch_id)
        REFERENCES dbo.fnb_combos (combo_id, branch_id),
    CONSTRAINT FK_fnb_combo_items_product FOREIGN KEY (branch_product_id, branch_id)
        REFERENCES dbo.fnb_branch_products (branch_product_id, branch_id)
);
GO
CREATE TRIGGER dbo.TRG_fnb_combos_nonempty ON dbo.fnb_combos
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM inserted c WHERE c.is_active = 1
               AND NOT EXISTS (SELECT 1 FROM dbo.fnb_combo_items i WITH (UPDLOCK, HOLDLOCK) WHERE i.combo_id = c.combo_id))
        THROW 52401, N'Combo đang bán phải có ít nhất một món.', 1;
END;
GO
CREATE TRIGGER dbo.TRG_fnb_combo_items_nonempty ON dbo.fnb_combo_items
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted d
               JOIN dbo.fnb_combos c WITH (UPDLOCK, HOLDLOCK) ON c.combo_id = d.combo_id
               WHERE c.is_active = 1
               AND NOT EXISTS (SELECT 1 FROM dbo.fnb_combo_items i WITH (UPDLOCK, HOLDLOCK) WHERE i.combo_id = c.combo_id))
        THROW 52401, N'Combo đang bán phải có ít nhất một món.', 1;
END;
GO
CREATE TABLE dbo.fnb_orders (
    fnb_order_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_fnb_orders PRIMARY KEY,
    order_code VARCHAR(40) NOT NULL CONSTRAINT UQ_fnb_orders_code UNIQUE,
    customer_id BIGINT NULL REFERENCES dbo.users (user_id),
    handled_by_user_id BIGINT NULL REFERENCES dbo.users (user_id),
    branch_id BIGINT NOT NULL REFERENCES dbo.branches (branch_id),
    booking_id BIGINT NULL,
    fulfillment_type VARCHAR(10) NOT NULL CHECK (fulfillment_type IN ('IMMEDIATE','SCHEDULED')),
    order_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (order_status IN ('PENDING','PAID','PREPARING','READY','COMPLETED','CANCELLED')),
    subtotal DECIMAL(14,2) NOT NULL CHECK (subtotal >= 0),
    discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    total_amount DECIMAL(14,2) NOT NULL CHECK (total_amount >= 0),
    currency_code CHAR(3) NOT NULL DEFAULT 'VND',
    customer_note NVARCHAR(500) NULL,
    pickup_code VARCHAR(20) NULL,
    pickup_at DATETIME2(0) NULL,
    created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_fnb_orders_id_booking UNIQUE (fnb_order_id, booking_id),
    CONSTRAINT UQ_fnb_orders_id_branch UNIQUE (fnb_order_id, branch_id),
    CONSTRAINT FK_fnb_orders_booking FOREIGN KEY (booking_id, branch_id) REFERENCES dbo.bookings (booking_id, branch_id),
    CONSTRAINT CK_fnb_orders_amount CHECK (total_amount = subtotal - discount_amount),
    CONSTRAINT CK_fnb_orders_pickup CHECK ((fulfillment_type = 'SCHEDULED' AND pickup_at IS NOT NULL)
                                          OR (fulfillment_type = 'IMMEDIATE' AND pickup_at IS NULL))
);
GO
CREATE UNIQUE INDEX UX_fnb_orders_booking ON dbo.fnb_orders (booking_id) WHERE booking_id IS NOT NULL;
GO
CREATE TABLE dbo.fnb_order_items (
    order_item_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_fnb_order_items PRIMARY KEY,
    fnb_order_id BIGINT NOT NULL,
    branch_id BIGINT NOT NULL,
    line_number INT NOT NULL CHECK (line_number > 0),
    branch_product_id BIGINT NULL,
    combo_id BIGINT NULL,
    item_name_snapshot NVARCHAR(150) NOT NULL,
    item_code_snapshot VARCHAR(50) NOT NULL,
    unit_price DECIMAL(14,2) NOT NULL CHECK (unit_price >= 0),
    quantity INT NOT NULL CHECK (quantity > 0),
    discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    line_total AS CONVERT(DECIMAL(14,2), unit_price * quantity - discount_amount) PERSISTED,
    CONSTRAINT CK_fnb_order_items_amount CHECK (line_total >= 0),
    CONSTRAINT CK_fnb_order_items_kind CHECK ((branch_product_id IS NULL AND combo_id IS NOT NULL)
                                             OR (branch_product_id IS NOT NULL AND combo_id IS NULL)),
    CONSTRAINT UQ_fnb_order_items_line UNIQUE (fnb_order_id, line_number),
    CONSTRAINT FK_fnb_order_items_order FOREIGN KEY (fnb_order_id, branch_id) REFERENCES dbo.fnb_orders (fnb_order_id, branch_id),
    CONSTRAINT FK_fnb_order_items_product FOREIGN KEY (branch_product_id, branch_id)
        REFERENCES dbo.fnb_branch_products (branch_product_id, branch_id),
    CONSTRAINT FK_fnb_order_items_combo FOREIGN KEY (combo_id, branch_id)
        REFERENCES dbo.fnb_combos (combo_id, branch_id)
);
GO













CREATE TABLE dbo.payment_methods (
    payment_method_id INT IDENTITY(1,1) NOT NULL,
    method_code       VARCHAR(30)  NOT NULL,
    method_name       NVARCHAR(100) NOT NULL,
    description       NVARCHAR(500) NULL,
    is_online         BIT NOT NULL CONSTRAINT DF_payment_methods_is_online DEFAULT 0,
    requires_provider BIT NOT NULL CONSTRAINT DF_payment_methods_requires_provider DEFAULT 0,
    is_active         BIT NOT NULL CONSTRAINT DF_payment_methods_is_active DEFAULT 1,
    display_order     INT NOT NULL CONSTRAINT DF_payment_methods_display_order DEFAULT 0,
    created_at        DATETIME2(0) NOT NULL CONSTRAINT DF_payment_methods_created_at DEFAULT SYSUTCDATETIME(),
    updated_at        DATETIME2(0) NOT NULL CONSTRAINT DF_payment_methods_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_payment_methods PRIMARY KEY (payment_method_id),
    CONSTRAINT UQ_payment_methods_method_code UNIQUE (method_code),
    CONSTRAINT CK_payment_methods_display_order CHECK (display_order >= 0)
);
GO
CREATE INDEX IX_payment_methods_active_order ON dbo.payment_methods (is_active, display_order);
GO


CREATE TABLE dbo.payment_providers (
    provider_id   INT IDENTITY(1,1) NOT NULL,
    provider_code VARCHAR(30) NOT NULL,
    provider_name NVARCHAR(100) NOT NULL,
    provider_type VARCHAR(30) NOT NULL,
    api_base_url  NVARCHAR(500) NULL,
    callback_url  NVARCHAR(500) NULL,
    configuration NVARCHAR(MAX) NULL,
    is_active     BIT NOT NULL CONSTRAINT DF_payment_providers_is_active DEFAULT 1,
    created_at    DATETIME2(0) NOT NULL CONSTRAINT DF_payment_providers_created_at DEFAULT SYSUTCDATETIME(),
    updated_at    DATETIME2(0) NOT NULL CONSTRAINT DF_payment_providers_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_payment_providers PRIMARY KEY (provider_id),
    CONSTRAINT UQ_payment_providers_code UNIQUE (provider_code),
    CONSTRAINT CK_payment_providers_type CHECK (provider_type IN ('GATEWAY','BANK','WALLET')),
    CONSTRAINT CK_payment_providers_config_json CHECK (configuration IS NULL OR ISJSON(configuration) = 1)
);
GO
CREATE INDEX IX_payment_providers_active_type ON dbo.payment_providers (is_active, provider_type);
GO


CREATE TABLE dbo.payment_transactions (
    payment_transaction_id  BIGINT IDENTITY(1,1) NOT NULL,
    payment_code            VARCHAR(50) NOT NULL,
    booking_id              BIGINT NULL,
    fnb_order_id            BIGINT NULL,
    payment_method_id       INT NOT NULL,
    provider_id             INT NULL,
    amount                  DECIMAL(18,2) NOT NULL,
    currency_code           CHAR(3) NOT NULL CONSTRAINT DF_payment_transactions_currency_code DEFAULT 'VND',
    status                  VARCHAR(20) NOT NULL CONSTRAINT DF_payment_transactions_status DEFAULT 'PENDING',
    idempotency_key         VARCHAR(100) NOT NULL,
    provider_transaction_id VARCHAR(150) NULL,
    paid_at                 DATETIME2(0) NULL,
    expired_at              DATETIME2(0) NULL,
    created_at              DATETIME2(0) NOT NULL CONSTRAINT DF_payment_transactions_created_at DEFAULT SYSUTCDATETIME(),
    updated_at              DATETIME2(0) NOT NULL CONSTRAINT DF_payment_transactions_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_payment_transactions PRIMARY KEY (payment_transaction_id),
    CONSTRAINT UQ_payment_transactions_code UNIQUE (payment_code),
    CONSTRAINT UQ_payment_transactions_idempotency UNIQUE (idempotency_key),
    CONSTRAINT CK_payment_transactions_order CHECK (booking_id IS NOT NULL OR fnb_order_id IS NOT NULL),
    CONSTRAINT UQ_payment_transactions_id_provider UNIQUE (payment_transaction_id, provider_id),
    CONSTRAINT CK_payment_transactions_amount CHECK (amount > 0),
    CONSTRAINT CK_payment_transactions_currency CHECK (LTRIM(RTRIM(currency_code)) <> ''),
    CONSTRAINT CK_payment_transactions_status CHECK (status IN ('PENDING','PROCESSING','SUCCESS','FAILED','EXPIRED','CANCELLED')),
    CONSTRAINT CK_payment_transactions_paid CHECK (status <> 'SUCCESS' OR paid_at IS NOT NULL),
    CONSTRAINT CK_payment_transactions_expired CHECK (status <> 'EXPIRED' OR expired_at IS NOT NULL),
    CONSTRAINT CK_payment_transactions_provider_txn CHECK (provider_transaction_id IS NULL OR provider_id IS NOT NULL),
    CONSTRAINT FK_payment_transactions_bookings FOREIGN KEY (booking_id) REFERENCES dbo.bookings (booking_id),
    CONSTRAINT FK_payment_transactions_fnb_order FOREIGN KEY (fnb_order_id) REFERENCES dbo.fnb_orders (fnb_order_id),
    CONSTRAINT FK_payment_transactions_fnb_booking FOREIGN KEY (fnb_order_id, booking_id)
        REFERENCES dbo.fnb_orders (fnb_order_id, booking_id),
    CONSTRAINT FK_payment_transactions_methods FOREIGN KEY (payment_method_id) REFERENCES dbo.payment_methods (payment_method_id),
    CONSTRAINT FK_payment_transactions_providers FOREIGN KEY (provider_id) REFERENCES dbo.payment_providers (provider_id)
);
GO
CREATE UNIQUE INDEX UX_payment_transactions_booking ON dbo.payment_transactions (booking_id) WHERE booking_id IS NOT NULL;
GO
CREATE UNIQUE INDEX UX_payment_transactions_fnb_order ON dbo.payment_transactions (fnb_order_id) WHERE fnb_order_id IS NOT NULL;
GO
CREATE UNIQUE INDEX UX_payment_transactions_provider_txn
ON dbo.payment_transactions (provider_id, provider_transaction_id)
WHERE provider_transaction_id IS NOT NULL AND provider_id IS NOT NULL;
GO
CREATE INDEX IX_payment_transactions_status_created ON dbo.payment_transactions (status, created_at);
GO
CREATE INDEX IX_payment_transactions_provider_paid ON dbo.payment_transactions (provider_id, paid_at);
GO


CREATE TABLE dbo.payment_attempts (
    payment_attempt_id     BIGINT IDENTITY(1,1) NOT NULL,
    payment_transaction_id BIGINT NOT NULL,
    attempt_number         INT NOT NULL,
    provider_reference     VARCHAR(150) NULL,
    request_reference      VARCHAR(100) NULL,
    amount                 DECIMAL(18,2) NOT NULL,
    status                 VARCHAR(20) NOT NULL,
    error_code             VARCHAR(100) NULL,
    error_message          NVARCHAR(500) NULL,
    started_at             DATETIME2(0) NOT NULL CONSTRAINT DF_payment_attempts_started_at DEFAULT SYSDATETIME(),
    completed_at           DATETIME2(0) NULL,
    CONSTRAINT PK_payment_attempts PRIMARY KEY (payment_attempt_id),
    CONSTRAINT UQ_payment_attempts_transaction_number UNIQUE (payment_transaction_id, attempt_number),
    CONSTRAINT CK_payment_attempts_number CHECK (attempt_number > 0),
    CONSTRAINT CK_payment_attempts_amount CHECK (amount > 0),
    CONSTRAINT CK_payment_attempts_status CHECK (status IN ('PENDING','PROCESSING','SUCCESS','FAILED','TIMEOUT','CANCELLED')),
    CONSTRAINT CK_payment_attempts_completed CHECK (
        (status IN ('SUCCESS','FAILED','TIMEOUT','CANCELLED') AND completed_at IS NOT NULL)
        OR (status IN ('PENDING','PROCESSING') AND completed_at IS NULL)
    ),
    CONSTRAINT CK_payment_attempts_period CHECK (completed_at IS NULL OR completed_at >= started_at),
    CONSTRAINT FK_payment_attempts_transactions FOREIGN KEY (payment_transaction_id) REFERENCES dbo.payment_transactions (payment_transaction_id)
);
GO
CREATE UNIQUE INDEX UX_payment_attempts_success ON dbo.payment_attempts (payment_transaction_id) WHERE status = 'SUCCESS';
GO
CREATE UNIQUE INDEX UX_payment_attempts_pending ON dbo.payment_attempts (payment_transaction_id) WHERE status = 'PENDING';
GO
CREATE UNIQUE INDEX UX_payment_attempts_processing ON dbo.payment_attempts (payment_transaction_id) WHERE status = 'PROCESSING';
GO
CREATE INDEX IX_payment_attempts_status_started ON dbo.payment_attempts (status, started_at);
GO


CREATE TABLE dbo.payment_provider_events (
    event_id                BIGINT IDENTITY(1,1) NOT NULL,
    provider_id             INT NOT NULL,
    payment_transaction_id  BIGINT NULL,
    provider_event_id       VARCHAR(150) NULL,
    event_type              VARCHAR(100) NOT NULL,
    event_payload           NVARCHAR(MAX) NOT NULL,
    signature_valid         BIT NULL,
    processing_status       VARCHAR(20) NOT NULL,
    received_at             DATETIME2(0) NOT NULL CONSTRAINT DF_payment_provider_events_received_at DEFAULT SYSDATETIME(),
    processed_at            DATETIME2(0) NULL,
    error_message           NVARCHAR(1000) NULL,
    CONSTRAINT PK_payment_provider_events PRIMARY KEY (event_id),
    CONSTRAINT CK_payment_provider_events_payload CHECK (ISJSON(event_payload) = 1),
    CONSTRAINT CK_payment_provider_events_status CHECK (processing_status IN ('RECEIVED','PROCESSING','PROCESSED','FAILED','IGNORED')),
    CONSTRAINT CK_payment_provider_events_signature CHECK (
        processing_status <> 'PROCESSED' OR ISNULL(signature_valid, 0) = 1
    ),
    CONSTRAINT CK_payment_provider_events_processed CHECK (
        (processing_status IN ('PROCESSED','FAILED','IGNORED') AND processed_at IS NOT NULL)
        OR (processing_status IN ('RECEIVED','PROCESSING') AND processed_at IS NULL)
    ),
    CONSTRAINT CK_payment_provider_events_period CHECK (processed_at IS NULL OR processed_at >= received_at),
    CONSTRAINT FK_payment_provider_events_providers FOREIGN KEY (provider_id) REFERENCES dbo.payment_providers (provider_id),
    CONSTRAINT FK_payment_provider_events_transactions FOREIGN KEY (payment_transaction_id, provider_id) REFERENCES dbo.payment_transactions (payment_transaction_id, provider_id)
);
GO
CREATE UNIQUE INDEX UX_payment_provider_events_provider_event
ON dbo.payment_provider_events (provider_id, provider_event_id)
WHERE provider_event_id IS NOT NULL;
GO
CREATE INDEX IX_payment_provider_events_transaction ON dbo.payment_provider_events (payment_transaction_id, received_at);
GO
CREATE INDEX IX_payment_provider_events_status ON dbo.payment_provider_events (processing_status, received_at);
GO
CREATE TRIGGER dbo.TRG_payment_provider_events_no_delete
ON dbo.payment_provider_events
INSTEAD OF DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 51110, N'payment_provider_events chỉ được ghi thêm; không xóa.', 1;
END
GO


CREATE TABLE dbo.reconciliation_batches (
    reconciliation_batch_id BIGINT IDENTITY(1,1) NOT NULL,
    batch_code              VARCHAR(50) NOT NULL,
    provider_id             INT NULL,
    branch_id               BIGINT NULL,
    period_start            DATETIME2(0) NOT NULL,
    period_end              DATETIME2(0) NOT NULL,
    total_system_amount     DECIMAL(18,2) NOT NULL CONSTRAINT DF_reconciliation_batches_system DEFAULT 0,
    total_provider_amount   DECIMAL(18,2) NOT NULL CONSTRAINT DF_reconciliation_batches_provider DEFAULT 0,
    difference_amount       DECIMAL(18,2) NOT NULL CONSTRAINT DF_reconciliation_batches_difference DEFAULT 0,
    status                  VARCHAR(20) NOT NULL,
    created_by_user_id      BIGINT NOT NULL,
    created_at              DATETIME2(0) NOT NULL CONSTRAINT DF_reconciliation_batches_created_at DEFAULT SYSUTCDATETIME(),
    completed_at            DATETIME2(0) NULL,
    CONSTRAINT PK_reconciliation_batches PRIMARY KEY (reconciliation_batch_id),
    CONSTRAINT UQ_reconciliation_batches_code UNIQUE (batch_code),
    CONSTRAINT CK_reconciliation_batches_period CHECK (period_end > period_start),
    CONSTRAINT CK_reconciliation_batches_totals CHECK (total_system_amount >= 0 AND total_provider_amount >= 0),
    CONSTRAINT CK_reconciliation_batches_difference CHECK (difference_amount = total_system_amount - total_provider_amount),
    CONSTRAINT CK_reconciliation_batches_status CHECK (status IN ('PENDING','PROCESSING','MATCHED','DISCREPANCY','COMPLETED','FAILED')),
    CONSTRAINT FK_reconciliation_batches_providers FOREIGN KEY (provider_id) REFERENCES dbo.payment_providers (provider_id),
    CONSTRAINT FK_reconciliation_batches_branches FOREIGN KEY (branch_id) REFERENCES dbo.branches (branch_id),
    CONSTRAINT FK_reconciliation_batches_created_by FOREIGN KEY (created_by_user_id) REFERENCES dbo.users (user_id)
);
GO
CREATE INDEX IX_reconciliation_batches_scope_period ON dbo.reconciliation_batches (provider_id, branch_id, period_start);
GO
CREATE INDEX IX_reconciliation_batches_status ON dbo.reconciliation_batches (status, created_at);
GO


CREATE TABLE dbo.reconciliation_items (
    reconciliation_item_id   BIGINT IDENTITY(1,1) NOT NULL,
    reconciliation_batch_id  BIGINT NOT NULL,
    payment_transaction_id   BIGINT NULL,
    provider_transaction_id  VARCHAR(150) NULL,
    system_amount            DECIMAL(18,2) NULL,
    provider_amount          DECIMAL(18,2) NULL,
    difference_amount        DECIMAL(18,2) NULL,
    match_status             VARCHAR(20) NOT NULL,
    note                     NVARCHAR(500) NULL,
    resolved_by_user_id      BIGINT NULL,
    resolved_at              DATETIME2(0) NULL,
    CONSTRAINT PK_reconciliation_items PRIMARY KEY (reconciliation_item_id),
    CONSTRAINT CK_reconciliation_items_status CHECK (match_status IN ('MATCHED','AMOUNT_MISMATCH','MISSING_IN_PROVIDER','MISSING_IN_SYSTEM','DUPLICATE','PENDING_REVIEW','RESOLVED')),
    CONSTRAINT CK_reconciliation_items_amounts CHECK (
        (system_amount IS NULL OR system_amount >= 0)
        AND (provider_amount IS NULL OR provider_amount >= 0)
    ),
    CONSTRAINT CK_reconciliation_items_difference CHECK (
        difference_amount IS NULL OR (
            system_amount IS NOT NULL
            AND provider_amount IS NOT NULL
            AND difference_amount = system_amount - provider_amount
        )
    ),
    CONSTRAINT CK_reconciliation_items_match CHECK (
        (match_status <> 'MATCHED' OR (
            system_amount IS NOT NULL AND provider_amount IS NOT NULL
            AND system_amount = provider_amount
            AND difference_amount IS NOT NULL AND difference_amount = 0
        ))
        AND (match_status <> 'AMOUNT_MISMATCH' OR (
            system_amount IS NOT NULL AND provider_amount IS NOT NULL
            AND system_amount <> provider_amount
        ))
        AND (match_status <> 'MISSING_IN_PROVIDER' OR (
            system_amount IS NOT NULL AND provider_amount IS NULL
        ))
        AND (match_status <> 'MISSING_IN_SYSTEM' OR (
            system_amount IS NULL AND provider_amount IS NOT NULL
        ))
        AND (match_status <> 'RESOLVED' OR (
            resolved_by_user_id IS NOT NULL AND resolved_at IS NOT NULL
        ))
    ),
    CONSTRAINT FK_reconciliation_items_batches FOREIGN KEY (reconciliation_batch_id) REFERENCES dbo.reconciliation_batches (reconciliation_batch_id),
    CONSTRAINT FK_reconciliation_items_transactions FOREIGN KEY (payment_transaction_id) REFERENCES dbo.payment_transactions (payment_transaction_id),
    CONSTRAINT FK_reconciliation_items_resolved_by FOREIGN KEY (resolved_by_user_id) REFERENCES dbo.users (user_id)
);
GO
CREATE UNIQUE INDEX UX_reconciliation_items_transaction
ON dbo.reconciliation_items (reconciliation_batch_id, payment_transaction_id)
WHERE payment_transaction_id IS NOT NULL;
GO
CREATE UNIQUE INDEX UX_reconciliation_items_provider_txn
ON dbo.reconciliation_items (reconciliation_batch_id, provider_transaction_id)
WHERE provider_transaction_id IS NOT NULL;
GO
CREATE INDEX IX_reconciliation_items_batch_status ON dbo.reconciliation_items (reconciliation_batch_id, match_status);
GO


CREATE TABLE dbo.cash_register_sessions (
    cash_register_session_id BIGINT IDENTITY(1,1) NOT NULL,
    branch_id                BIGINT NOT NULL,
    cashier_user_id          BIGINT NOT NULL,
    opened_by_user_id        BIGINT NOT NULL,
    closed_by_user_id        BIGINT NULL,
    opening_cash             DECIMAL(18,2) NOT NULL,
    expected_cash            DECIMAL(18,2) NULL,
    counted_cash             DECIMAL(18,2) NULL,
    cash_difference          DECIMAL(18,2) NULL,
    status                   VARCHAR(20) NOT NULL CONSTRAINT DF_cash_register_sessions_status DEFAULT 'OPEN',
    opened_at                DATETIME2(0) NOT NULL CONSTRAINT DF_cash_register_sessions_opened_at DEFAULT SYSDATETIME(),
    closed_at                DATETIME2(0) NULL,
    note                     NVARCHAR(500) NULL,
    CONSTRAINT PK_cash_register_sessions PRIMARY KEY (cash_register_session_id),
    CONSTRAINT CK_cash_register_sessions_opening CHECK (opening_cash >= 0),
    CONSTRAINT CK_cash_register_sessions_expected CHECK (expected_cash IS NULL OR expected_cash >= 0),
    CONSTRAINT CK_cash_register_sessions_counted CHECK (counted_cash IS NULL OR counted_cash >= 0),
    CONSTRAINT CK_cash_register_sessions_status CHECK (status IN ('OPEN','CLOSED','CANCELLED')),
    CONSTRAINT CK_cash_register_sessions_closed CHECK (
        (status = 'OPEN' AND closed_at IS NULL AND closed_by_user_id IS NULL
            AND expected_cash IS NULL AND counted_cash IS NULL AND cash_difference IS NULL)
        OR (status = 'CLOSED' AND closed_at IS NOT NULL AND closed_by_user_id IS NOT NULL
            AND expected_cash IS NOT NULL AND counted_cash IS NOT NULL AND cash_difference IS NOT NULL)
        OR (status = 'CANCELLED' AND closed_at IS NOT NULL)
    ),
    CONSTRAINT CK_cash_register_sessions_difference CHECK (
        cash_difference IS NULL OR (
            expected_cash IS NOT NULL AND counted_cash IS NOT NULL
            AND cash_difference = counted_cash - expected_cash
        )
    ),
    CONSTRAINT CK_cash_register_sessions_period CHECK (closed_at IS NULL OR closed_at >= opened_at),
    CONSTRAINT FK_cash_register_sessions_branches FOREIGN KEY (branch_id) REFERENCES dbo.branches (branch_id),
    CONSTRAINT FK_cash_register_sessions_cashier FOREIGN KEY (cashier_user_id) REFERENCES dbo.users (user_id),
    CONSTRAINT FK_cash_register_sessions_opened_by FOREIGN KEY (opened_by_user_id) REFERENCES dbo.users (user_id),
    CONSTRAINT FK_cash_register_sessions_closed_by FOREIGN KEY (closed_by_user_id) REFERENCES dbo.users (user_id)
);
GO
CREATE UNIQUE INDEX UX_cash_register_sessions_open
ON dbo.cash_register_sessions (branch_id, cashier_user_id)
WHERE status = 'OPEN';
GO
CREATE INDEX IX_cash_register_sessions_branch_time ON dbo.cash_register_sessions (branch_id, opened_at);
GO
CREATE INDEX IX_cash_register_sessions_cashier_status ON dbo.cash_register_sessions (cashier_user_id, status);
GO

ALTER TABLE dbo.payment_transactions
ADD cash_register_session_id BIGINT NULL;
GO
ALTER TABLE dbo.payment_transactions
ADD CONSTRAINT FK_payment_transactions_cash_sessions
FOREIGN KEY (cash_register_session_id) REFERENCES dbo.cash_register_sessions (cash_register_session_id);
GO
CREATE INDEX IX_payment_transactions_cash_session
ON dbo.payment_transactions (cash_register_session_id, status);
GO



CREATE PROCEDURE dbo.usp_payment_create
    @booking_id               BIGINT = NULL,
    @payment_method_id        INT,
    @idempotency_key          VARCHAR(100),
    @provider_id              INT = NULL,
    @cash_register_session_id BIGINT = NULL,
    @fnb_order_id             BIGINT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @idempotency_key IS NULL OR LTRIM(RTRIM(@idempotency_key)) = ''
        THROW 52100, N'idempotency_key không được để trống.', 1;
    IF (@booking_id IS NULL AND @fnb_order_id IS NULL)
       OR (@booking_id IS NOT NULL AND @fnb_order_id IS NOT NULL)
        THROW 52100, N'Chỉ định booking hoặc đơn F&B độc lập. Món trong booking được tự động tính.', 1;

    DECLARE @existing_transaction_id BIGINT,
            @existing_booking_id BIGINT,
            @existing_fnb_order_id BIGINT;

    BEGIN TRY
        BEGIN TRANSACTION;

        SELECT @existing_transaction_id = payment_transaction_id,
               @existing_booking_id = booking_id,
               @existing_fnb_order_id = fnb_order_id
        FROM dbo.payment_transactions WITH (UPDLOCK, HOLDLOCK)
        WHERE idempotency_key = @idempotency_key;

        IF @existing_transaction_id IS NOT NULL
        BEGIN
            IF (@booking_id IS NOT NULL AND (@existing_booking_id IS NULL OR @existing_booking_id <> @booking_id))
               OR (@booking_id IS NULL AND (@existing_booking_id IS NOT NULL OR @existing_fnb_order_id <> @fnb_order_id))
                THROW 52101, N'idempotency_key đã dùng cho đơn khác.', 1;

            COMMIT TRANSACTION;

            SELECT payment_transaction_id, payment_code, amount, currency_code, status, expired_at
            FROM dbo.payment_transactions
            WHERE payment_transaction_id = @existing_transaction_id;
            RETURN;
        END;

        DECLARE @booking_status_code VARCHAR(30),
                @branch_id BIGINT,
                @total_amount DECIMAL(18,2) = 0,
                @currency_code CHAR(3),
                @booking_expires_at DATETIME2(0),
                @fnb_status VARCHAR(20),
                @fnb_branch_id BIGINT,
                @fnb_booking_id BIGINT,
                @fnb_total DECIMAL(14,2),
                @fnb_currency CHAR(3);

        IF @booking_id IS NOT NULL
        BEGIN
            SELECT @booking_status_code = bs.status_code,
                   @branch_id = b.branch_id,
                   @total_amount = b.total_amount,
                   @currency_code = b.currency_code,
                   @booking_expires_at = b.expires_at
            FROM dbo.bookings b WITH (UPDLOCK, HOLDLOCK)
            JOIN dbo.booking_statuses bs ON bs.booking_status_id = b.booking_status_id
            WHERE b.booking_id = @booking_id;

            IF @booking_status_code IS NULL OR @booking_status_code <> 'PENDING_PAYMENT'
                THROW 52102, N'Booking không tồn tại hoặc không chờ thanh toán.', 1;
            IF EXISTS (SELECT 1 FROM dbo.payment_transactions WHERE booking_id = @booking_id)
                THROW 52103, N'Booking đã có giao dịch thanh toán.', 1;

            SELECT @fnb_order_id = fnb_order_id
            FROM dbo.fnb_orders WITH (UPDLOCK, HOLDLOCK)
            WHERE booking_id = @booking_id AND order_status <> 'CANCELLED';
        END;

        IF @fnb_order_id IS NOT NULL
        BEGIN
            SELECT @fnb_status = order_status, @fnb_branch_id = branch_id,
                   @fnb_booking_id = booking_id, @fnb_total = total_amount, @fnb_currency = currency_code
            FROM dbo.fnb_orders WITH (UPDLOCK, HOLDLOCK)
            WHERE fnb_order_id = @fnb_order_id;

            IF @fnb_status IS NULL OR @fnb_status <> 'PENDING'
                THROW 52102, N'Đơn F&B không tồn tại hoặc không chờ thanh toán.', 1;
            IF @booking_id IS NULL AND @fnb_booking_id IS NOT NULL
                THROW 52102, N'Đơn F&B đi kèm phải thanh toán qua booking.', 1;
            IF @currency_code IS NOT NULL AND @currency_code <> @fnb_currency
                THROW 52102, N'Loại tiền của vé và F&B không khớp.', 1;
            IF EXISTS (SELECT 1 FROM dbo.payment_transactions WHERE fnb_order_id = @fnb_order_id)
                THROW 52103, N'Đơn F&B đã có giao dịch thanh toán.', 1;

            SET @branch_id = @fnb_branch_id;
            SET @total_amount = @total_amount + @fnb_total;
            SET @currency_code = @fnb_currency;
        END;

        DECLARE @method_code VARCHAR(30),
                @method_active BIT,
                @requires_provider BIT;

        SELECT @method_code = method_code,
               @method_active = is_active,
               @requires_provider = requires_provider
        FROM dbo.payment_methods
        WHERE payment_method_id = @payment_method_id;

        IF @method_code IS NULL OR @method_active = 0
            THROW 52104, N'Phương thức thanh toán không tồn tại hoặc đã ngừng hỗ trợ.', 1;

        IF @requires_provider = 1 AND @provider_id IS NULL
            THROW 52105, N'Phương thức này yêu cầu nhà cung cấp thanh toán.', 1;
        IF @requires_provider = 0 AND @provider_id IS NOT NULL
            THROW 52105, N'Phương thức này không dùng nhà cung cấp thanh toán.', 1;

        IF @provider_id IS NOT NULL
           AND NOT EXISTS (
               SELECT 1 FROM dbo.payment_providers
               WHERE provider_id = @provider_id AND is_active = 1
           )
            THROW 52106, N'Nhà cung cấp thanh toán không tồn tại hoặc đã ngừng hoạt động.', 1;

        IF @method_code = 'CASH'
        BEGIN
            IF @cash_register_session_id IS NULL
                THROW 52107, N'Thanh toán tiền mặt phải thuộc một ca thu ngân đang mở.', 1;

            IF NOT EXISTS (
                SELECT 1
                FROM dbo.cash_register_sessions WITH (UPDLOCK, HOLDLOCK)
                WHERE cash_register_session_id = @cash_register_session_id
                  AND branch_id = @branch_id
                  AND status = 'OPEN'
            )
                THROW 52107, N'Ca thu ngân không mở hoặc không thuộc chi nhánh của đơn.', 1;
        END
        ELSE IF @cash_register_session_id IS NOT NULL
            THROW 52107, N'Chỉ thanh toán tiền mặt mới được gắn ca thu ngân.', 1;

        DECLARE @now_local DATETIME2(0) = SYSDATETIME(),
                @expired_at DATETIME2(0);

        SET @expired_at = COALESCE(@booking_expires_at, DATEADD(MINUTE, 15, @now_local));
        IF @expired_at <= @now_local
            THROW 52108, N'Đơn đã hết hạn thanh toán.', 1;

        IF @fnb_order_id IS NOT NULL
            EXEC dbo.usp_fnb_reserve_stock @fnb_order_id, @expired_at;

        DECLARE @payment_code VARCHAR(50) = 'PAY-' + CONVERT(VARCHAR(36), NEWID());
        DECLARE @payment_transaction_id BIGINT;

        INSERT INTO dbo.payment_transactions (
            payment_code, booking_id, fnb_order_id, payment_method_id, provider_id,
            amount, currency_code, status, idempotency_key, expired_at,
            cash_register_session_id
        )
        VALUES (
            @payment_code, @booking_id, @fnb_order_id, @payment_method_id, @provider_id,
            @total_amount, @currency_code, 'PENDING', @idempotency_key, @expired_at,
            @cash_register_session_id
        );

        SET @payment_transaction_id = SCOPE_IDENTITY();

        COMMIT TRANSACTION;

        SELECT @payment_transaction_id AS payment_transaction_id,
               @payment_code AS payment_code,
               @total_amount AS amount,
               @currency_code AS currency_code,
               'PENDING' AS status,
               @expired_at AS expired_at;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END
GO



CREATE PROCEDURE dbo.usp_payment_finalize
    @payment_transaction_id  BIGINT,
    @provider_transaction_id VARCHAR(150) = NULL,
    @paid_at                 DATETIME2(0) = NULL,
    @return_result           BIT = 1
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @paid_at = COALESCE(@paid_at, SYSDATETIME());
    DECLARE @now_utc DATETIME2(0) = SYSUTCDATETIME();

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @booking_id BIGINT,
                @fnb_order_id BIGINT,
                @tx_status VARCHAR(20),
                @tx_amount DECIMAL(18,2),
                @tx_currency CHAR(3),
                @tx_expires_at DATETIME2(0),
                @cash_session_id BIGINT;

        SELECT @booking_id = booking_id,
               @fnb_order_id = fnb_order_id,
               @tx_status = status,
               @tx_amount = amount,
               @tx_currency = currency_code,
               @tx_expires_at = expired_at,
               @cash_session_id = cash_register_session_id
        FROM dbo.payment_transactions WITH (UPDLOCK, HOLDLOCK)
        WHERE payment_transaction_id = @payment_transaction_id;

        IF @tx_status IS NULL
            THROW 52130, N'Giao dịch thanh toán không tồn tại.', 1;

        IF @tx_status = 'SUCCESS'
        BEGIN
            COMMIT TRANSACTION;

            IF @return_result = 1
                SELECT @payment_transaction_id AS payment_transaction_id,
                       @booking_id AS booking_id,
                       0 AS tickets_issued;
            RETURN;
        END;

        IF @tx_status NOT IN ('PENDING','PROCESSING')
            THROW 52131, N'Giao dịch không ở trạng thái có thể chốt.', 1;

        DECLARE @booking_status_code VARCHAR(30),
                @booking_total DECIMAL(18,2) = 0,
                @booking_currency CHAR(3),
                @booking_expires_at DATETIME2(0),
                @fnb_status VARCHAR(20),
                @fnb_total DECIMAL(14,2) = 0,
                @fnb_currency CHAR(3);

        SELECT @booking_status_code = bs.status_code,
               @booking_total = b.total_amount,
               @booking_currency = b.currency_code,
               @booking_expires_at = b.expires_at
        FROM dbo.bookings b WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.booking_statuses bs ON bs.booking_status_id = b.booking_status_id
        WHERE b.booking_id = @booking_id;

        IF @booking_id IS NOT NULL AND @booking_status_code IS NULL
            THROW 52132, N'Booking của giao dịch không tồn tại.', 1;
        IF @booking_status_code <> 'PENDING_PAYMENT'
            THROW 52132, N'Booking không ở trạng thái chờ thanh toán.', 1;
        IF @fnb_order_id IS NOT NULL
        BEGIN
            SELECT @fnb_status = order_status, @fnb_total = total_amount, @fnb_currency = currency_code
            FROM dbo.fnb_orders WITH (UPDLOCK, HOLDLOCK)
            WHERE fnb_order_id = @fnb_order_id;

            IF @fnb_status <> 'PENDING' OR @fnb_status IS NULL
                THROW 52132, N'Đơn F&B không ở trạng thái chờ thanh toán.', 1;
            IF @tx_expires_at IS NOT NULL AND @tx_expires_at < @paid_at
                THROW 52134, N'Đơn F&B đã hết hạn trước thời điểm thanh toán.', 1;
        END;

        IF @booking_total + @fnb_total <> @tx_amount
           OR (@booking_id IS NOT NULL AND @booking_currency <> @tx_currency)
           OR (@fnb_order_id IS NOT NULL AND @fnb_currency <> @tx_currency)
            THROW 52133, N'Số tiền hoặc loại tiền không khớp tổng tiền vé và F&B.', 1;
        IF @booking_expires_at IS NOT NULL AND @booking_expires_at < @paid_at
            THROW 52134, N'Booking đã hết hạn trước thời điểm thanh toán.', 1;

        IF @cash_session_id IS NOT NULL
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM dbo.cash_register_sessions WITH (UPDLOCK, HOLDLOCK)
                WHERE cash_register_session_id = @cash_session_id
                  AND status = 'OPEN'
            )
                THROW 52135, N'Ca thu ngân đã đóng; không thể chốt thanh toán tiền mặt.', 1;
        END;

        DECLARE @locked_showtime_seat_id BIGINT;
        SELECT @locked_showtime_seat_id = ss.showtime_seat_id
        FROM dbo.showtime_seats ss WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.booking_seats bs WITH (UPDLOCK, HOLDLOCK) ON bs.showtime_seat_id = ss.showtime_seat_id
        WHERE bs.booking_id = @booking_id;

        IF @booking_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.booking_seats WHERE booking_id = @booking_id)
            THROW 52136, N'Booking không có ghế để phát hành vé.', 1;

        IF EXISTS (
            SELECT 1
            FROM dbo.booking_seats bs WITH (UPDLOCK, HOLDLOCK)
            JOIN dbo.showtime_seats ss WITH (UPDLOCK, HOLDLOCK) ON ss.showtime_seat_id = bs.showtime_seat_id
            WHERE bs.booking_id = @booking_id
              AND (bs.released_at IS NOT NULL OR ss.seat_status NOT IN ('BOOKED','HELD','SOLD'))
        )
            THROW 52136, N'Có ghế của booking không ở trạng thái giữ hoặc đã bán.', 1;

        DECLARE @pending_booking_status_id SMALLINT =
            (SELECT booking_status_id FROM dbo.booking_statuses WHERE status_code = 'PENDING_PAYMENT');
        DECLARE @confirmed_booking_status_id SMALLINT =
            (SELECT booking_status_id FROM dbo.booking_statuses WHERE status_code = 'CONFIRMED');
        DECLARE @issued_ticket_status_id SMALLINT =
            (SELECT ticket_status_id FROM dbo.ticket_statuses WHERE status_code = 'ISSUED');

        IF @pending_booking_status_id IS NULL
           OR @confirmed_booking_status_id IS NULL
           OR @issued_ticket_status_id IS NULL
            THROW 52137, N'Thiếu cấu hình trạng thái booking/vé.', 1;

        UPDATE dbo.payment_transactions
        SET status = 'SUCCESS',
            paid_at = @paid_at,
            provider_transaction_id = COALESCE(@provider_transaction_id, provider_transaction_id),
            updated_at = @now_utc
        WHERE payment_transaction_id = @payment_transaction_id
          AND status IN ('PENDING','PROCESSING');

        IF @@ROWCOUNT <> 1
            THROW 52138, N'Giao dịch vừa được xử lý bởi luồng khác.', 1;

        IF @fnb_order_id IS NOT NULL
        BEGIN
            EXEC dbo.usp_fnb_reserve_stock @fnb_order_id, NULL;
            UPDATE dbo.fnb_orders
            SET order_status = 'PAID', updated_at = @now_utc
            WHERE fnb_order_id = @fnb_order_id;
        END;

        DECLARE @tickets_issued INT = 0;

        IF @booking_id IS NOT NULL
        BEGIN
        UPDATE dbo.bookings
        SET booking_status_id = @confirmed_booking_status_id,
            confirmed_at = @paid_at,
            updated_at = @now_utc
        WHERE booking_id = @booking_id
          AND booking_status_id = @pending_booking_status_id;

        IF @@ROWCOUNT <> 1
            THROW 52139, N'Booking vừa được thay đổi bởi luồng khác.', 1;

        UPDATE ss
        SET seat_status = 'SOLD',
            hold_expires_at = NULL,
            held_by_session_id = NULL,
            updated_at = @now_utc
        FROM dbo.showtime_seats ss
        JOIN dbo.booking_seats bs ON bs.showtime_seat_id = ss.showtime_seat_id
        WHERE bs.booking_id = @booking_id
          AND ss.seat_status IN ('BOOKED','HELD');

        UPDATE dbo.seat_holds
        SET hold_status = 'CONVERTED',
            released_at = COALESCE(released_at, @paid_at)
        WHERE booking_id = @booking_id
          AND hold_status = 'ACTIVE';

        INSERT INTO dbo.tickets (
            ticket_code, booking_seat_id, ticket_status_id, qr_token_hash, issued_at
        )
        SELECT
            'TKT-' + CONVERT(VARCHAR(36), NEWID()),
            bs.booking_seat_id,
            @issued_ticket_status_id,
            CONVERT(VARCHAR(128), HASHBYTES('SHA2_256', CONVERT(VARCHAR(36), NEWID())), 2),
            @paid_at
        FROM dbo.booking_seats bs
        WHERE bs.booking_id = @booking_id
          AND NOT EXISTS (
              SELECT 1 FROM dbo.tickets t WHERE t.booking_seat_id = bs.booking_seat_id
          );

        SET @tickets_issued = @@ROWCOUNT;
        DECLARE @audit_json NVARCHAR(MAX);
        SELECT @audit_json = (
            SELECT @payment_transaction_id AS payment_transaction_id,
                   @paid_at AS paid_at
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO dbo.booking_audit_logs (booking_id, actor_type, action_code, new_values)
        VALUES (@booking_id, 'SYSTEM', 'PAYMENT_SUCCESS', @audit_json);
        END;

        COMMIT TRANSACTION;

        IF @return_result = 1
            SELECT @payment_transaction_id AS payment_transaction_id,
                   @booking_id AS booking_id,
                   @tickets_issued AS tickets_issued;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END
GO


CREATE PROCEDURE dbo.usp_payment_attempt_start
    @payment_transaction_id BIGINT,
    @amount                 DECIMAL(18,2) = NULL,
    @request_reference      VARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @now_local DATETIME2(0) = SYSDATETIME();

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @status VARCHAR(20),
                @transaction_amount DECIMAL(18,2),
                @expired_at DATETIME2(0);

        SELECT @status = status,
               @transaction_amount = amount,
               @expired_at = expired_at
        FROM dbo.payment_transactions WITH (UPDLOCK, HOLDLOCK)
        WHERE payment_transaction_id = @payment_transaction_id;

        IF @status IS NULL
            THROW 52110, N'Giao dịch thanh toán không tồn tại.', 1;
        IF @status NOT IN ('PENDING','PROCESSING')
            THROW 52111, N'Giao dịch không ở trạng thái có thể thử thanh toán.', 1;

        IF @expired_at IS NOT NULL AND @expired_at <= @now_local
        BEGIN
            UPDATE dbo.payment_transactions
            SET status = 'EXPIRED', updated_at = SYSUTCDATETIME()
            WHERE payment_transaction_id = @payment_transaction_id
              AND status IN ('PENDING','PROCESSING');

            COMMIT TRANSACTION;
            THROW 52112, N'Giao dịch đã hết hạn thanh toán.', 1;
        END;

        IF @amount IS NULL SET @amount = @transaction_amount;
        IF @amount <> @transaction_amount
            THROW 52113, N'Số tiền thử thanh toán không khớp giao dịch.', 1;

        IF EXISTS (
            SELECT 1 FROM dbo.payment_attempts
            WHERE payment_transaction_id = @payment_transaction_id
              AND status IN ('PENDING','PROCESSING')
        )
            THROW 52114, N'Đang có một lần thử thanh toán chưa kết thúc.', 1;

        DECLARE @attempt_number INT =
            ISNULL((SELECT MAX(attempt_number) FROM dbo.payment_attempts WHERE payment_transaction_id = @payment_transaction_id), 0) + 1;

        INSERT INTO dbo.payment_attempts (
            payment_transaction_id, attempt_number, request_reference, amount, status, started_at
        )
        VALUES (
            @payment_transaction_id, @attempt_number, @request_reference, @amount, 'PENDING', @now_local
        );

        DECLARE @attempt_id BIGINT = SCOPE_IDENTITY();

        UPDATE dbo.payment_transactions
        SET status = 'PROCESSING', updated_at = SYSUTCDATETIME()
        WHERE payment_transaction_id = @payment_transaction_id
          AND status IN ('PENDING','PROCESSING');

        COMMIT TRANSACTION;

        SELECT @attempt_id AS payment_attempt_id,
               @attempt_number AS attempt_number,
               @payment_transaction_id AS payment_transaction_id;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END
GO


CREATE PROCEDURE dbo.usp_payment_attempt_complete
    @payment_attempt_id      BIGINT,
    @status                  VARCHAR(20),
    @provider_reference      VARCHAR(150) = NULL,
    @error_code              VARCHAR(100) = NULL,
    @error_message           NVARCHAR(500) = NULL,
    @provider_transaction_id VARCHAR(150) = NULL,
    @paid_at                 DATETIME2(0) = NULL,
    @final_failure           BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @status NOT IN ('SUCCESS','FAILED','TIMEOUT','CANCELLED')
        THROW 52120, N'Trạng thái lần thử không hợp lệ.', 1;

    DECLARE @now_local DATETIME2(0) = SYSDATETIME();
    SET @paid_at = COALESCE(@paid_at, @now_local);

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @transaction_id BIGINT,
                @attempt_status VARCHAR(20),
                @transaction_status VARCHAR(20),
                @expired_at DATETIME2(0);

        SELECT @transaction_id = payment_transaction_id,
               @attempt_status = status
        FROM dbo.payment_attempts WITH (UPDLOCK, HOLDLOCK)
        WHERE payment_attempt_id = @payment_attempt_id;

        IF @transaction_id IS NULL
            THROW 52121, N'Lần thử thanh toán không tồn tại.', 1;
        IF @attempt_status NOT IN ('PENDING','PROCESSING')
            THROW 52122, N'Lần thử thanh toán đã kết thúc.', 1;

        SELECT @transaction_status = status,
               @expired_at = expired_at
        FROM dbo.payment_transactions WITH (UPDLOCK, HOLDLOCK)
        WHERE payment_transaction_id = @transaction_id;

        IF @transaction_status IS NULL
            THROW 52123, N'Giao dịch thanh toán không tồn tại.', 1;
        IF @transaction_status NOT IN ('PENDING','PROCESSING')
            THROW 52124, N'Giao dịch không ở trạng thái có thể cập nhật.', 1;

        UPDATE dbo.payment_attempts
        SET status = @status,
            provider_reference = @provider_reference,
            error_code = @error_code,
            error_message = @error_message,
            completed_at = @now_local
        WHERE payment_attempt_id = @payment_attempt_id
          AND status IN ('PENDING','PROCESSING');

        IF @@ROWCOUNT <> 1
            THROW 52125, N'Lần thử thanh toán vừa được xử lý bởi luồng khác.', 1;

        IF @status = 'SUCCESS'
        BEGIN
            EXEC dbo.usp_payment_finalize
                @payment_transaction_id = @transaction_id,
                @provider_transaction_id = @provider_transaction_id,
                @paid_at = @paid_at,
                @return_result = 0;
        END
        ELSE IF @status = 'CANCELLED' AND @final_failure = 1
        BEGIN
            UPDATE dbo.payment_transactions
            SET status = 'CANCELLED', updated_at = SYSUTCDATETIME()
            WHERE payment_transaction_id = @transaction_id
              AND status IN ('PENDING','PROCESSING');
        END
        ELSE
        BEGIN
            IF @expired_at IS NOT NULL AND @expired_at <= @now_local
                UPDATE dbo.payment_transactions
                SET status = 'EXPIRED', updated_at = SYSUTCDATETIME()
                WHERE payment_transaction_id = @transaction_id
                  AND status IN ('PENDING','PROCESSING');
            ELSE IF @final_failure = 1
                UPDATE dbo.payment_transactions
                SET status = 'FAILED', updated_at = SYSUTCDATETIME()
                WHERE payment_transaction_id = @transaction_id
                  AND status IN ('PENDING','PROCESSING');
            ELSE
                UPDATE dbo.payment_transactions
                SET status = 'PENDING', updated_at = SYSUTCDATETIME()
                WHERE payment_transaction_id = @transaction_id
                  AND status IN ('PENDING','PROCESSING');
        END;

        COMMIT TRANSACTION;

        SELECT @payment_attempt_id AS payment_attempt_id,
               @transaction_id AS payment_transaction_id,
               @status AS attempt_status;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END
GO


CREATE PROCEDURE dbo.usp_cash_session_open
    @branch_id         BIGINT,
    @cashier_user_id   BIGINT,
    @opened_by_user_id BIGINT,
    @opening_cash      DECIMAL(18,2),
    @note              NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @opening_cash < 0
        THROW 52140, N'Tiền đầu ca không được âm.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.branches WHERE branch_id = @branch_id AND status = 'ACTIVE')
        THROW 52141, N'Chi nhánh không tồn tại hoặc đã ngừng hoạt động.', 1;
    IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE user_id = @cashier_user_id AND status = 'ACTIVE')
        THROW 52142, N'Thu ngân không tồn tại hoặc đã bị khóa.', 1;
    IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE user_id = @opened_by_user_id AND status = 'ACTIVE')
        THROW 52143, N'Người mở ca không tồn tại hoặc đã bị khóa.', 1;

    BEGIN TRY
        INSERT INTO dbo.cash_register_sessions (
            branch_id, cashier_user_id, opened_by_user_id, opening_cash, status, opened_at, note
        )
        VALUES (
            @branch_id, @cashier_user_id, @opened_by_user_id, @opening_cash, 'OPEN', SYSDATETIME(), @note
        );

        SELECT SCOPE_IDENTITY() AS cash_register_session_id;
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() IN (2601, 2627)
            THROW 52144, N'Thu ngân đang có ca mở tại chi nhánh này.', 1;
        THROW;
    END CATCH;
END
GO


CREATE PROCEDURE dbo.usp_cash_session_close
    @cash_register_session_id BIGINT,
    @counted_cash             DECIMAL(18,2),
    @closed_by_user_id        BIGINT,
    @note                     NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @counted_cash < 0
        THROW 52150, N'Tiền kiểm đếm không được âm.', 1;

    DECLARE @now_local DATETIME2(0) = SYSDATETIME();

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @opening_cash DECIMAL(18,2),
                @status VARCHAR(20),
                @opened_at DATETIME2(0);

        SELECT @opening_cash = opening_cash,
               @status = status,
               @opened_at = opened_at
        FROM dbo.cash_register_sessions WITH (UPDLOCK, HOLDLOCK)
        WHERE cash_register_session_id = @cash_register_session_id;

        IF @status IS NULL
            THROW 52151, N'Ca thu ngân không tồn tại.', 1;
        IF @status <> 'OPEN'
            THROW 52152, N'Ca thu ngân không ở trạng thái mở.', 1;
        IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE user_id = @closed_by_user_id AND status = 'ACTIVE')
            THROW 52153, N'Người đóng ca không tồn tại hoặc đã bị khóa.', 1;

        IF EXISTS (
            SELECT 1
            FROM dbo.payment_transactions
            WHERE cash_register_session_id = @cash_register_session_id
              AND status IN ('PENDING','PROCESSING')
        )
            THROW 52154, N'Còn giao dịch tiền mặt chưa kết thúc trong ca.', 1;

        DECLARE @cash_sales DECIMAL(18,2) =
        (
            SELECT ISNULL(SUM(pt.amount), 0)
            FROM dbo.payment_transactions pt
            JOIN dbo.payment_methods pm ON pm.payment_method_id = pt.payment_method_id
            WHERE pt.cash_register_session_id = @cash_register_session_id
              AND pm.method_code = 'CASH'
              AND pt.status = 'SUCCESS'
              AND pt.paid_at >= @opened_at
              AND pt.paid_at <= @now_local
        );

        DECLARE @expected_cash DECIMAL(18,2) = @opening_cash + @cash_sales;
        DECLARE @difference DECIMAL(18,2) = @counted_cash - @expected_cash;

        UPDATE dbo.cash_register_sessions
        SET expected_cash = @expected_cash,
            counted_cash = @counted_cash,
            cash_difference = @difference,
            status = 'CLOSED',
            closed_at = @now_local,
            closed_by_user_id = @closed_by_user_id,
            note = COALESCE(@note, note)
        WHERE cash_register_session_id = @cash_register_session_id
          AND status = 'OPEN';

        IF @@ROWCOUNT <> 1
            THROW 52155, N'Ca thu ngân vừa được đóng bởi luồng khác.', 1;

        COMMIT TRANSACTION;

        SELECT @cash_register_session_id AS cash_register_session_id,
               @opening_cash AS opening_cash,
               @cash_sales AS cash_sales,
               @expected_cash AS expected_cash,
               @counted_cash AS counted_cash,
               @difference AS cash_difference;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END
GO



CREATE PROCEDURE dbo.usp_payment_provider_event_apply
    @provider_id             INT,
    @provider_event_id       VARCHAR(150) = NULL,
    @payment_transaction_id  BIGINT = NULL,
    @event_type              VARCHAR(100),
    @event_payload           NVARCHAR(MAX),
    @signature_valid         BIT,
    @provider_transaction_id VARCHAR(150) = NULL,
    @event_amount            DECIMAL(18,2) = NULL,
    @event_currency          CHAR(3) = NULL,
    @paid_at                 DATETIME2(0) = NULL,
    @received_at             DATETIME2(0) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @received_at = COALESCE(@received_at, SYSDATETIME());
    IF @received_at > SYSDATETIME() SET @received_at = SYSDATETIME();
    SET @paid_at = COALESCE(@paid_at, SYSDATETIME());
    SET @signature_valid = ISNULL(@signature_valid, 0);
    SET @event_type = UPPER(LTRIM(RTRIM(@event_type)));

    IF @provider_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM dbo.payment_providers WHERE provider_id = @provider_id)
        THROW 52200, N'Nhà cung cấp thanh toán không tồn tại.', 1;
    IF @event_type IS NULL OR @event_type = ''
        THROW 52201, N'Loại sự kiện không được để trống.', 1;
    IF @event_payload IS NULL OR ISJSON(@event_payload) = 0
        THROW 52202, N'Payload webhook phải là JSON hợp lệ.', 1;

    DECLARE @event_id BIGINT;
    DECLARE @effective_transaction_id BIGINT = @payment_transaction_id;
    DECLARE @pre_error NVARCHAR(1000);
    DECLARE @tx_provider_id INT,
            @tx_fnb_order_id BIGINT,
            @tx_status VARCHAR(20),
            @tx_amount DECIMAL(18,2),
            @tx_currency CHAR(3),
            @tx_provider_txn VARCHAR(150),
            @tx_expired_at DATETIME2(0);

    IF @effective_transaction_id IS NOT NULL
    BEGIN
        SELECT @tx_provider_id = provider_id,
               @tx_status = status,
               @tx_amount = amount,
               @tx_currency = currency_code,
               @tx_provider_txn = provider_transaction_id,
               @tx_expired_at = expired_at
        FROM dbo.payment_transactions
        WHERE payment_transaction_id = @effective_transaction_id;

        IF @tx_status IS NULL
        BEGIN
            SET @effective_transaction_id = NULL;
            SET @pre_error = N'Không tìm thấy giao dịch thanh toán.';
        END
        ELSE IF @tx_provider_id IS NULL OR @tx_provider_id <> @provider_id
        BEGIN
            SET @effective_transaction_id = NULL;
            SET @pre_error = N'Provider của sự kiện không khớp giao dịch.';
        END
    END
    ELSE IF @provider_transaction_id IS NOT NULL
    BEGIN
        SELECT @effective_transaction_id = payment_transaction_id,
               @tx_provider_id = provider_id,
               @tx_status = status,
               @tx_amount = amount,
               @tx_currency = currency_code,
               @tx_provider_txn = provider_transaction_id,
               @tx_expired_at = expired_at
        FROM dbo.payment_transactions
        WHERE provider_id = @provider_id
          AND provider_transaction_id = @provider_transaction_id;

        IF @effective_transaction_id IS NULL
            SET @pre_error = N'Không tìm thấy giao dịch thanh toán theo mã provider.';
    END
    ELSE
        SET @pre_error = N'Không xác định được giao dịch thanh toán.';

    IF @signature_valid = 0
    BEGIN
        INSERT INTO dbo.payment_provider_events (
            provider_id, payment_transaction_id, provider_event_id, event_type,
            event_payload, signature_valid, processing_status, received_at, processed_at, error_message
        )
        VALUES (
            @provider_id, @effective_transaction_id, NULL, @event_type,
            @event_payload, 0, 'FAILED', @received_at, SYSDATETIME(),
            LEFT(N'Chữ ký webhook không hợp lệ. Event: ' + COALESCE(@provider_event_id, N''), 1000)
        );
        SET @event_id = SCOPE_IDENTITY();
        SELECT event_id, processing_status, payment_transaction_id, error_message,
               CAST(0 AS BIT) AS is_duplicate
        FROM dbo.payment_provider_events WHERE event_id = @event_id;
        RETURN;
    END;

    BEGIN TRY
        BEGIN TRANSACTION;

        IF @provider_event_id IS NOT NULL
            SELECT @event_id = event_id
            FROM dbo.payment_provider_events WITH (UPDLOCK, HOLDLOCK)
            WHERE provider_id = @provider_id AND provider_event_id = @provider_event_id;

        IF @event_id IS NOT NULL
        BEGIN
            IF EXISTS (
                SELECT 1 FROM dbo.payment_provider_events
                WHERE event_id = @event_id AND signature_valid = 1
                  AND (event_type <> @event_type OR event_payload COLLATE Latin1_General_100_BIN2 <> @event_payload COLLATE Latin1_General_100_BIN2
                       OR (payment_transaction_id IS NOT NULL AND
                           (@effective_transaction_id IS NULL OR payment_transaction_id <> @effective_transaction_id)))
            )
                THROW 52203, N'Event ID đã được dùng cho nội dung khác.', 1;

            IF EXISTS (
                SELECT 1 FROM dbo.payment_provider_events
                WHERE event_id = @event_id AND signature_valid = 1
                  AND processing_status IN ('PROCESSED','IGNORED')
            )
            BEGIN
                SELECT event_id, processing_status, payment_transaction_id, error_message,
                       CAST(1 AS BIT) AS is_duplicate
                FROM dbo.payment_provider_events WHERE event_id = @event_id;
                COMMIT TRANSACTION;
                RETURN;
            END;

            UPDATE dbo.payment_provider_events
            SET payment_transaction_id = @effective_transaction_id,
                event_type = @event_type, event_payload = @event_payload,
                signature_valid = 1, processing_status = 'RECEIVED',
                processed_at = NULL, error_message = NULL
            WHERE event_id = @event_id;
        END
        ELSE
        BEGIN
            INSERT INTO dbo.payment_provider_events (
                provider_id, payment_transaction_id, provider_event_id, event_type,
                event_payload, signature_valid, processing_status, received_at
            ) VALUES (
                @provider_id, @effective_transaction_id, @provider_event_id, @event_type,
                @event_payload, 1, 'RECEIVED', @received_at
            );
            SET @event_id = SCOPE_IDENTITY();
        END;

    IF @event_type NOT IN ('PAYMENT_SUCCESS','PAYMENT_FAILED','PAYMENT_CANCELLED','PAYMENT_PENDING')
    BEGIN
        UPDATE dbo.payment_provider_events
        SET processing_status = 'IGNORED',
            processed_at = SYSDATETIME(),
            error_message = N'Loại sự kiện không được hỗ trợ.'
        WHERE event_id = @event_id;

        SELECT event_id, processing_status, payment_transaction_id, error_message,
               CAST(0 AS BIT) AS is_duplicate
        FROM dbo.payment_provider_events
        WHERE event_id = @event_id;
        COMMIT TRANSACTION;
        RETURN;
    END;

    IF @pre_error IS NOT NULL
    BEGIN
        UPDATE dbo.payment_provider_events
        SET processing_status = 'FAILED',
            processed_at = SYSDATETIME(),
            error_message = @pre_error
        WHERE event_id = @event_id;

        SELECT event_id, processing_status, payment_transaction_id, error_message,
               CAST(0 AS BIT) AS is_duplicate
        FROM dbo.payment_provider_events
        WHERE event_id = @event_id;
        COMMIT TRANSACTION;
        RETURN;
    END;

    DECLARE @final_status VARCHAR(20),
            @final_error NVARCHAR(1000),
            @need_finalize BIT = 0;

        SELECT @tx_provider_id = provider_id,
               @tx_fnb_order_id = fnb_order_id,
               @tx_status = status,
               @tx_amount = amount,
               @tx_currency = currency_code,
               @tx_provider_txn = provider_transaction_id,
               @tx_expired_at = expired_at
        FROM dbo.payment_transactions WITH (UPDLOCK, HOLDLOCK)
        WHERE payment_transaction_id = @effective_transaction_id;

        IF @tx_status IS NULL
        BEGIN
            SET @final_status = 'FAILED';
            SET @final_error = N'Không tìm thấy giao dịch thanh toán.';
        END
        ELSE IF @tx_provider_id IS NULL OR @tx_provider_id <> @provider_id
        BEGIN
            SET @final_status = 'FAILED';
            SET @final_error = N'Provider của sự kiện không khớp giao dịch.';
        END
        ELSE IF @event_amount IS NOT NULL AND @event_amount <> @tx_amount
        BEGIN
            SET @final_status = 'FAILED';
            SET @final_error = N'Số tiền sự kiện không khớp giao dịch.';
        END
        ELSE IF @event_currency IS NOT NULL AND @event_currency <> @tx_currency
        BEGIN
            SET @final_status = 'FAILED';
            SET @final_error = N'Loại tiền sự kiện không khớp giao dịch.';
        END
        ELSE IF @event_type = 'PAYMENT_SUCCESS'
        BEGIN
            IF @tx_fnb_order_id IS NOT NULL AND (@event_amount IS NULL OR @event_currency IS NULL)
            BEGIN
                SET @final_status = 'FAILED';
                SET @final_error = N'Thiếu số tiền hoặc loại tiền của khoản thu có F&B.';
            END
            ELSE IF @provider_transaction_id IS NULL
            BEGIN
                SET @final_status = 'FAILED';
                SET @final_error = N'Thiếu mã giao dịch provider.';
            END
            ELSE IF @tx_status = 'SUCCESS'
            BEGIN
                IF @tx_provider_txn IS NOT NULL AND @tx_provider_txn <> @provider_transaction_id
                BEGIN
                    SET @final_status = 'FAILED';
                    SET @final_error = N'Giao dịch đã chốt với mã provider khác.';
                END
                ELSE
                    SET @final_status = 'PROCESSED';
            END
            ELSE IF @tx_status IN ('PENDING','PROCESSING')
                SET @need_finalize = 1;
            ELSE
            BEGIN
                SET @final_status = 'FAILED';
                SET @final_error = N'Giao dịch đang ở trạng thái ' + @tx_status + N'; không thể chốt.';
            END
        END
        ELSE IF @event_type = 'PAYMENT_FAILED'
        BEGIN
            IF @tx_status = 'SUCCESS'
            BEGIN
                SET @final_status = 'IGNORED';
                SET @final_error = N'Giao dịch đã thành công; bỏ qua sự kiện thất bại.';
            END
            ELSE IF @tx_status IN ('PENDING','PROCESSING')
            BEGIN
                UPDATE dbo.payment_attempts
                SET status = 'FAILED',
                    completed_at = SYSDATETIME(),
                    error_code = COALESCE(error_code, 'PROVIDER_FAILED'),
                    error_message = COALESCE(error_message, N'Provider báo giao dịch thất bại.')
                WHERE payment_transaction_id = @effective_transaction_id
                  AND status IN ('PENDING','PROCESSING');

                IF @tx_expired_at IS NOT NULL AND @tx_expired_at <= SYSDATETIME()
                    UPDATE dbo.payment_transactions
                    SET status = 'EXPIRED', updated_at = SYSUTCDATETIME()
                    WHERE payment_transaction_id = @effective_transaction_id
                      AND status IN ('PENDING','PROCESSING');
                ELSE
                    UPDATE dbo.payment_transactions
                    SET status = 'PENDING', updated_at = SYSUTCDATETIME()
                    WHERE payment_transaction_id = @effective_transaction_id
                      AND status IN ('PENDING','PROCESSING');

                SET @final_status = 'PROCESSED';
            END
            ELSE
                SET @final_status = 'PROCESSED';
        END
        ELSE IF @event_type = 'PAYMENT_CANCELLED'
        BEGIN
            IF @tx_status = 'SUCCESS'
            BEGIN
                SET @final_status = 'FAILED';
                SET @final_error = N'Không thể hủy giao dịch đã thành công khi không có hoàn tiền.';
            END
            ELSE IF @tx_status IN ('PENDING','PROCESSING')
            BEGIN
                UPDATE dbo.payment_attempts
                SET status = 'CANCELLED',
                    completed_at = SYSDATETIME(),
                    error_code = COALESCE(error_code, 'PROVIDER_CANCELLED'),
                    error_message = COALESCE(error_message, N'Provider hủy giao dịch.')
                WHERE payment_transaction_id = @effective_transaction_id
                  AND status IN ('PENDING','PROCESSING');

                UPDATE dbo.payment_transactions
                SET status = 'CANCELLED', updated_at = SYSUTCDATETIME()
                WHERE payment_transaction_id = @effective_transaction_id
                  AND status IN ('PENDING','PROCESSING');

                SET @final_status = 'PROCESSED';
            END
            ELSE
                SET @final_status = 'PROCESSED';
        END
        ELSE
            SET @final_status = 'PROCESSED';

        IF @need_finalize = 1
        BEGIN
            UPDATE dbo.payment_provider_events
            SET processing_status = 'PROCESSING',
                processed_at = NULL,
                error_message = NULL
            WHERE event_id = @event_id;
        END
        ELSE
        BEGIN
            IF @final_status IS NULL
            BEGIN
                SET @final_status = 'IGNORED';
                SET @final_error = N'Không có thay đổi trạng thái.';
            END;

            UPDATE dbo.payment_provider_events
            SET processing_status = @final_status,
                processed_at = SYSDATETIME(),
                error_message = @final_error
            WHERE event_id = @event_id;
        END;

        IF @need_finalize = 1
        BEGIN
            EXEC dbo.usp_payment_finalize
                @payment_transaction_id = @effective_transaction_id,
                @provider_transaction_id = @provider_transaction_id,
                @paid_at = @paid_at,
                @return_result = 0;

            IF NOT EXISTS (
                SELECT 1 FROM dbo.payment_attempts
                WHERE payment_transaction_id = @effective_transaction_id
                  AND status = 'SUCCESS'
            )
                UPDATE dbo.payment_attempts
                SET status = 'SUCCESS',
                    completed_at = SYSDATETIME(),
                    provider_reference = COALESCE(provider_reference, @provider_transaction_id),
                    error_code = NULL,
                    error_message = NULL
                WHERE payment_transaction_id = @effective_transaction_id
                  AND status IN ('PENDING','PROCESSING');
            ELSE
                UPDATE dbo.payment_attempts
                SET status = 'CANCELLED',
                    completed_at = SYSDATETIME(),
                    error_code = 'SUPERSEDED',
                    error_message = N'Đã có attempt thành công.'
                WHERE payment_transaction_id = @effective_transaction_id
                  AND status IN ('PENDING','PROCESSING');

            UPDATE dbo.payment_provider_events
            SET processing_status = 'PROCESSED',
                processed_at = SYSDATETIME(),
                error_message = NULL
            WHERE event_id = @event_id;
        END;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        DECLARE @failure NVARCHAR(1000) = LEFT(ERROR_MESSAGE(), 1000);
        DECLARE @failure_number INT = ERROR_NUMBER();
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        IF @failure_number = 52203 THROW;

        BEGIN TRANSACTION;
        SET @event_id = NULL;
        IF @provider_event_id IS NOT NULL
            SELECT @event_id = event_id
            FROM dbo.payment_provider_events WITH (UPDLOCK, HOLDLOCK)
            WHERE provider_id = @provider_id AND provider_event_id = @provider_event_id;

        IF @event_id IS NULL
        BEGIN
            INSERT INTO dbo.payment_provider_events (
                provider_id, payment_transaction_id, provider_event_id, event_type,
                event_payload, signature_valid, processing_status, received_at, processed_at, error_message
            ) VALUES (
                @provider_id, @effective_transaction_id, @provider_event_id, @event_type,
                @event_payload, 1, 'FAILED', @received_at, SYSDATETIME(), @failure
            );
            SET @event_id = SCOPE_IDENTITY();
        END
        ELSE
            UPDATE dbo.payment_provider_events
            SET processing_status = 'FAILED', processed_at = SYSDATETIME(), error_message = @failure
            WHERE event_id = @event_id AND processing_status NOT IN ('PROCESSED','IGNORED')
              AND signature_valid = 1 AND event_type = @event_type
              AND event_payload COLLATE Latin1_General_100_BIN2 = @event_payload COLLATE Latin1_General_100_BIN2
              AND (payment_transaction_id = @effective_transaction_id
                   OR (payment_transaction_id IS NULL AND @effective_transaction_id IS NULL));
        COMMIT TRANSACTION;
    END CATCH;

    SELECT event_id, processing_status, payment_transaction_id, error_message,
           CAST(0 AS BIT) AS is_duplicate
    FROM dbo.payment_provider_events
    WHERE event_id = @event_id;
END
GO



CREATE PROCEDURE dbo.usp_reconciliation_create
    @provider_id         INT = NULL,
    @branch_id           BIGINT = NULL,
    @period_start        DATETIME2(0),
    @period_end          DATETIME2(0),
    @created_by_user_id  BIGINT,
    @batch_code          VARCHAR(50) = NULL,
    @populate_system     BIT = 1
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @period_start IS NULL OR @period_end IS NULL OR @period_end <= @period_start
        THROW 52220, N'Khoảng thời gian đối soát không hợp lệ.', 1;
    IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE user_id = @created_by_user_id AND status = 'ACTIVE')
        THROW 52221, N'Người tạo đợt đối soát không hợp lệ.', 1;
    IF @provider_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM dbo.payment_providers WHERE provider_id = @provider_id)
        THROW 52222, N'Nhà cung cấp thanh toán không tồn tại.', 1;
    IF @branch_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM dbo.branches WHERE branch_id = @branch_id)
        THROW 52223, N'Chi nhánh không tồn tại.', 1;
    IF @populate_system = 1 AND @provider_id IS NULL
        THROW 52224, N'Đối soát tự động yêu cầu provider; tiền mặt dùng G10.', 1;
    IF @batch_code IS NULL OR LTRIM(RTRIM(@batch_code)) = ''
        SET @batch_code = 'REC-' + CONVERT(VARCHAR(36), NEWID());

    DECLARE @batch_id BIGINT,
            @items_created INT = 0;

    BEGIN TRY
        BEGIN TRANSACTION;

        INSERT INTO dbo.reconciliation_batches (
            batch_code, provider_id, branch_id, period_start, period_end,
            total_system_amount, total_provider_amount, difference_amount,
            status, created_by_user_id
        )
        VALUES (
            @batch_code, @provider_id, @branch_id, @period_start, @period_end,
            0, 0, 0, 'PENDING', @created_by_user_id
        );

        SET @batch_id = SCOPE_IDENTITY();

        IF @populate_system = 1
        BEGIN
            INSERT INTO dbo.reconciliation_items (
                reconciliation_batch_id, payment_transaction_id, provider_transaction_id,
                system_amount, provider_amount, difference_amount, match_status
            )
            SELECT @batch_id, pt.payment_transaction_id, pt.provider_transaction_id,
                   pt.amount, NULL, NULL, 'MISSING_IN_PROVIDER'
            FROM dbo.payment_transactions pt
            LEFT JOIN dbo.bookings b ON b.booking_id = pt.booking_id
            LEFT JOIN dbo.fnb_orders f ON f.fnb_order_id = pt.fnb_order_id
            WHERE pt.provider_id = @provider_id
              AND pt.status = 'SUCCESS'
              AND pt.paid_at >= @period_start
              AND pt.paid_at < @period_end
              AND (@branch_id IS NULL OR COALESCE(b.branch_id, f.branch_id) = @branch_id);

            SET @items_created = @@ROWCOUNT;
        END;

        COMMIT TRANSACTION;

        SELECT @batch_id AS reconciliation_batch_id,
               @batch_code AS batch_code,
               @items_created AS items_created;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() IN (2601, 2627)
            THROW 52225, N'Mã đợt đối soát đã tồn tại.', 1;
        THROW;
    END CATCH;
END
GO



CREATE PROCEDURE dbo.usp_reconciliation_apply_provider_item
    @reconciliation_batch_id BIGINT,
    @provider_transaction_id VARCHAR(150),
    @provider_amount          DECIMAL(18,2),
    @payment_transaction_id   BIGINT = NULL,
    @note                     NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @provider_transaction_id IS NULL OR LTRIM(RTRIM(@provider_transaction_id)) = ''
        THROW 52230, N'Mã giao dịch provider không được để trống.', 1;
    IF @provider_amount IS NULL OR @provider_amount < 0
        THROW 52231, N'Số tiền provider không hợp lệ.', 1;

    DECLARE @batch_provider_id INT,
            @batch_branch_id BIGINT,
            @period_start DATETIME2(0),
            @period_end DATETIME2(0),
            @batch_status VARCHAR(20);
    DECLARE @system_tx_id BIGINT,
            @system_amount DECIMAL(18,2),
            @system_branch_id BIGINT,
            @system_paid_at DATETIME2(0),
            @system_status VARCHAR(20),
            @system_provider_id INT,
            @system_provider_txn VARCHAR(150);
    DECLARE @item_id BIGINT,
            @existing_provider_amount DECIMAL(18,2),
            @existing_status VARCHAR(20);
    DECLARE @difference DECIMAL(18,2),
            @match_status VARCHAR(20),
            @scope_note NVARCHAR(500);

    BEGIN TRY
        BEGIN TRANSACTION;

        SELECT @batch_provider_id = provider_id,
               @batch_branch_id = branch_id,
               @period_start = period_start,
               @period_end = period_end,
               @batch_status = status
        FROM dbo.reconciliation_batches WITH (UPDLOCK, HOLDLOCK)
        WHERE reconciliation_batch_id = @reconciliation_batch_id;

        IF @batch_status IS NULL
            THROW 52232, N'Đợt đối soát không tồn tại.', 1;
        IF @batch_provider_id IS NULL
            THROW 52233, N'Đợt đối soát không gắn provider; tiền mặt dùng G10.', 1;
        IF @batch_status IN ('MATCHED','COMPLETED','FAILED')
            THROW 52234, N'Đợt đối soát đã kết thúc.', 1;

        IF @payment_transaction_id IS NOT NULL
        BEGIN
            SELECT @system_tx_id = pt.payment_transaction_id,
                   @system_amount = pt.amount,
                   @system_branch_id = COALESCE(b.branch_id, f.branch_id),
                   @system_paid_at = pt.paid_at,
                   @system_status = pt.status,
                   @system_provider_id = pt.provider_id,
                   @system_provider_txn = pt.provider_transaction_id
            FROM dbo.payment_transactions pt
            LEFT JOIN dbo.bookings b ON b.booking_id = pt.booking_id
            LEFT JOIN dbo.fnb_orders f ON f.fnb_order_id = pt.fnb_order_id
            WHERE pt.payment_transaction_id = @payment_transaction_id;

            IF @system_tx_id IS NULL
                THROW 52235, N'Giao dịch hệ thống không tồn tại.', 1;
            IF @system_provider_id <> @batch_provider_id
                THROW 52236, N'Giao dịch không thuộc provider của đợt.', 1;
            IF @system_status <> 'SUCCESS'
                THROW 52237, N'Giao dịch hệ thống chưa thành công.', 1;
            IF @system_provider_txn IS NULL OR @system_provider_txn <> @provider_transaction_id
                THROW 52238, N'Mã giao dịch provider không khớp giao dịch hệ thống.', 1;
            IF @system_paid_at < @period_start OR @system_paid_at >= @period_end
               OR (@batch_branch_id IS NOT NULL AND @system_branch_id <> @batch_branch_id)
                THROW 52239, N'Giao dịch nằm ngoài kỳ hoặc chi nhánh của đợt.', 1;
        END
        ELSE
        BEGIN
            SELECT @system_tx_id = pt.payment_transaction_id,
                   @system_amount = pt.amount,
                   @system_branch_id = COALESCE(b.branch_id, f.branch_id),
                   @system_paid_at = pt.paid_at,
                   @system_status = pt.status,
                   @system_provider_id = pt.provider_id,
                   @system_provider_txn = pt.provider_transaction_id
            FROM dbo.payment_transactions pt
            LEFT JOIN dbo.bookings b ON b.booking_id = pt.booking_id
            LEFT JOIN dbo.fnb_orders f ON f.fnb_order_id = pt.fnb_order_id
            WHERE pt.provider_id = @batch_provider_id
              AND pt.provider_transaction_id = @provider_transaction_id;

            IF @system_tx_id IS NOT NULL
               AND (
                   @system_status <> 'SUCCESS'
                   OR @system_paid_at < @period_start
                   OR @system_paid_at >= @period_end
                   OR (@batch_branch_id IS NOT NULL AND @system_branch_id <> @batch_branch_id)
               )
            BEGIN
                SET @scope_note = N'Giao dịch hệ thống ngoài kỳ/chi nhánh hoặc chưa thành công.';
                SET @system_tx_id = NULL;
                SET @system_amount = NULL;
                SET @system_branch_id = NULL;
                SET @system_paid_at = NULL;
            END
            ELSE IF @system_tx_id IS NULL
                SET @scope_note = N'Không tìm thấy giao dịch hệ thống tương ứng.';
        END;

        IF @system_tx_id IS NOT NULL
        BEGIN
            SELECT @item_id = reconciliation_item_id,
                   @existing_provider_amount = provider_amount,
                   @existing_status = match_status
            FROM dbo.reconciliation_items WITH (UPDLOCK, HOLDLOCK)
            WHERE reconciliation_batch_id = @reconciliation_batch_id
              AND payment_transaction_id = @system_tx_id;

            IF @item_id IS NULL
                SELECT @item_id = reconciliation_item_id,
                       @existing_provider_amount = provider_amount,
                       @existing_status = match_status
                FROM dbo.reconciliation_items WITH (UPDLOCK, HOLDLOCK)
                WHERE reconciliation_batch_id = @reconciliation_batch_id
                  AND provider_transaction_id = @provider_transaction_id;
        END
        ELSE
        BEGIN
            SELECT @item_id = reconciliation_item_id,
                   @existing_provider_amount = provider_amount,
                   @existing_status = match_status
            FROM dbo.reconciliation_items WITH (UPDLOCK, HOLDLOCK)
            WHERE reconciliation_batch_id = @reconciliation_batch_id
              AND provider_transaction_id = @provider_transaction_id;
        END;

        IF @item_id IS NOT NULL
        BEGIN
            IF @existing_status = 'RESOLVED'
                THROW 52240, N'Item đã được xử lý, không thể cập nhật.', 1;
            IF @existing_provider_amount IS NOT NULL
               AND @existing_provider_amount <> @provider_amount
                THROW 52241, N'Provider transaction đã có trong đợt với số tiền khác.', 1;

            IF @existing_provider_amount IS NOT NULL
               AND @existing_provider_amount = @provider_amount
            BEGIN
                UPDATE dbo.reconciliation_batches
                SET status = 'PROCESSING'
                WHERE reconciliation_batch_id = @reconciliation_batch_id
                  AND status IN ('PENDING','DISCREPANCY');

                COMMIT TRANSACTION;

                SELECT @item_id AS reconciliation_item_id,
                       @existing_status AS match_status,
                       @provider_amount AS provider_amount;
                RETURN;
            END;
        END;

        IF @system_tx_id IS NOT NULL
        BEGIN
            SET @difference = @system_amount - @provider_amount;
            SET @match_status = CASE WHEN @difference = 0 THEN 'MATCHED' ELSE 'AMOUNT_MISMATCH' END;

            IF @item_id IS NULL
            BEGIN
                INSERT INTO dbo.reconciliation_items (
                    reconciliation_batch_id, payment_transaction_id, provider_transaction_id,
                    system_amount, provider_amount, difference_amount, match_status, note
                )
                VALUES (
                    @reconciliation_batch_id, @system_tx_id, @provider_transaction_id,
                    @system_amount, @provider_amount, @difference, @match_status,
                    COALESCE(@note, @scope_note)
                );
                SET @item_id = SCOPE_IDENTITY();
            END
            ELSE
            BEGIN
                UPDATE dbo.reconciliation_items
                SET payment_transaction_id = @system_tx_id,
                    provider_transaction_id = @provider_transaction_id,
                    system_amount = @system_amount,
                    provider_amount = @provider_amount,
                    difference_amount = @difference,
                    match_status = @match_status,
                    note = COALESCE(@note, note, @scope_note)
                WHERE reconciliation_item_id = @item_id;
            END;
        END
        ELSE
        BEGIN
            SET @match_status = 'MISSING_IN_SYSTEM';

            IF @item_id IS NULL
            BEGIN
                INSERT INTO dbo.reconciliation_items (
                    reconciliation_batch_id, payment_transaction_id, provider_transaction_id,
                    system_amount, provider_amount, difference_amount, match_status, note
                )
                VALUES (
                    @reconciliation_batch_id, NULL, @provider_transaction_id,
                    NULL, @provider_amount, NULL, @match_status,
                    COALESCE(@note, @scope_note)
                );
                SET @item_id = SCOPE_IDENTITY();
            END
            ELSE
            BEGIN
                UPDATE dbo.reconciliation_items
                SET payment_transaction_id = NULL,
                    system_amount = NULL,
                    provider_amount = @provider_amount,
                    difference_amount = NULL,
                    match_status = @match_status,
                    note = COALESCE(@note, note, @scope_note)
                WHERE reconciliation_item_id = @item_id;
            END;
        END;

        UPDATE dbo.reconciliation_batches
        SET status = 'PROCESSING'
        WHERE reconciliation_batch_id = @reconciliation_batch_id
          AND status IN ('PENDING','DISCREPANCY');

        COMMIT TRANSACTION;

        SELECT @item_id AS reconciliation_item_id,
               @match_status AS match_status,
               @system_amount AS system_amount,
               @provider_amount AS provider_amount,
               @difference AS difference_amount,
               @scope_note AS note;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END
GO


CREATE PROCEDURE dbo.usp_reconciliation_finalize
    @reconciliation_batch_id BIGINT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @status VARCHAR(20),
            @total_system DECIMAL(18,2),
            @total_provider DECIMAL(18,2),
            @difference DECIMAL(18,2),
            @unresolved BIT,
            @new_status VARCHAR(20);

    BEGIN TRY
        BEGIN TRANSACTION;

        SELECT @status = status
        FROM dbo.reconciliation_batches WITH (UPDLOCK, HOLDLOCK)
        WHERE reconciliation_batch_id = @reconciliation_batch_id;

        IF @status IS NULL
            THROW 52250, N'Đợt đối soát không tồn tại.', 1;
        IF @status = 'FAILED'
            THROW 52251, N'Đợt đối soát đang ở trạng thái lỗi.', 1;

        IF @status IN ('MATCHED','COMPLETED')
        BEGIN
            SELECT reconciliation_batch_id, total_system_amount, total_provider_amount,
                   difference_amount, status
            FROM dbo.reconciliation_batches
            WHERE reconciliation_batch_id = @reconciliation_batch_id;

            COMMIT TRANSACTION;
            RETURN;
        END;

        SELECT @total_system = ISNULL(SUM(ISNULL(system_amount, 0)), 0),
               @total_provider = ISNULL(SUM(ISNULL(provider_amount, 0)), 0)
        FROM dbo.reconciliation_items
        WHERE reconciliation_batch_id = @reconciliation_batch_id;

        SET @difference = @total_system - @total_provider;
        SET @unresolved = CASE WHEN EXISTS (
            SELECT 1 FROM dbo.reconciliation_items
            WHERE reconciliation_batch_id = @reconciliation_batch_id
              AND match_status NOT IN ('MATCHED','RESOLVED')
        ) THEN 1 ELSE 0 END;
        SET @new_status = CASE
            WHEN @unresolved = 1 THEN 'DISCREPANCY'
            WHEN @difference = 0 THEN 'MATCHED'
            ELSE 'COMPLETED'
        END;

        UPDATE dbo.reconciliation_batches
        SET total_system_amount = @total_system,
            total_provider_amount = @total_provider,
            difference_amount = @difference,
            status = @new_status,
            completed_at = SYSDATETIME()
        WHERE reconciliation_batch_id = @reconciliation_batch_id
          AND status IN ('PENDING','PROCESSING','DISCREPANCY');

        IF @@ROWCOUNT <> 1
            THROW 52252, N'Đợt đối soát vừa được thay đổi bởi luồng khác.', 1;

        COMMIT TRANSACTION;

        SELECT @reconciliation_batch_id AS reconciliation_batch_id,
               @total_system AS total_system_amount,
               @total_provider AS total_provider_amount,
               @difference AS difference_amount,
               @new_status AS status;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END
GO


CREATE PROCEDURE dbo.usp_reconciliation_resolve_item
    @reconciliation_item_id BIGINT,
    @resolved_by_user_id    BIGINT,
    @note                   NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE user_id = @resolved_by_user_id AND status = 'ACTIVE')
        THROW 52260, N'Người xử lý không hợp lệ.', 1;

    DECLARE @batch_id BIGINT,
            @match_status VARCHAR(20),
            @batch_status VARCHAR(20);

    BEGIN TRY
        BEGIN TRANSACTION;

        SELECT @batch_id = reconciliation_batch_id,
               @match_status = match_status
        FROM dbo.reconciliation_items WITH (UPDLOCK, HOLDLOCK)
        WHERE reconciliation_item_id = @reconciliation_item_id;

        IF @batch_id IS NULL
            THROW 52261, N'Item đối soát không tồn tại.', 1;

        SELECT @batch_status = status
        FROM dbo.reconciliation_batches WITH (UPDLOCK, HOLDLOCK)
        WHERE reconciliation_batch_id = @batch_id;

        IF @batch_status IN ('MATCHED','COMPLETED','FAILED')
            THROW 52262, N'Đợt đối soát đã kết thúc.', 1;
        IF @match_status = 'MATCHED'
            THROW 52263, N'Item đã khớp, không cần xử lý.', 1;

        IF @match_status = 'RESOLVED'
        BEGIN
            SELECT @reconciliation_item_id AS reconciliation_item_id,
                   'RESOLVED' AS match_status,
                   @batch_id AS reconciliation_batch_id;

            COMMIT TRANSACTION;
            RETURN;
        END;

        UPDATE dbo.reconciliation_items
        SET match_status = 'RESOLVED',
            resolved_by_user_id = @resolved_by_user_id,
            resolved_at = SYSDATETIME(),
            note = COALESCE(@note, note)
        WHERE reconciliation_item_id = @reconciliation_item_id
          AND match_status <> 'MATCHED'
          AND match_status <> 'RESOLVED';

        IF @@ROWCOUNT <> 1
            THROW 52264, N'Item vừa được xử lý bởi luồng khác.', 1;

        UPDATE dbo.reconciliation_batches
        SET status = 'DISCREPANCY'
        WHERE reconciliation_batch_id = @batch_id
          AND status IN ('PENDING','PROCESSING');

        COMMIT TRANSACTION;

        SELECT @reconciliation_item_id AS reconciliation_item_id,
               'RESOLVED' AS match_status,
               @batch_id AS reconciliation_batch_id;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END
GO





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

INSERT INTO dbo.genres (genre_code, genre_name, display_order) VALUES
    ('ACTION',    N'Hành động',           1),
    ('ANIMATION', N'Hoạt hình',           2),
    ('COMEDY',    N'Hài',                 3),
    ('DRAMA',     N'Chính kịch',          4),
    ('HORROR',    N'Kinh dị',             5),
    ('ROMANCE',   N'Tình cảm',            6),
    ('SCI_FI',    N'Khoa học viễn tưởng', 7),
    ('THRILLER',  N'Giật gân',            8);
GO

INSERT INTO dbo.languages (language_code, language_name, native_name) VALUES
    ('vi', N'Tiếng Việt',  N'Tiếng Việt'),
    ('en', N'Tiếng Anh',   N'English'),
    ('ja', N'Tiếng Nhật',  N'日本語'),
    ('ko', N'Tiếng Hàn',   N'한국어'),
    ('zh', N'Tiếng Trung', N'中文'),
    ('th', N'Tiếng Thái',  N'ไทย');
GO

INSERT INTO dbo.screening_formats (format_code, format_name) VALUES
    ('TWO_D',   '2D'),
    ('THREE_D', '3D'),
    ('IMAX_2D', 'IMAX 2D'),
    ('IMAX_3D', 'IMAX 3D');
GO

INSERT INTO dbo.showtime_statuses (status_code, status_name, description, is_terminal, display_order) VALUES
    ('DRAFT',            N'Bản nháp',       N'Manager đang tạo, khách chưa thấy',        0, 1),
    ('SCHEDULED',        N'Đã lên lịch',    N'Đã duyệt hoặc lên lịch, chưa mở bán',      0, 2),
    ('OPEN_FOR_BOOKING', N'Đang mở bán',    N'Khách được phép đặt vé',                   0, 3),
    ('SOLD_OUT',         N'Đã bán hết',     N'Hệ thống tự tính khi hết ghế bán được',    0, 4),
    ('CANCELLED',        N'Đã hủy',         N'Suất chiếu bị hủy',                        1, 5),
    ('COMPLETED',        N'Đã hoàn thành',  N'Suất chiếu đã diễn ra',                    1, 6),
    ('DELAYED',          N'Bị trì hoãn',    N'Suất chiếu bị trì hoãn',                   0, 7);
GO

INSERT INTO dbo.showtime_seat_statuses (status_code, status_name, description, is_available_for_sale) VALUES
    ('AVAILABLE',   N'Còn trống',       N'Có thể bán',                    1),
    ('HELD',        N'Đang giữ chỗ',    N'Giữ chỗ tạm thời, chưa thanh toán', 0),
    ('BOOKED',      N'Đã đặt',          N'Đã đặt, chưa thanh toán',        0),
    ('SOLD',        N'Đã thanh toán',   N'Đã bán và thanh toán',           0),
    ('BLOCKED',     N'Bị khóa',         N'Không cho bán',                  0),
    ('UNAVAILABLE', N'Không khả dụng',  N'Ghế không dùng được cho suất',   0);
GO

INSERT INTO dbo.showtime_special_tags (tag_code, tag_name, display_order) VALUES
    ('EARLY_BIRD',         N'Suất chiếu sớm',              1),
    ('LAST_SHOW',          N'Suất cuối ngày',              2),
    ('SPECIAL_SCREENING',  N'Suất chiếu đặc biệt',         3),
    ('FAN_SCREENING',      N'Suất chiếu dành cho fan',     4),
    ('PREMIERE',           N'Suất công chiếu',             5),
    ('SNEAK_SHOW',         N'Suất chiếu sớm đặc biệt',     6);
GO

INSERT INTO dbo.booking_statuses (status_code, status_name, description, is_terminal, display_order) VALUES
    ('PENDING_PAYMENT', N'Chờ thanh toán', N'Đơn đang chờ trả tiền',       0, 1),
    ('CONFIRMED',       N'Đã xác nhận',    N'Đặt vé thành công',           0, 2),
    ('EXPIRED',         N'Đã hết hạn',     N'Quá thời gian thanh toán',    1, 3),
    ('CANCELLED',       N'Đã hủy',         N'Đơn đã bị hủy',               1, 4);
GO

INSERT INTO dbo.ticket_statuses (status_code, status_name, description, is_terminal) VALUES
    ('ISSUED',   N'Đã phát hành',    N'Vé hợp lệ',                    0),
    ('USED',     N'Đã sử dụng',      N'Đã quét vào rạp',              1),
    ('VOIDED',   N'Đã vô hiệu hóa',  N'Vé không còn hiệu lực',        1);
GO

INSERT INTO dbo.payment_methods (method_code, method_name, description, is_online, requires_provider, display_order) VALUES
    ('CASH',          N'Tiền mặt',               N'Thanh toán tại quầy',      0, 0, 1),
    ('CARD',          N'Thẻ ngân hàng',          N'Thẻ tín dụng/ghi nợ',      1, 1, 2),
    ('BANK_TRANSFER', N'Chuyển khoản ngân hàng', N'Chuyển khoản',             1, 1, 3),
    ('E_WALLET',      N'Ví điện tử',             N'Ví điện tử',               1, 1, 4),
    ('QR_BANKING',    N'QR Banking',             N'Quét mã QR ngân hàng',     1, 1, 5);
GO

INSERT INTO dbo.payment_providers (provider_code, provider_name, provider_type, api_base_url, callback_url, configuration, is_active) VALUES
    ('VNPAY',        N'VNPay',                     'GATEWAY', NULL, NULL, NULL, 1),
    ('MOMO',         N'MoMo',                      'WALLET',  NULL, NULL, NULL, 1),
    ('ZALOPAY',      N'ZaloPay',                   'WALLET',  NULL, NULL, NULL, 1),
    ('BANK_GATEWAY', N'Cổng thanh toán ngân hàng', 'BANK',    NULL, NULL, NULL, 1);
GO








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





































CREATE TABLE dbo.fnb_units (
    unit_id   BIGINT IDENTITY(1,1) NOT NULL,
    unit_code VARCHAR(20)          NOT NULL,
    unit_name NVARCHAR(50)          NOT NULL,
    unit_type VARCHAR(20)           NOT NULL,
    is_active BIT                   NOT NULL CONSTRAINT DF_fnb_units_is_active DEFAULT 1,
    CONSTRAINT PK_fnb_units PRIMARY KEY (unit_id),
    CONSTRAINT UQ_fnb_units_unit_code UNIQUE (unit_code),
    CONSTRAINT CK_fnb_units_unit_type CHECK (unit_type IN ('MASS','VOLUME','COUNT'))
);
GO

INSERT INTO dbo.fnb_units (unit_code, unit_name, unit_type) VALUES
    ('G',   N'Gram',       'MASS'),
    ('KG',  N'Kilogram',   'MASS'),
    ('ML',  N'Milliliter', 'VOLUME'),
    ('L',   N'Liter',      'VOLUME'),
    ('PCS', N'Cái',        'COUNT');
GO


CREATE TABLE dbo.fnb_ingredients (
    ingredient_id   BIGINT IDENTITY(1,1) NOT NULL,
    ingredient_code VARCHAR(40)          NOT NULL,
    ingredient_name NVARCHAR(150)        NOT NULL,
    ingredient_type VARCHAR(20)          NOT NULL,
    base_unit_id    BIGINT               NOT NULL,
    description     NVARCHAR(500)        NULL,
    is_perishable   BIT                  NOT NULL CONSTRAINT DF_fnb_ingredients_is_perishable DEFAULT 0,
    is_active       BIT                  NOT NULL CONSTRAINT DF_fnb_ingredients_is_active DEFAULT 1,
    created_at      DATETIME2(0)         NOT NULL CONSTRAINT DF_fnb_ingredients_created_at DEFAULT SYSUTCDATETIME(),
    updated_at      DATETIME2(0)         NULL,
    CONSTRAINT PK_fnb_ingredients PRIMARY KEY (ingredient_id),
    CONSTRAINT UQ_fnb_ingredients_ingredient_code UNIQUE (ingredient_code),
    CONSTRAINT CK_fnb_ingredients_type CHECK (ingredient_type IN ('RAW_MATERIAL','PACKAGING','SUPPLY')),
    CONSTRAINT FK_fnb_ingredients_base_unit FOREIGN KEY (base_unit_id) REFERENCES dbo.fnb_units (unit_id)
);
GO

CREATE TRIGGER dbo.TRG_fnb_units_base_unit_immutable
ON dbo.fnb_units
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF (UPDATE(unit_code) OR UPDATE(unit_type)) AND EXISTS (
        SELECT 1
        FROM inserted i
        JOIN deleted d ON d.unit_id = i.unit_id
        WHERE (i.unit_code <> d.unit_code OR i.unit_type <> d.unit_type)
          AND EXISTS (
              SELECT 1
              FROM dbo.fnb_ingredients ingredient
              WHERE ingredient.base_unit_id = i.unit_id
          )
    )
        THROW 52328, N'Không thể đổi mã hoặc loại đơn vị đang được nguyên liệu sử dụng.', 1;
END;
GO


CREATE TABLE dbo.fnb_inventory (
    inventory_id     BIGINT IDENTITY(1,1) NOT NULL,
    branch_id        BIGINT               NOT NULL,
    ingredient_id    BIGINT               NOT NULL,
    quantity_on_hand DECIMAL(18,3)         NOT NULL CONSTRAINT DF_fnb_inventory_quantity_on_hand DEFAULT 0,
    reorder_level    DECIMAL(18,3)         NOT NULL CONSTRAINT DF_fnb_inventory_reorder_level DEFAULT 0,
    updated_at       DATETIME2(0)          NOT NULL CONSTRAINT DF_fnb_inventory_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_fnb_inventory PRIMARY KEY (inventory_id),
    CONSTRAINT UQ_fnb_inventory_branch_ingredient UNIQUE (branch_id, ingredient_id),
    CONSTRAINT CK_fnb_inventory_quantity_on_hand CHECK (quantity_on_hand >= 0),
    CONSTRAINT CK_fnb_inventory_reorder_level CHECK (reorder_level >= 0),
    CONSTRAINT FK_fnb_inventory_branch FOREIGN KEY (branch_id) REFERENCES dbo.branches (branch_id),
    CONSTRAINT FK_fnb_inventory_ingredient FOREIGN KEY (ingredient_id) REFERENCES dbo.fnb_ingredients (ingredient_id)
);
GO

CREATE PROCEDURE dbo.usp_fnb_inventory_open
    @branch_id BIGINT,
    @ingredient_id BIGINT,
    @reorder_level DECIMAL(18,3) = 0,
    @inventory_id BIGINT OUTPUT
WITH EXECUTE AS OWNER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @started_transaction BIT = 0;

    IF @branch_id IS NULL OR @ingredient_id IS NULL OR
       @reorder_level IS NULL OR @reorder_level < 0
        THROW 52325, N'Thông tin mở tồn kho không hợp lệ.', 1;

    BEGIN TRY
        IF @@TRANCOUNT = 0
        BEGIN
            BEGIN TRANSACTION;
            SET @started_transaction = 1;
        END
        ELSE
            SAVE TRANSACTION fnb_inventory_open;

        SET @inventory_id = NULL;
        SELECT @inventory_id = inventory_id
        FROM dbo.fnb_inventory WITH (UPDLOCK, HOLDLOCK)
        WHERE branch_id = @branch_id AND ingredient_id = @ingredient_id;

        IF @inventory_id IS NULL
        BEGIN
            INSERT INTO dbo.fnb_inventory (branch_id, ingredient_id, reorder_level)
            VALUES (@branch_id, @ingredient_id, @reorder_level);
            SET @inventory_id = SCOPE_IDENTITY();
        END
        ELSE
        BEGIN
            UPDATE dbo.fnb_inventory
            SET reorder_level = @reorder_level,
                updated_at = SYSUTCDATETIME()
            WHERE inventory_id = @inventory_id;
        END;

        IF @started_transaction = 1 COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0
        BEGIN
            IF @started_transaction = 1 OR XACT_STATE() = -1
                ROLLBACK TRANSACTION;
            ELSE
                ROLLBACK TRANSACTION fnb_inventory_open;
        END;
        THROW;
    END CATCH;
END;
GO

CREATE TRIGGER dbo.TRG_fnb_ingredients_base_unit_immutable
ON dbo.fnb_ingredients
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF UPDATE(base_unit_id) AND EXISTS (
        SELECT 1
        FROM inserted i
        JOIN deleted d ON d.ingredient_id = i.ingredient_id
        WHERE i.base_unit_id <> d.base_unit_id
          AND EXISTS (
              SELECT 1
              FROM dbo.fnb_inventory inv
              WHERE inv.ingredient_id = i.ingredient_id
          )
    )
        THROW 52324, N'Không thể đổi đơn vị gốc sau khi đã mở tồn kho.', 1;
END;
GO


CREATE TABLE dbo.fnb_stock_batches (
    stock_batch_id       BIGINT IDENTITY(1,1) NOT NULL,
    inventory_id         BIGINT               NOT NULL,
    batch_code           VARCHAR(60)          NOT NULL,
    received_quantity    DECIMAL(18,3)         NOT NULL CONSTRAINT DF_fnb_stock_batches_received_quantity DEFAULT 0,
    remaining_quantity   DECIMAL(18,3)         NOT NULL CONSTRAINT DF_fnb_stock_batches_remaining_quantity DEFAULT 0,
    unit_cost            DECIMAL(18,4)         NOT NULL CONSTRAINT DF_fnb_stock_batches_unit_cost DEFAULT 0,
    manufactured_at      DATE                 NULL,
    received_at          DATETIME2(0)          NOT NULL CONSTRAINT DF_fnb_stock_batches_received_at DEFAULT SYSUTCDATETIME(),
    expiry_date          DATE                 NULL,
    batch_status         VARCHAR(20)          NOT NULL CONSTRAINT DF_fnb_stock_batches_status DEFAULT 'AVAILABLE',
    note                 NVARCHAR(300)        NULL,
    CONSTRAINT PK_fnb_stock_batches PRIMARY KEY (stock_batch_id),
    CONSTRAINT UQ_fnb_stock_batches_inventory_batch_code UNIQUE (inventory_id, batch_code),
    CONSTRAINT UQ_fnb_stock_batches_inventory_batch_id UNIQUE (inventory_id, stock_batch_id),
    CONSTRAINT CK_fnb_stock_batches_received_quantity CHECK (received_quantity >= 0),
    CONSTRAINT CK_fnb_stock_batches_remaining_quantity CHECK (remaining_quantity >= 0 AND remaining_quantity <= received_quantity),
    CONSTRAINT CK_fnb_stock_batches_unit_cost CHECK (unit_cost >= 0),
    CONSTRAINT CK_fnb_stock_batches_status CHECK (batch_status IN ('AVAILABLE','BLOCKED','EXPIRED','DEPLETED')),
    CONSTRAINT CK_fnb_stock_batches_status_balance CHECK (
        (remaining_quantity = 0 AND batch_status = 'DEPLETED') OR
        (remaining_quantity > 0 AND batch_status <> 'DEPLETED')
    ),
    CONSTRAINT FK_fnb_stock_batches_inventory FOREIGN KEY (inventory_id) REFERENCES dbo.fnb_inventory (inventory_id)
);
GO
CREATE INDEX IX_fnb_stock_batches_inventory_expiry
    ON dbo.fnb_stock_batches (inventory_id, expiry_date, stock_batch_id)
    INCLUDE (remaining_quantity, batch_status);
GO


CREATE TABLE dbo.fnb_inventory_transactions (
    inventory_transaction_id          BIGINT IDENTITY(1,1) NOT NULL,
    inventory_id                      BIGINT               NOT NULL,
    stock_batch_id                    BIGINT               NOT NULL,
    transaction_type                  VARCHAR(30)          NOT NULL,
    quantity_change                   DECIMAL(18,3)         NOT NULL,
    quantity_before                   DECIMAL(18,3)         NOT NULL,
    quantity_after                    DECIMAL(18,3)         NOT NULL,
    batch_quantity_before             DECIMAL(18,3)         NOT NULL,
    batch_quantity_after              DECIMAL(18,3)         NOT NULL,
    reference_type                    VARCHAR(30)          NULL,
    reference_id                      BIGINT               NULL,
    reversal_of_inventory_transaction_id BIGINT            NULL,
    idempotency_key                   UNIQUEIDENTIFIER     NOT NULL,
    note                              NVARCHAR(500)        NULL,
    created_by                        BIGINT               NULL,
    created_at                        DATETIME2(0)          NOT NULL CONSTRAINT DF_fnb_inventory_transactions_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_fnb_inventory_transactions PRIMARY KEY (inventory_transaction_id),
    CONSTRAINT UQ_fnb_inventory_transactions_idempotency_key UNIQUE (idempotency_key),
    CONSTRAINT CK_fnb_inventory_transactions_type CHECK (transaction_type IN ('PURCHASE','SALE','WASTE','ADJUSTMENT','REVERSAL')),
    CONSTRAINT CK_fnb_inventory_transactions_change CHECK (
        quantity_change <> 0 AND
        ((transaction_type = 'PURCHASE' AND quantity_change > 0) OR
         (transaction_type IN ('SALE','WASTE') AND quantity_change < 0) OR
         transaction_type IN ('ADJUSTMENT','REVERSAL'))
    ),
    CONSTRAINT CK_fnb_inventory_transactions_balance CHECK (
        quantity_before >= 0 AND quantity_after >= 0 AND
        quantity_after = quantity_before + quantity_change
    ),
    CONSTRAINT CK_fnb_inventory_transactions_batch_balance CHECK (
        batch_quantity_before >= 0 AND batch_quantity_after >= 0 AND
        batch_quantity_after = batch_quantity_before + quantity_change
    ),
    CONSTRAINT CK_fnb_inventory_transactions_reference CHECK (
        (reference_type IS NULL AND reference_id IS NULL) OR
        (reference_type IS NOT NULL AND LEN(reference_type) > 0 AND reference_id IS NOT NULL)
    ),
    CONSTRAINT CK_fnb_inventory_transactions_reversal CHECK (
        (transaction_type = 'REVERSAL' AND reversal_of_inventory_transaction_id IS NOT NULL) OR
        (transaction_type <> 'REVERSAL' AND reversal_of_inventory_transaction_id IS NULL)
    ),
    CONSTRAINT FK_fnb_inventory_transactions_inventory FOREIGN KEY (inventory_id) REFERENCES dbo.fnb_inventory (inventory_id),
    CONSTRAINT FK_fnb_inventory_transactions_batch FOREIGN KEY (inventory_id, stock_batch_id)
        REFERENCES dbo.fnb_stock_batches (inventory_id, stock_batch_id),
    CONSTRAINT FK_fnb_inventory_transactions_reversal FOREIGN KEY (reversal_of_inventory_transaction_id)
        REFERENCES dbo.fnb_inventory_transactions (inventory_transaction_id),
    CONSTRAINT FK_fnb_inventory_transactions_created_by FOREIGN KEY (created_by) REFERENCES dbo.users (user_id)
);
GO
CREATE INDEX IX_fnb_inventory_transactions_inventory_created_at
    ON dbo.fnb_inventory_transactions (inventory_id, created_at, inventory_transaction_id);
GO
CREATE INDEX IX_fnb_inventory_transactions_batch_created_at
    ON dbo.fnb_inventory_transactions (inventory_id, stock_batch_id, created_at, inventory_transaction_id)
    WHERE stock_batch_id IS NOT NULL;
GO
CREATE INDEX IX_fnb_inventory_transactions_reversal
    ON dbo.fnb_inventory_transactions (reversal_of_inventory_transaction_id)
    WHERE reversal_of_inventory_transaction_id IS NOT NULL;
GO
CREATE UNIQUE INDEX UX_fnb_inventory_transactions_reference_batch
    ON dbo.fnb_inventory_transactions (reference_type, reference_id, transaction_type, inventory_id, stock_batch_id)
    WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL;
GO

CREATE TRIGGER dbo.TRG_fnb_inventory_transactions_append_only
ON dbo.fnb_inventory_transactions
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 52300, N'Lịch sử giao dịch kho chỉ được ghi thêm, không được sửa hoặc xóa.', 1;
END;
GO




CREATE PROCEDURE dbo.usp_fnb_inventory_apply_transaction
    @inventory_id BIGINT,
    @transaction_type VARCHAR(30),
    @quantity_change DECIMAL(18,3),
    @idempotency_key UNIQUEIDENTIFIER,
    @stock_batch_id BIGINT = NULL,
    @batch_code VARCHAR(60) = NULL,
    @unit_cost DECIMAL(18,4) = NULL,
    @manufactured_at DATE = NULL,
    @expiry_date DATE = NULL,
    @reference_type VARCHAR(30) = NULL,
    @reference_id BIGINT = NULL,
    @reversal_of_inventory_transaction_id BIGINT = NULL,
    @note NVARCHAR(500) = NULL,
    @created_by BIGINT = NULL,
    @inventory_transaction_id BIGINT OUTPUT,
    @result_stock_batch_id BIGINT OUTPUT
WITH EXECUTE AS OWNER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @started_transaction BIT = 0;

    IF @inventory_id IS NULL OR @idempotency_key IS NULL OR
       @quantity_change IS NULL OR @transaction_type IS NULL
        THROW 52301, N'Thiếu thông tin bắt buộc của giao dịch kho.', 1;
    IF @quantity_change = 0
        THROW 52301, N'Lượng thay đổi phải khác 0.', 1;
    IF @transaction_type NOT IN ('PURCHASE','SALE','WASTE','ADJUSTMENT','REVERSAL')
        THROW 52302, N'Loại giao dịch kho không hợp lệ.', 1;
    IF @transaction_type = 'PURCHASE' AND @quantity_change <= 0
        THROW 52303, N'Giao dịch nhập hàng phải làm tăng tồn kho.', 1;
    IF @transaction_type IN ('SALE','WASTE') AND @quantity_change >= 0
        THROW 52304, N'Giao dịch bán hoặc hao hụt phải làm giảm tồn kho.', 1;
    IF (@reference_type IS NULL AND @reference_id IS NOT NULL) OR
       (@reference_type IS NOT NULL AND @reference_id IS NULL)
        THROW 52305, N'Thông tin chứng từ phải có đủ loại và mã.', 1;
    IF @reference_type IS NOT NULL AND LEN(@reference_type) = 0
        THROW 52305, N'Loại chứng từ không được để trống.', 1;
    IF @transaction_type = 'PURCHASE' AND
       (@stock_batch_id IS NOT NULL OR @batch_code IS NULL OR LEN(LTRIM(RTRIM(@batch_code))) = 0 OR @unit_cost IS NULL OR @unit_cost < 0)
        THROW 52306, N'Nhập hàng cần mã lô và giá vốn hợp lệ, không truyền stock_batch_id.', 1;
    IF @transaction_type = 'PURCHASE'
        SET @batch_code = LTRIM(RTRIM(@batch_code));
    IF @manufactured_at IS NOT NULL AND @expiry_date IS NOT NULL AND @manufactured_at > @expiry_date
        THROW 52326, N'Ngày sản xuất phải trước hoặc bằng hạn sử dụng.', 1;
    IF @transaction_type <> 'PURCHASE' AND
       (@batch_code IS NOT NULL OR @unit_cost IS NOT NULL OR @manufactured_at IS NOT NULL OR @expiry_date IS NOT NULL)
        THROW 52307, N'Thông tin tạo lô chỉ dùng cho giao dịch PURCHASE.', 1;
    IF @transaction_type <> 'PURCHASE' AND @stock_batch_id IS NULL
        THROW 52308, N'Giao dịch phải chỉ định lô hàng.', 1;
    IF @transaction_type = 'REVERSAL' AND @reversal_of_inventory_transaction_id IS NULL
        THROW 52309, N'Giao dịch đảo ngược phải chỉ định giao dịch gốc.', 1;
    IF @transaction_type <> 'REVERSAL' AND @reversal_of_inventory_transaction_id IS NOT NULL
        THROW 52310, N'Chỉ giao dịch REVERSAL được chỉ định giao dịch gốc.', 1;

    SET @inventory_transaction_id = NULL;
    SET @result_stock_batch_id = NULL;

    DECLARE @existing_id BIGINT,
            @existing_inventory_id BIGINT,
            @existing_batch_id BIGINT,
            @existing_type VARCHAR(30),
            @existing_change DECIMAL(18,3),
            @existing_reference_type VARCHAR(30),
            @existing_reference_id BIGINT,
            @existing_reversal_id BIGINT,
            @existing_note NVARCHAR(500),
            @existing_created_by BIGINT,
            @existing_batch_code VARCHAR(60),
            @existing_unit_cost DECIMAL(18,4),
            @existing_manufactured_at DATE,
            @existing_expiry_date DATE,
            @quantity_before DECIMAL(18,3),
            @quantity_after DECIMAL(18,3),
            @batch_total DECIMAL(38,3),
            @batch_before DECIMAL(18,3),
            @batch_after DECIMAL(18,3),
            @batch_received DECIMAL(18,3),
            @batch_status VARCHAR(20),
            @batch_expiry DATE,
            @batch_manufactured DATE,
            @batch_unit_cost DECIMAL(18,4),
            @original_inventory_id BIGINT,
            @original_batch_id BIGINT,
            @original_change DECIMAL(18,3),
            @already_reversed DECIMAL(38,3);

    BEGIN TRY
        IF @@TRANCOUNT = 0
        BEGIN
            BEGIN TRANSACTION;
            SET @started_transaction = 1;
        END

        EXEC dbo.usp_fnb_lock_stock;

        SELECT @existing_id = t.inventory_transaction_id,
               @existing_inventory_id = t.inventory_id,
               @existing_batch_id = t.stock_batch_id,
               @existing_type = t.transaction_type,
               @existing_change = t.quantity_change,
               @existing_reference_type = t.reference_type,
               @existing_reference_id = t.reference_id,
               @existing_reversal_id = t.reversal_of_inventory_transaction_id,
               @existing_note = t.note,
               @existing_created_by = t.created_by,
               @existing_batch_code = b.batch_code,
               @existing_unit_cost = b.unit_cost,
               @existing_manufactured_at = b.manufactured_at,
               @existing_expiry_date = b.expiry_date
        FROM dbo.fnb_inventory_transactions t WITH (UPDLOCK, HOLDLOCK)
        LEFT JOIN dbo.fnb_stock_batches b ON b.stock_batch_id = t.stock_batch_id
        WHERE t.idempotency_key = @idempotency_key;

        IF @existing_id IS NOT NULL
        BEGIN
            IF @existing_inventory_id <> @inventory_id OR
               @existing_type <> @transaction_type OR
               @existing_change <> @quantity_change OR
               (@existing_reference_type IS NULL AND @reference_type IS NOT NULL) OR
               (@existing_reference_type IS NOT NULL AND @reference_type IS NULL) OR
               (@existing_reference_type IS NOT NULL AND @existing_reference_type <> @reference_type) OR
               (@existing_reference_id IS NULL AND @reference_id IS NOT NULL) OR
               (@existing_reference_id IS NOT NULL AND @existing_reference_id <> @reference_id) OR
               (@existing_reversal_id IS NULL AND @reversal_of_inventory_transaction_id IS NOT NULL) OR
               (@existing_reversal_id IS NOT NULL AND @existing_reversal_id <> @reversal_of_inventory_transaction_id) OR
               (@existing_note IS NULL AND @note IS NOT NULL) OR
               (@existing_note IS NOT NULL AND @existing_note <> @note) OR
               (@existing_created_by IS NULL AND @created_by IS NOT NULL) OR
               (@existing_created_by IS NOT NULL AND @existing_created_by <> @created_by) OR
               (@transaction_type = 'PURCHASE' AND
                   (@existing_batch_code <> @batch_code OR @existing_unit_cost <> @unit_cost OR
                    (@existing_manufactured_at IS NULL AND @manufactured_at IS NOT NULL) OR
                     (@existing_manufactured_at IS NOT NULL AND @manufactured_at IS NULL) OR
                    (@existing_manufactured_at IS NOT NULL AND @existing_manufactured_at <> @manufactured_at) OR
                    (@existing_expiry_date IS NULL AND @expiry_date IS NOT NULL) OR
                     (@existing_expiry_date IS NOT NULL AND @expiry_date IS NULL) OR
                    (@existing_expiry_date IS NOT NULL AND @existing_expiry_date <> @expiry_date))) OR
               (@transaction_type <> 'PURCHASE' AND
                   (@existing_batch_id IS NULL AND @stock_batch_id IS NOT NULL OR
                    @existing_batch_id IS NOT NULL AND @existing_batch_id <> @stock_batch_id))
                THROW 52311, N'idempotency_key đã được dùng cho nội dung giao dịch khác.', 1;

            SET @inventory_transaction_id = @existing_id;
            SET @result_stock_batch_id = @existing_batch_id;
            IF @started_transaction = 1 COMMIT TRANSACTION;
            RETURN;
        END;

        SELECT @quantity_before = quantity_on_hand
        FROM dbo.fnb_inventory WITH (UPDLOCK, HOLDLOCK)
        WHERE inventory_id = @inventory_id;
        IF @quantity_before IS NULL
            THROW 52312, N'Dòng tồn kho không tồn tại.', 1;

        SELECT @batch_total = COALESCE(SUM(remaining_quantity), 0)
        FROM dbo.fnb_stock_batches
        WHERE inventory_id = @inventory_id;
        IF @batch_total <> @quantity_before
            THROW 52327, N'Tồn tổng không khớp tổng số dư các lô.', 1;

        SET @quantity_after = @quantity_before + @quantity_change;
        IF @quantity_after < 0
            THROW 52313, N'Tồn kho không đủ để thực hiện giao dịch.', 1;

        IF @transaction_type = 'PURCHASE'
        BEGIN
            IF @expiry_date IS NOT NULL AND @expiry_date < CONVERT(DATE, SYSUTCDATETIME())
                THROW 52314, N'Không thể nhập lô đã hết hạn.', 1;

            SELECT @result_stock_batch_id = stock_batch_id,
                   @batch_before = remaining_quantity,
                   @batch_received = received_quantity,
                   @batch_status = batch_status,
                   @batch_expiry = expiry_date,
                   @batch_manufactured = manufactured_at,
                   @batch_unit_cost = unit_cost
            FROM dbo.fnb_stock_batches WITH (UPDLOCK, HOLDLOCK)
            WHERE inventory_id = @inventory_id AND batch_code = @batch_code;

            IF @result_stock_batch_id IS NOT NULL
            BEGIN
                IF @batch_expiry IS NOT NULL AND @batch_expiry < CONVERT(DATE, SYSUTCDATETIME())
                    THROW 52314, N'Không thể nhập lô đã hết hạn.', 1;

                IF @batch_status NOT IN ('AVAILABLE','DEPLETED') OR
                   @batch_unit_cost <> @unit_cost OR
                   (@batch_manufactured IS NULL AND @manufactured_at IS NOT NULL) OR
                   (@batch_manufactured IS NOT NULL AND @manufactured_at IS NULL) OR
                   (@batch_manufactured IS NOT NULL AND @batch_manufactured <> @manufactured_at) OR
                   (@batch_expiry IS NULL AND @expiry_date IS NOT NULL) OR
                   (@batch_expiry IS NOT NULL AND @expiry_date IS NULL) OR
                   (@batch_expiry IS NOT NULL AND @batch_expiry <> @expiry_date)
                    THROW 52315, N'Mã lô đã tồn tại với trạng thái hoặc thông tin khác.', 1;
            END
            ELSE
            BEGIN
                INSERT INTO dbo.fnb_stock_batches (
                    inventory_id, batch_code, unit_cost, manufactured_at, expiry_date,
                    batch_status
                )
                VALUES (
                    @inventory_id, @batch_code, @unit_cost, @manufactured_at, @expiry_date,
                    'DEPLETED'
                );
                SET @result_stock_batch_id = SCOPE_IDENTITY();
                SET @batch_before = 0;
                SET @batch_received = 0;
                SET @batch_status = 'DEPLETED';
                SET @batch_expiry = @expiry_date;
            END;
        END
        ELSE
        BEGIN
            SELECT @result_stock_batch_id = stock_batch_id,
                   @batch_before = remaining_quantity,
                   @batch_received = received_quantity,
                   @batch_status = batch_status,
                   @batch_expiry = expiry_date
            FROM dbo.fnb_stock_batches WITH (UPDLOCK, HOLDLOCK)
            WHERE inventory_id = @inventory_id AND stock_batch_id = @stock_batch_id;
            IF @result_stock_batch_id IS NULL
                THROW 52316, N'Lô hàng không thuộc dòng tồn kho đã chọn.', 1;
        END;

        IF @result_stock_batch_id IS NOT NULL
        BEGIN
            IF @transaction_type = 'SALE' AND
               (@batch_status <> 'AVAILABLE' OR
                (@batch_expiry IS NOT NULL AND @batch_expiry < CONVERT(DATE, SYSUTCDATETIME())))
                THROW 52317, N'Lô hàng không khả dụng để bán.', 1;
            IF @transaction_type = 'PURCHASE' AND @batch_status NOT IN ('AVAILABLE','DEPLETED')
                THROW 52318, N'Lô hàng không thể nhận thêm.', 1;

            SET @batch_after = @batch_before + @quantity_change;
            IF @batch_after < 0
                THROW 52319, N'Số lượng lô không đủ để thực hiện giao dịch.', 1;
            IF @quantity_change < 0 AND @batch_after < (
                SELECT COALESCE(SUM(quantity), 0)
                FROM dbo.fnb_stock_reservations
                WHERE stock_batch_id = @result_stock_batch_id
                  AND (expires_at IS NULL OR expires_at > SYSDATETIME())
            )
                THROW 52329, N'Lô không còn đủ số lượng sau khi trừ phần đã giữ cho đơn hàng.', 1;
            IF @transaction_type = 'PURCHASE'
                SET @batch_received = @batch_received + @quantity_change;
            IF @batch_after > @batch_received
                THROW 52320, N'Số dư lô không thể vượt số lượng đã nhận.', 1;
        END
        ELSE
            THROW 52316, N'Giao dịch phải chỉ định lô hàng.', 1;

        IF @transaction_type = 'REVERSAL'
        BEGIN
            SELECT @original_inventory_id = inventory_id,
                   @original_batch_id = stock_batch_id,
                   @original_change = quantity_change
            FROM dbo.fnb_inventory_transactions WITH (UPDLOCK, HOLDLOCK)
            WHERE inventory_transaction_id = @reversal_of_inventory_transaction_id
              AND transaction_type <> 'REVERSAL';
            IF @original_inventory_id IS NULL
                THROW 52321, N'Giao dịch gốc không tồn tại hoặc không thể đảo ngược.', 1;
            IF @original_inventory_id <> @inventory_id OR
               @original_batch_id <> @result_stock_batch_id OR
               @original_change * @quantity_change >= 0
                THROW 52322, N'Giao dịch đảo ngược không khớp với giao dịch gốc.', 1;

            SELECT @already_reversed = COALESCE(SUM(ABS(CAST(quantity_change AS DECIMAL(38,3)))), 0)
            FROM dbo.fnb_inventory_transactions WITH (UPDLOCK, HOLDLOCK)
            WHERE reversal_of_inventory_transaction_id = @reversal_of_inventory_transaction_id;
            IF @already_reversed + ABS(CAST(@quantity_change AS DECIMAL(38,3))) >
               ABS(CAST(@original_change AS DECIMAL(38,3)))
                THROW 52323, N'Tổng lượng đảo ngược vượt lượng giao dịch gốc.', 1;
        END;

        UPDATE dbo.fnb_inventory
        SET quantity_on_hand = @quantity_after,
            updated_at = SYSUTCDATETIME()
        WHERE inventory_id = @inventory_id;

        IF @result_stock_batch_id IS NOT NULL
        BEGIN
            UPDATE dbo.fnb_stock_batches
            SET received_quantity = CASE WHEN @transaction_type = 'PURCHASE' THEN @batch_received ELSE received_quantity END,
                remaining_quantity = @batch_after,
                batch_status = CASE
                    WHEN @batch_after = 0 THEN 'DEPLETED'
                    WHEN @transaction_type = 'PURCHASE' THEN 'AVAILABLE'
                    WHEN batch_status = 'DEPLETED' AND expiry_date < CONVERT(DATE, SYSUTCDATETIME()) THEN 'EXPIRED'
                    WHEN batch_status = 'DEPLETED' THEN 'AVAILABLE'
                    WHEN expiry_date < CONVERT(DATE, SYSUTCDATETIME()) THEN 'EXPIRED'
                    ELSE batch_status
                END
            WHERE inventory_id = @inventory_id
              AND stock_batch_id = @result_stock_batch_id;
        END;

        INSERT INTO dbo.fnb_inventory_transactions (
            inventory_id, stock_batch_id, transaction_type, quantity_change,
            quantity_before, quantity_after, batch_quantity_before, batch_quantity_after,
            reference_type, reference_id, reversal_of_inventory_transaction_id,
            idempotency_key, note, created_by
        )
        VALUES (
            @inventory_id, @result_stock_batch_id, @transaction_type, @quantity_change,
            @quantity_before, @quantity_after, @batch_before, @batch_after,
            @reference_type, @reference_id, @reversal_of_inventory_transaction_id,
            @idempotency_key, @note, @created_by
        );
        SET @inventory_transaction_id = SCOPE_IDENTITY();

        IF @started_transaction = 1 COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

CREATE ROLE fnb_inventory_writer AUTHORIZATION dbo;
GO
GRANT EXECUTE ON OBJECT::dbo.usp_fnb_inventory_open TO fnb_inventory_writer;
GRANT EXECUTE ON OBJECT::dbo.usp_fnb_inventory_apply_transaction TO fnb_inventory_writer;
DENY INSERT, UPDATE, DELETE ON OBJECT::dbo.fnb_inventory TO fnb_inventory_writer;
DENY INSERT, UPDATE, DELETE ON OBJECT::dbo.fnb_stock_batches TO fnb_inventory_writer;
DENY INSERT, UPDATE, DELETE ON OBJECT::dbo.fnb_inventory_transactions TO fnb_inventory_writer;
GO

CREATE TABLE dbo.fnb_product_recipes (
    recipe_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_fnb_product_recipes PRIMARY KEY,
    variant_id BIGINT NOT NULL REFERENCES dbo.fnb_product_variants (variant_id),
    recipe_code VARCHAR(50) NOT NULL UNIQUE,
    version_number INT NOT NULL CHECK (version_number > 0),
    yield_quantity DECIMAL(12,3) NOT NULL DEFAULT 1 CHECK (yield_quantity > 0),
    effective_from DATETIME2(0) NOT NULL,
    effective_until DATETIME2(0) NULL,
    is_active BIT NOT NULL DEFAULT 1,
    CONSTRAINT UQ_fnb_product_recipes_version UNIQUE (variant_id, version_number),
    CONSTRAINT CK_fnb_product_recipes_dates CHECK (effective_until > effective_from)
);
GO
CREATE TABLE dbo.fnb_recipe_items (
    recipe_id BIGINT NOT NULL REFERENCES dbo.fnb_product_recipes (recipe_id),
    ingredient_id BIGINT NOT NULL REFERENCES dbo.fnb_ingredients (ingredient_id),
    quantity_required DECIMAL(18,3) NOT NULL CHECK (quantity_required > 0),
    wastage_rate DECIMAL(5,2) NOT NULL DEFAULT 0 CHECK (wastage_rate BETWEEN 0 AND 100),
    CONSTRAINT PK_fnb_recipe_items PRIMARY KEY (recipe_id, ingredient_id)
);
GO
CREATE TABLE dbo.fnb_order_components (
    order_item_id BIGINT NOT NULL REFERENCES dbo.fnb_order_items (order_item_id),
    variant_id BIGINT NOT NULL REFERENCES dbo.fnb_product_variants (variant_id),
    variant_code_snapshot VARCHAR(50) NOT NULL,
    variant_name_snapshot NVARCHAR(100) NOT NULL,
    quantity BIGINT NOT NULL CHECK (quantity > 0),
    recipe_id BIGINT NULL REFERENCES dbo.fnb_product_recipes (recipe_id),
    CONSTRAINT PK_fnb_order_components PRIMARY KEY (order_item_id, variant_id)
);
GO
CREATE TABLE dbo.fnb_order_ingredients (
    fnb_order_id BIGINT NOT NULL REFERENCES dbo.fnb_orders (fnb_order_id),
    ingredient_id BIGINT NOT NULL REFERENCES dbo.fnb_ingredients (ingredient_id),
    quantity DECIMAL(18,3) NOT NULL CHECK (quantity > 0),
    CONSTRAINT PK_fnb_order_ingredients PRIMARY KEY (fnb_order_id, ingredient_id)
);
GO
CREATE TABLE dbo.fnb_stock_reservations (
    fnb_order_id BIGINT NOT NULL REFERENCES dbo.fnb_orders (fnb_order_id),
    inventory_id BIGINT NOT NULL,
    stock_batch_id BIGINT NOT NULL,
    quantity DECIMAL(18,3) NOT NULL CHECK (quantity > 0),
    expires_at DATETIME2(0) NULL,
    CONSTRAINT PK_fnb_stock_reservations PRIMARY KEY (fnb_order_id, stock_batch_id),
    CONSTRAINT FK_fnb_stock_reservations_batch FOREIGN KEY (inventory_id, stock_batch_id)
        REFERENCES dbo.fnb_stock_batches (inventory_id, stock_batch_id)
);
GO
CREATE INDEX IX_fnb_stock_reservations_batch
    ON dbo.fnb_stock_reservations (stock_batch_id, expires_at) INCLUDE (quantity);
GO
CREATE TYPE dbo.fnb_order_lines AS TABLE (
    line_number INT NOT NULL PRIMARY KEY CHECK (line_number > 0),
    branch_product_id BIGINT NULL,
    combo_id BIGINT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    CHECK ((branch_product_id IS NULL AND combo_id IS NOT NULL)
           OR (branch_product_id IS NOT NULL AND combo_id IS NULL))
);
GO
CREATE PROCEDURE dbo.usp_fnb_order_create
    @branch_id BIGINT,
    @lines dbo.fnb_order_lines READONLY,
    @fnb_order_id BIGINT OUTPUT,
    @booking_id BIGINT = NULL,
    @customer_id BIGINT = NULL,
    @handled_by_user_id BIGINT = NULL,
    @pickup_at DATETIME2(0) = NULL,
    @customer_note NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    SET @fnb_order_id = NULL;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @now DATETIME2(0) = SYSUTCDATETIME(),
                @currency CHAR(3) = 'VND', @booking_status VARCHAR(30), @booking_customer BIGINT;
        IF NOT EXISTS (SELECT 1 FROM @lines)
            THROW 52402, N'Đơn F&B phải có ít nhất một món hoặc combo.', 1;
        IF @pickup_at <= @now
            THROW 52403, N'Thời điểm nhận món phải ở trong tương lai.', 1;
        IF @booking_id IS NOT NULL
        BEGIN
            SELECT @booking_status = s.status_code, @booking_customer = b.user_id, @currency = b.currency_code
            FROM dbo.bookings b WITH (UPDLOCK, HOLDLOCK)
            JOIN dbo.booking_statuses s ON s.booking_status_id = b.booking_status_id
            WHERE b.booking_id = @booking_id AND b.branch_id = @branch_id;

            IF @booking_status IS NULL OR @booking_status <> 'PENDING_PAYMENT'
                THROW 52404, N'Booking phải cùng chi nhánh và đang chờ thanh toán.', 1;
            IF EXISTS (SELECT 1 FROM dbo.payment_transactions WHERE booking_id = @booking_id)
                THROW 52405, N'Booking đã chốt số tiền thanh toán.', 1;
            IF @customer_id IS NOT NULL AND (@booking_customer IS NULL OR @customer_id <> @booking_customer)
                THROW 52404, N'Khách hàng không khớp với booking.', 1;
            SET @customer_id = @booking_customer;
        END;

        INSERT dbo.fnb_orders (order_code, branch_id, booking_id, customer_id, handled_by_user_id,
                               fulfillment_type, subtotal, total_amount, currency_code, pickup_at, customer_note)
        VALUES ('FNB-' + CONVERT(VARCHAR(36), NEWID()), @branch_id, @booking_id, @customer_id, @handled_by_user_id,
                CASE WHEN @pickup_at IS NULL THEN 'IMMEDIATE' ELSE 'SCHEDULED' END,
                0, 0, @currency, @pickup_at, @customer_note);
        SET @fnb_order_id = SCOPE_IDENTITY();

        INSERT dbo.fnb_order_items (fnb_order_id, branch_id, line_number, branch_product_id, combo_id,
                                    item_name_snapshot, item_code_snapshot, unit_price, quantity)
        SELECT @fnb_order_id, @branch_id, l.line_number, l.branch_product_id, NULL,
               LEFT(CONCAT(p.product_name, N' - ', v.variant_name), 150), v.variant_code, bp.selling_price, l.quantity
        FROM @lines l
        JOIN dbo.fnb_branch_products bp WITH (HOLDLOCK)
            ON bp.branch_product_id = l.branch_product_id AND bp.branch_id = @branch_id
        JOIN dbo.fnb_product_variants v WITH (HOLDLOCK) ON v.variant_id = bp.variant_id
        JOIN dbo.fnb_products p WITH (HOLDLOCK) ON p.product_id = v.product_id
        WHERE p.is_active = 1 AND v.is_active = 1 AND bp.is_available = 1
          AND (bp.available_from IS NULL OR bp.available_from <= @now)
          AND (bp.available_until IS NULL OR bp.available_until > @now)
        UNION ALL
        SELECT @fnb_order_id, @branch_id, l.line_number, NULL, c.combo_id,
               c.combo_name, c.combo_code, c.combo_price, l.quantity
        FROM @lines l
        JOIN dbo.fnb_combos c WITH (HOLDLOCK) ON c.combo_id = l.combo_id AND c.branch_id = @branch_id
        WHERE c.is_active = 1
          AND (c.valid_from IS NULL OR c.valid_from <= @now)
          AND (c.valid_until IS NULL OR c.valid_until > @now);

        IF @@ROWCOUNT <> (SELECT COUNT(*) FROM @lines)
            THROW 52406, N'Có món hoặc combo không bán tại chi nhánh vào lúc này.', 1;

        IF EXISTS (
            SELECT 1
            FROM dbo.fnb_order_items i
            JOIN dbo.fnb_combo_items ci WITH (HOLDLOCK) ON ci.combo_id = i.combo_id
            JOIN dbo.fnb_branch_products bp WITH (HOLDLOCK) ON bp.branch_product_id = ci.branch_product_id
            JOIN dbo.fnb_product_variants v WITH (HOLDLOCK) ON v.variant_id = bp.variant_id
            JOIN dbo.fnb_products p WITH (HOLDLOCK) ON p.product_id = v.product_id
            WHERE i.fnb_order_id = @fnb_order_id
              AND (p.is_active = 0 OR v.is_active = 0 OR bp.is_available = 0
                   OR bp.available_from > @now OR bp.available_until <= @now)
        )
            THROW 52406, N'Combo chứa món hiện không được bán.', 1;

        ;WITH components AS (
            SELECT i.order_item_id, bp.variant_id, CONVERT(BIGINT, i.quantity) AS quantity
            FROM dbo.fnb_order_items i
            JOIN dbo.fnb_branch_products bp ON bp.branch_product_id = i.branch_product_id
            WHERE i.fnb_order_id = @fnb_order_id
            UNION ALL
            SELECT i.order_item_id, bp.variant_id, CONVERT(BIGINT, i.quantity) * c.quantity
            FROM dbo.fnb_order_items i
            JOIN dbo.fnb_combo_items c WITH (HOLDLOCK) ON c.combo_id = i.combo_id
            JOIN dbo.fnb_branch_products bp ON bp.branch_product_id = c.branch_product_id
            WHERE i.fnb_order_id = @fnb_order_id
        )
        INSERT dbo.fnb_order_components (order_item_id, variant_id, variant_code_snapshot,
                                         variant_name_snapshot, quantity, recipe_id)
        SELECT c.order_item_id, c.variant_id, v.variant_code, v.variant_name, c.quantity, r.recipe_id
        FROM components c
        JOIN dbo.fnb_product_variants v WITH (HOLDLOCK) ON v.variant_id = c.variant_id
        OUTER APPLY (
            SELECT TOP (1) r.recipe_id
            FROM dbo.fnb_product_recipes r WITH (HOLDLOCK)
            WHERE v.is_stock_tracked = 1 AND r.variant_id = c.variant_id AND r.is_active = 1
              AND r.effective_from <= @now AND (r.effective_until IS NULL OR r.effective_until > @now)
            ORDER BY r.version_number DESC
        ) r;

        IF EXISTS (
            SELECT 1
            FROM dbo.fnb_order_items i
            JOIN dbo.fnb_order_components c ON c.order_item_id = i.order_item_id
            JOIN dbo.fnb_product_variants v ON v.variant_id = c.variant_id
            WHERE i.fnb_order_id = @fnb_order_id AND v.is_stock_tracked = 1
              AND NOT EXISTS (SELECT 1 FROM dbo.fnb_recipe_items ri WITH (HOLDLOCK) WHERE ri.recipe_id = c.recipe_id)
        )
            THROW 52407, N'Món theo dõi tồn kho chưa có công thức hiệu lực với nguyên liệu.', 1;

        INSERT dbo.fnb_order_ingredients (fnb_order_id, ingredient_id, quantity)
        SELECT @fnb_order_id, ri.ingredient_id,
               CEILING(SUM(CONVERT(DECIMAL(19,0), c.quantity) * ri.quantity_required
                   / r.yield_quantity * (1 + ri.wastage_rate / 100.0)) * 1000) / 1000
        FROM dbo.fnb_order_items i
        JOIN dbo.fnb_order_components c ON c.order_item_id = i.order_item_id
        JOIN dbo.fnb_product_recipes r ON r.recipe_id = c.recipe_id
        JOIN dbo.fnb_recipe_items ri WITH (HOLDLOCK) ON ri.recipe_id = r.recipe_id
        WHERE i.fnb_order_id = @fnb_order_id
        GROUP BY ri.ingredient_id;

        DECLARE @total DECIMAL(14,2) =
            (SELECT SUM(line_total) FROM dbo.fnb_order_items WHERE fnb_order_id = @fnb_order_id);
        UPDATE dbo.fnb_orders SET subtotal = @total, total_amount = @total WHERE fnb_order_id = @fnb_order_id;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO


CREATE PROCEDURE dbo.usp_fnb_lock_stock
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @lock_result INT;
    EXEC @lock_result = sys.sp_getapplock
        @Resource = N'Marumo.FnbStock', @LockMode = 'Exclusive',
        @LockOwner = 'Transaction', @LockTimeout = 10000;
    IF @lock_result < 0 THROW 52408, N'Không lấy được khóa cập nhật kho F&B.', 1;
END;
GO

CREATE PROCEDURE dbo.usp_fnb_reserve_stock
    @fnb_order_id BIGINT,
    @expires_at DATETIME2(0)
AS
BEGIN
    SET NOCOUNT ON;
    EXEC dbo.usp_fnb_lock_stock;
    DECLARE @branch_id BIGINT, @use_by DATE;
    SELECT @branch_id = branch_id,
           @use_by = CONVERT(DATE, COALESCE(pickup_at, SYSUTCDATETIME()))
    FROM dbo.fnb_orders
    WHERE fnb_order_id = @fnb_order_id AND order_status = 'PENDING';
    IF @branch_id IS NULL THROW 52409, N'Chỉ giữ kho cho đơn F&B chờ thanh toán.', 1;
    IF @use_by < CONVERT(DATE, SYSUTCDATETIME()) SET @use_by = CONVERT(DATE, SYSUTCDATETIME());
    DECLARE @now DATETIME2(0) = SYSDATETIME();
    IF @expires_at <= @now THROW 52410, N'Đã hết thời gian giữ kho.', 1;

    DELETE dbo.fnb_stock_reservations WHERE fnb_order_id = @fnb_order_id;

    ;WITH batches AS (
        SELECT needed.ingredient_id, inv.inventory_id, b.stock_batch_id, b.expiry_date, b.received_at,
               needed.quantity AS required_quantity,
               b.remaining_quantity - CONVERT(DECIMAL(18,3), held.quantity) AS available_quantity
        FROM dbo.fnb_order_ingredients needed
        JOIN dbo.fnb_inventory inv ON inv.branch_id = @branch_id AND inv.ingredient_id = needed.ingredient_id
        JOIN dbo.fnb_stock_batches b ON b.inventory_id = inv.inventory_id
        CROSS APPLY (
            SELECT COALESCE(SUM(r.quantity), 0) AS quantity
            FROM dbo.fnb_stock_reservations r
            WHERE r.stock_batch_id = b.stock_batch_id AND (r.expires_at IS NULL OR r.expires_at > @now)
        ) held
        WHERE needed.fnb_order_id = @fnb_order_id AND b.batch_status = 'AVAILABLE'
          AND (b.expiry_date IS NULL OR b.expiry_date >= @use_by)
          AND b.remaining_quantity > held.quantity
    ),
    allocation AS (
        SELECT *, CONVERT(DECIMAL(18,3), COALESCE(SUM(available_quantity) OVER (
            PARTITION BY ingredient_id
            ORDER BY CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END, expiry_date, received_at, stock_batch_id
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0)) AS previously_available
        FROM batches
    )
    INSERT dbo.fnb_stock_reservations (fnb_order_id, inventory_id, stock_batch_id, quantity, expires_at)
    SELECT @fnb_order_id, inventory_id, stock_batch_id,
           CASE WHEN previously_available + available_quantity <= required_quantity THEN available_quantity
                ELSE required_quantity - previously_available END,
           @expires_at
    FROM allocation WHERE previously_available < required_quantity;

    IF EXISTS (
        SELECT 1
        FROM dbo.fnb_order_ingredients needed
        OUTER APPLY (
            SELECT SUM(r.quantity) AS quantity
            FROM dbo.fnb_stock_reservations r
            JOIN dbo.fnb_inventory inv ON inv.inventory_id = r.inventory_id
            WHERE r.fnb_order_id = needed.fnb_order_id AND inv.ingredient_id = needed.ingredient_id
        ) held
        WHERE needed.fnb_order_id = @fnb_order_id AND COALESCE(held.quantity, 0) <> needed.quantity
    )
        THROW 52411, N'Không đủ nguyên liệu có thể giữ cho đơn F&B.', 1;
END;
GO

CREATE TRIGGER dbo.TRG_payment_transactions_release_fnb_stock
ON dbo.payment_transactions
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE(status) RETURN;
    IF NOT EXISTS (
        SELECT 1 FROM inserted i JOIN deleted d ON d.payment_transaction_id = i.payment_transaction_id
        WHERE i.fnb_order_id IS NOT NULL AND i.status IN ('FAILED','EXPIRED','CANCELLED') AND i.status <> d.status
    ) RETURN;

    UPDATE orders
    SET order_status = 'CANCELLED', updated_at = SYSUTCDATETIME()
    FROM dbo.fnb_orders orders
    JOIN inserted i ON i.fnb_order_id = orders.fnb_order_id
    JOIN deleted d ON d.payment_transaction_id = i.payment_transaction_id
    WHERE i.status IN ('FAILED','EXPIRED','CANCELLED') AND i.status <> d.status AND orders.order_status = 'PENDING';

    EXEC dbo.usp_fnb_lock_stock;
    DELETE r
    FROM dbo.fnb_stock_reservations r
    JOIN inserted i ON i.fnb_order_id = r.fnb_order_id
    JOIN deleted d ON d.payment_transaction_id = i.payment_transaction_id
    WHERE i.status IN ('FAILED','EXPIRED','CANCELLED') AND i.status <> d.status AND r.expires_at IS NOT NULL;
END;
GO

CREATE PROCEDURE dbo.usp_fnb_order_prepare
    @fnb_order_id BIGINT,
    @created_by BIGINT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @status VARCHAR(20);
        SELECT @status = order_status
        FROM dbo.fnb_orders WITH (UPDLOCK, HOLDLOCK)
        WHERE fnb_order_id = @fnb_order_id;

        IF @status IN ('PREPARING','READY','COMPLETED')
        BEGIN
            COMMIT TRANSACTION;
            RETURN;
        END;
        IF @status IS NULL OR @status <> 'PAID'
            THROW 52412, N'Chỉ chuẩn bị đơn F&B đã thanh toán.', 1;

        EXEC dbo.usp_fnb_lock_stock;
        DECLARE @allocations TABLE (
            stock_batch_id BIGINT PRIMARY KEY,
            inventory_id BIGINT NOT NULL,
            quantity DECIMAL(18,3) NOT NULL
        );
        DELETE dbo.fnb_stock_reservations
        OUTPUT deleted.stock_batch_id, deleted.inventory_id, deleted.quantity INTO @allocations
        WHERE fnb_order_id = @fnb_order_id AND expires_at IS NULL;

        IF EXISTS (
            SELECT 1
            FROM dbo.fnb_order_ingredients i
            OUTER APPLY (
                SELECT SUM(a.quantity) AS quantity FROM @allocations a
                JOIN dbo.fnb_inventory inv ON inv.inventory_id = a.inventory_id
                WHERE inv.ingredient_id = i.ingredient_id
            ) alloc
            WHERE i.fnb_order_id = @fnb_order_id AND COALESCE(alloc.quantity, 0) <> i.quantity
        )
            THROW 52413, N'Phần nguyên liệu đã giữ không khớp với đơn F&B.', 1;

        DECLARE @inventory_id BIGINT, @stock_batch_id BIGINT, @delta DECIMAL(18,3),
                @movement_id BIGINT, @result_batch_id BIGINT, @key UNIQUEIDENTIFIER;
        WHILE EXISTS (SELECT 1 FROM @allocations)
        BEGIN
            SELECT TOP (1) @inventory_id = inventory_id, @stock_batch_id = stock_batch_id, @delta = -quantity
            FROM @allocations ORDER BY inventory_id, stock_batch_id;

            SET @key = NEWID();
            EXEC dbo.usp_fnb_inventory_apply_transaction
                @inventory_id = @inventory_id, @stock_batch_id = @stock_batch_id,
                @transaction_type = 'SALE', @quantity_change = @delta, @idempotency_key = @key,
                @reference_type = 'FNB_ORDER', @reference_id = @fnb_order_id, @created_by = @created_by,
                @inventory_transaction_id = @movement_id OUTPUT, @result_stock_batch_id = @result_batch_id OUTPUT;

            DELETE @allocations WHERE stock_batch_id = @stock_batch_id;
        END;

        UPDATE dbo.fnb_orders SET order_status = 'PREPARING', updated_at = SYSUTCDATETIME()
        WHERE fnb_order_id = @fnb_order_id;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO















CREATE TABLE dbo.audit_logs (
    audit_log_id BIGINT IDENTITY(1,1) NOT NULL,
    user_id      BIGINT           NULL,
    branch_id    BIGINT           NULL,
    action_code  VARCHAR(50)      NOT NULL,
    entity_type  VARCHAR(100)     NOT NULL,
    entity_id    NVARCHAR(100)    NULL,
    description  NVARCHAR(1000)   NULL,
    old_values   NVARCHAR(MAX)    NULL,
    new_values   NVARCHAR(MAX)    NULL,
    ip_address   VARCHAR(45)      NULL,
    user_agent   NVARCHAR(500)    NULL,
    request_id   UNIQUEIDENTIFIER NULL,
    created_at   DATETIME2(0)     NOT NULL CONSTRAINT DF_audit_logs_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_audit_logs PRIMARY KEY (audit_log_id),
    CONSTRAINT CK_audit_logs_old_json CHECK (old_values IS NULL OR ISJSON(old_values) = 1),
    CONSTRAINT CK_audit_logs_new_json CHECK (new_values IS NULL OR ISJSON(new_values) = 1),
    CONSTRAINT FK_audit_logs_users FOREIGN KEY (user_id) REFERENCES dbo.users (user_id),
    CONSTRAINT FK_audit_logs_branches FOREIGN KEY (branch_id) REFERENCES dbo.branches (branch_id)
);
GO
CREATE INDEX IX_audit_logs_user_time ON dbo.audit_logs (user_id, created_at);
GO
CREATE INDEX IX_audit_logs_branch_time ON dbo.audit_logs (branch_id, created_at);
GO
CREATE INDEX IX_audit_logs_entity ON dbo.audit_logs (entity_type, entity_id);
GO
CREATE TRIGGER dbo.TRG_audit_logs_append_only
ON dbo.audit_logs
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 51120, N'audit_logs chỉ được ghi thêm; không sửa hoặc xóa.', 1;
END;
GO


CREATE TABLE dbo.system_settings (
    setting_id    INT IDENTITY(1,1) NOT NULL,
    setting_key   VARCHAR(100)      NOT NULL,
    setting_value NVARCHAR(MAX)     NOT NULL,
    value_type    VARCHAR(20)       NOT NULL,
    description   NVARCHAR(500)     NULL,
    is_public     BIT               NOT NULL CONSTRAINT DF_system_settings_is_public DEFAULT 0,
    updated_by    BIGINT            NULL,
    updated_at    DATETIME2(0)      NOT NULL CONSTRAINT DF_system_settings_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_system_settings PRIMARY KEY (setting_id),
    CONSTRAINT UQ_system_settings_key UNIQUE (setting_key),
    CONSTRAINT CK_system_settings_value_type CHECK (value_type IN ('STRING','INTEGER','BOOLEAN','JSON')),
    CONSTRAINT CK_system_settings_json CHECK (value_type <> 'JSON' OR ISJSON(setting_value) = 1),
    CONSTRAINT FK_system_settings_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (user_id)
);
GO
INSERT INTO dbo.system_settings (setting_key, setting_value, value_type, description) VALUES
    ('SITE_NAME', N'MARUMO', 'STRING', N'Tên hệ thống hiển thị'),
    ('DEFAULT_CURRENCY', 'VND', 'STRING', N'Mã tiền tệ mặc định'),
    ('DEFAULT_TIMEZONE', 'Asia/Ho_Chi_Minh', 'STRING', N'Múi giờ hiển thị'),
    ('BOOKING_HOLD_MINUTES', '10', 'INTEGER', N'Số phút giữ ghế trước khi hết hạn'),
    ('MAINTENANCE_MODE', 'false', 'BOOLEAN', N'Chế độ bảo trì toàn hệ thống');
GO



CREATE TABLE dbo.branch_settings (
    branch_setting_id BIGINT IDENTITY(1,1) NOT NULL,
    branch_id         BIGINT        NOT NULL,
    setting_key       VARCHAR(100)  NOT NULL,
    setting_value     NVARCHAR(MAX) NOT NULL,
    value_type        VARCHAR(20)   NOT NULL,
    description       NVARCHAR(500) NULL,
    updated_by        BIGINT        NULL,
    updated_at        DATETIME2(0)  NOT NULL CONSTRAINT DF_branch_settings_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_branch_settings PRIMARY KEY (branch_setting_id),
    CONSTRAINT UQ_branch_settings_branch_key UNIQUE (branch_id, setting_key),
    CONSTRAINT CK_branch_settings_value_type CHECK (value_type IN ('STRING','INTEGER','BOOLEAN','JSON')),
    CONSTRAINT CK_branch_settings_json CHECK (value_type <> 'JSON' OR ISJSON(setting_value) = 1),
    CONSTRAINT FK_branch_settings_branches FOREIGN KEY (branch_id) REFERENCES dbo.branches (branch_id),
    CONSTRAINT FK_branch_settings_updated_by FOREIGN KEY (updated_by) REFERENCES dbo.users (user_id)
);
GO

CREATE PROCEDURE dbo.usp_booking_release
    @booking_id BIGINT,
    @status_code VARCHAR(30) = 'CANCELLED',
    @actor_user_id BIGINT = NULL,
    @reason NVARCHAR(1000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF @status_code IS NULL OR @status_code NOT IN ('CANCELLED','EXPIRED')
        THROW 52500, N'Trạng thái giải phóng booking không hợp lệ.', 1;
    DECLARE @now DATETIME2(0) = SYSDATETIME(), @utc DATETIME2(0) = SYSUTCDATETIME(),
            @current VARCHAR(30), @expires_at DATETIME2(0), @target SMALLINT,
            @voided SMALLINT, @payment_id BIGINT, @locked_seat BIGINT;
    BEGIN TRY
        BEGIN TRANSACTION;
        SELECT @payment_id = payment_transaction_id
        FROM dbo.payment_transactions WITH (UPDLOCK, HOLDLOCK)
        WHERE booking_id = @booking_id;
        SELECT @current = st.status_code, @expires_at = b.expires_at
        FROM dbo.bookings b WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.booking_statuses st ON st.booking_status_id = b.booking_status_id
        WHERE b.booking_id = @booking_id;
        IF @current IS NULL THROW 52501, N'Booking không tồn tại.', 1;
        IF @current = @status_code
        BEGIN
            COMMIT TRANSACTION;
            RETURN;
        END;
        IF @current NOT IN ('PENDING_PAYMENT','CONFIRMED')
            THROW 52502, N'Booking không thể giải phóng ở trạng thái hiện tại.', 1;
        IF @status_code = 'EXPIRED' AND
           (@current <> 'PENDING_PAYMENT' OR @expires_at IS NULL OR @expires_at > @now)
            THROW 52503, N'Booking chưa hết hạn thanh toán.', 1;
        SELECT @target = booking_status_id FROM dbo.booking_statuses WHERE status_code = @status_code;
        SELECT @voided = ticket_status_id FROM dbo.ticket_statuses WHERE status_code = 'VOIDED';
        IF @target IS NULL OR @voided IS NULL THROW 52504, N'Thiếu cấu hình trạng thái booking hoặc vé.', 1;
        SELECT @locked_seat = ss.showtime_seat_id
        FROM dbo.showtime_seats ss WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.booking_seats bs WITH (UPDLOCK, HOLDLOCK) ON bs.showtime_seat_id = ss.showtime_seat_id
        WHERE bs.booking_id = @booking_id AND bs.released_at IS NULL;
        SELECT @locked_seat = ss.showtime_seat_id
        FROM dbo.showtime_seats ss WITH (UPDLOCK, HOLDLOCK)
        WHERE EXISTS (
            SELECT 1 FROM dbo.seat_holds h
            WHERE h.showtime_seat_id = ss.showtime_seat_id
              AND h.booking_id = @booking_id AND h.hold_status = 'ACTIVE'
        );
        IF EXISTS (
            SELECT 1 FROM dbo.tickets t WITH (UPDLOCK, HOLDLOCK)
            JOIN dbo.ticket_statuses ts ON ts.ticket_status_id = t.ticket_status_id
            JOIN dbo.booking_seats bs ON bs.booking_seat_id = t.booking_seat_id
            WHERE bs.booking_id = @booking_id AND ts.status_code = 'USED'
        ) THROW 52505, N'Không thể giải phóng booking có vé đã sử dụng.', 1;
        UPDATE t SET ticket_status_id = @voided, voided_at = COALESCE(voided_at,@now)
        FROM dbo.tickets t JOIN dbo.booking_seats bs ON bs.booking_seat_id = t.booking_seat_id
        WHERE bs.booking_id = @booking_id;
        UPDATE ss SET seat_status = 'AVAILABLE', hold_expires_at = NULL,
                      held_by_session_id = NULL, updated_at = @utc
        FROM dbo.showtime_seats ss JOIN dbo.booking_seats bs ON bs.showtime_seat_id = ss.showtime_seat_id
        WHERE bs.booking_id = @booking_id AND bs.released_at IS NULL
          AND ss.seat_status IN ('HELD','BOOKED','SOLD');
        UPDATE ss SET seat_status = 'AVAILABLE', hold_expires_at = NULL,
                      held_by_session_id = NULL, updated_at = @utc
        FROM dbo.showtime_seats ss
        WHERE ss.seat_status = 'HELD'
          AND EXISTS (
              SELECT 1 FROM dbo.seat_holds h WITH (UPDLOCK, HOLDLOCK)
              WHERE h.showtime_seat_id = ss.showtime_seat_id
                AND h.booking_id = @booking_id AND h.hold_status = 'ACTIVE'
                AND h.session_id = ss.held_by_session_id
          )
          AND NOT EXISTS (
              SELECT 1 FROM dbo.booking_seats bs WITH (UPDLOCK, HOLDLOCK)
              WHERE bs.showtime_seat_id = ss.showtime_seat_id
                AND bs.booking_id <> @booking_id AND bs.released_at IS NULL
          );
        UPDATE dbo.booking_seats SET released_at = @utc
        WHERE booking_id = @booking_id AND released_at IS NULL;
        UPDATE dbo.seat_holds SET hold_status = CASE WHEN @status_code = 'EXPIRED' THEN 'EXPIRED' ELSE 'RELEASED' END,
                                 released_at = COALESCE(released_at,@now)
        WHERE booking_id = @booking_id AND hold_status = 'ACTIVE';
        UPDATE dbo.payment_attempts SET status = 'CANCELLED', completed_at = @now
        WHERE payment_transaction_id = @payment_id AND status IN ('PENDING','PROCESSING');
        UPDATE dbo.payment_transactions SET status = @status_code,
            expired_at = CASE WHEN @status_code = 'EXPIRED' THEN COALESCE(expired_at,@now) ELSE expired_at END,
            updated_at = @utc
        WHERE payment_transaction_id = @payment_id AND status IN ('PENDING','PROCESSING');
        UPDATE dbo.bookings SET booking_status_id = @target, updated_at = @utc WHERE booking_id = @booking_id;
        IF @status_code = 'CANCELLED'
            INSERT dbo.booking_cancellations (booking_id,requested_by_user_id,processed_by_user_id,cancellation_code,
                cancellation_reason,cancellation_status,requested_at,processed_at)
            VALUES (@booking_id,@actor_user_id,@actor_user_id,'CAN-' + CONVERT(VARCHAR(36),NEWID()),
                COALESCE(NULLIF(LTRIM(RTRIM(@reason)),N''),N'Hủy booking'),'COMPLETED',@now,@now);
        DECLARE @json NVARCHAR(MAX) = (SELECT @status_code AS status_code, @reason AS reason FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        INSERT dbo.booking_audit_logs (booking_id,actor_user_id,actor_type,action_code,new_values)
        VALUES (@booking_id,@actor_user_id,CASE WHEN @actor_user_id IS NULL THEN 'SYSTEM' ELSE 'STAFF' END,'BOOKING_RELEASED',@json);
        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END
GO
