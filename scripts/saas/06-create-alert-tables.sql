-- ============================================================
-- PG-TMS SaaS 마이그레이션 Step 6: 알림 시스템 테이블
-- ============================================================

-- ─── 알림 규칙 ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    connection_id UUID REFERENCES pg_connections(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    metric VARCHAR(100) NOT NULL,
    condition VARCHAR(20) NOT NULL,
    threshold DOUBLE PRECISION NOT NULL,
    duration_seconds INT DEFAULT 60,
    severity VARCHAR(20) NOT NULL DEFAULT 'WARNING',
    notification_channels JSONB DEFAULT '[]',
    cooldown_minutes INT DEFAULT 15,
    is_active BOOLEAN DEFAULT true,
    last_triggered_at TIMESTAMPTZ,
    last_resolved_at TIMESTAMPTZ,
    trigger_count INT DEFAULT 0,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_org ON alert_rules(org_id);
CREATE INDEX IF NOT EXISTS idx_alert_rules_conn ON alert_rules(connection_id);
CREATE INDEX IF NOT EXISTS idx_alert_rules_metric ON alert_rules(metric);
CREATE INDEX IF NOT EXISTS idx_alert_rules_active ON alert_rules(is_active);

-- ─── 알림 이력 (파티셔닝) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS alert_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    rule_id UUID REFERENCES alert_rules(id) ON DELETE SET NULL,
    org_id UUID NOT NULL,
    connection_id UUID NOT NULL,
    metric VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    condition VARCHAR(20) NOT NULL,
    threshold DOUBLE PRECISION NOT NULL,
    metric_value DOUBLE PRECISION NOT NULL,
    message TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'TRIGGERED',
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by UUID,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID,
    notification_results JSONB DEFAULT '[]',
    PRIMARY KEY (triggered_at, id)
) PARTITION BY RANGE (triggered_at);

CREATE INDEX IF NOT EXISTS idx_alert_history_org ON alert_history(org_id);
CREATE INDEX IF NOT EXISTS idx_alert_history_conn ON alert_history(connection_id);
CREATE INDEX IF NOT EXISTS idx_alert_history_rule ON alert_history(rule_id);
CREATE INDEX IF NOT EXISTS idx_alert_history_status ON alert_history(status);
CREATE INDEX IF NOT EXISTS idx_alert_history_severity ON alert_history(severity);

-- pg_partman 파티셔닝: 월별, 6개월 미리 생성
SELECT partman.create_parent(
    p_parent_table := 'public.alert_history',
    p_control := 'triggered_at',
    p_interval := '1 month',
    p_premake := 6
);

UPDATE partman.part_config
SET retention = '365 days',
    retention_keep_table = false,
    retention_keep_index = false
WHERE parent_table = 'public.alert_history';

-- ─── 알림 템플릿 (내장) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS alert_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    metric VARCHAR(100) NOT NULL,
    condition VARCHAR(20) NOT NULL,
    threshold DOUBLE PRECISION NOT NULL,
    duration_seconds INT DEFAULT 60,
    severity VARCHAR(20) DEFAULT 'WARNING',
    template_type VARCHAR(20) DEFAULT 'builtin',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 내장 알림 템플릿 시드 데이터
INSERT INTO alert_templates (name, description, metric, condition, threshold, duration_seconds, severity, template_type)
VALUES
    ('Active Sessions High',
     '활성 세션 수가 임계값을 초과',
     'active_sessions', 'gt', 50, 60, 'WARNING', 'builtin'),

    ('Cache Hit Ratio Low',
     '캐시 히트율이 임계값 미만으로 하락',
     'cache_hit_ratio', 'lt', 90, 120, 'WARNING', 'builtin'),

    ('Deadlock Detected',
     '데드락 발생 감지',
     'deadlocks', 'gt', 0, 0, 'CRITICAL', 'builtin'),

    ('Long Running Query',
     '장기 실행 쿼리 감지 (30초 이상)',
     'long_query_seconds', 'gt', 30, 0, 'WARNING', 'builtin'),

    ('Table Bloat High',
     '테이블 블로트 비율이 30% 초과',
     'table_bloat_ratio', 'gt', 30, 300, 'WARNING', 'builtin'),

    ('Connection Usage High',
     'DB 커넥션 사용률 80% 초과',
     'connection_usage_pct', 'gt', 80, 60, 'CRITICAL', 'builtin'),

    ('Replication Lag High',
     '복제 지연이 10초 초과',
     'replication_lag_seconds', 'gt', 10, 30, 'CRITICAL', 'builtin'),

    ('TPS Drop',
     'TPS가 급격히 감소 (임계값 미만)',
     'tps', 'lt', 10, 120, 'WARNING', 'builtin')
ON CONFLICT DO NOTHING;
