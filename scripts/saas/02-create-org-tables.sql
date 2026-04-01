-- ============================================================
-- PG-TMS SaaS 마이그레이션 Step 2: 멀티테넌트 조직 테이블
-- ============================================================

-- 조직 (멀티테넌트 최상위 단위)
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    plan_tier VARCHAR(30) NOT NULL DEFAULT 'free',
    max_connections INT DEFAULT 3,
    max_teams INT DEFAULT 1,
    max_members INT DEFAULT 5,
    collection_interval_sec INT DEFAULT 300,
    retention_days INT DEFAULT 7,
    is_active BOOLEAN DEFAULT true,
    billing_customer_id VARCHAR(255),
    billing_subscription_id VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_plan ON organizations(plan_tier);
CREATE INDEX IF NOT EXISTS idx_organizations_active ON organizations(is_active);

-- 조직 멤버
CREATE TABLE IF NOT EXISTS org_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(30) NOT NULL DEFAULT 'member',
    permissions JSONB DEFAULT '{}',
    invited_by UUID REFERENCES users(id),
    joined_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org ON org_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_role ON org_members(role);

-- 팀
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_teams_org ON teams(org_id);

-- 팀 멤버
CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(30) NOT NULL DEFAULT 'member',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);

-- 팀별 커넥션 접근 권한
CREATE TABLE IF NOT EXISTS team_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL,
    access_level VARCHAR(20) NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (team_id, connection_id)
);

CREATE INDEX IF NOT EXISTS idx_team_connections_team ON team_connections(team_id);
CREATE INDEX IF NOT EXISTS idx_team_connections_conn ON team_connections(connection_id);

-- pg_connections에 org_id 컬럼 추가
ALTER TABLE pg_connections
    ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_pg_connections_org ON pg_connections(org_id);

-- 기존 사용자를 위한 기본 조직 생성 함수
-- 마이그레이션 시 실행하여 기존 데이터를 조직으로 그룹화
CREATE OR REPLACE FUNCTION migrate_users_to_default_org()
RETURNS void AS $$
DECLARE
    v_org_id UUID;
    v_user RECORD;
BEGIN
    -- 기본 조직 생성
    INSERT INTO organizations (name, slug, plan_tier, max_connections, max_members)
    VALUES ('Default Organization', 'default-org', 'starter', 20, 50)
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_org_id;

    IF v_org_id IS NULL THEN
        SELECT id INTO v_org_id FROM organizations WHERE slug = 'default-org';
    END IF;

    -- 모든 기존 사용자를 기본 조직에 추가
    FOR v_user IN SELECT id FROM users LOOP
        INSERT INTO org_members (org_id, user_id, role)
        VALUES (v_org_id, v_user.id, 'admin')
        ON CONFLICT (org_id, user_id) DO NOTHING;
    END LOOP;

    -- 기존 커넥션에 org_id 설정
    UPDATE pg_connections
    SET org_id = v_org_id
    WHERE org_id IS NULL;

    RAISE NOTICE 'Migration complete: org_id = %', v_org_id;
END;
$$ LANGUAGE plpgsql;

-- 실행 (필요 시 주석 해제)
-- SELECT migrate_users_to_default_org();
