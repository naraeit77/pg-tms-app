import { pool } from './index';
import bcrypt from 'bcryptjs';

async function seed() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Default user roles
    await client.query(`
      INSERT INTO user_roles (name, display_name, description, permissions)
      VALUES
        ('admin', '관리자', '시스템 전체 관리 권한', '{"manage_users": true, "manage_connections": true, "manage_settings": true, "view_all_data": true, "manage_tuning": true, "export_data": true}'),
        ('tuner', 'SQL 튜너', 'SQL 튜닝 및 분석 권한', '{"manage_connections": false, "manage_settings": false, "view_all_data": true, "manage_tuning": true, "export_data": true}'),
        ('viewer', '조회자', '읽기 전용 권한', '{"manage_connections": false, "manage_settings": false, "view_all_data": true, "manage_tuning": false, "export_data": false}')
      ON CONFLICT (name) DO NOTHING;
    `);

    // 1-1. Default admin user (admin@tms.com / admin1234)
    const adminPassword = await bcrypt.hash('admin1234', 12);
    const userResult = await client.query(`
      INSERT INTO users (email, password_hash)
      VALUES ('admin@tms.com', $1)
      ON CONFLICT (email) DO NOTHING
      RETURNING id, email;
    `, [adminPassword]);

    if (userResult.rows.length > 0) {
      const adminUser = userResult.rows[0];
      const roleResult = await client.query(`
        SELECT id FROM user_roles WHERE name = 'admin' LIMIT 1;
      `);
      const adminRoleId = roleResult.rows[0]?.id || null;

      await client.query(`
        INSERT INTO user_profiles (id, email, full_name, role_id, preferences, is_active)
        VALUES ($1, $2, '시스템 관리자', $3, '{}', true)
        ON CONFLICT (id) DO NOTHING;
      `, [adminUser.id, adminUser.email, adminRoleId]);

      console.log(`Default admin user created: ${adminUser.email}`);
    }

    // 2. Default system settings (PG-TMS용)
    await client.query(`
      INSERT INTO system_settings (category, key, value, description)
      VALUES
        ('monitoring', 'snapshot_interval', '300', '스냅샷 수집 주기 (초)'),
        ('monitoring', 'realtime_poll_interval', '10', '실시간 폴링 주기 (초)'),
        ('monitoring', 'retention_days', '90', '스냅샷 보관 기간 (일)'),
        ('monitoring', 'auto_collect_enabled', 'false', '자동 수집 활성화'),
        ('threshold', 'total_exec_time_critical', '10000', 'Total Exec Time Critical 임계값 (ms)'),
        ('threshold', 'total_exec_time_warning', '5000', 'Total Exec Time Warning 임계값 (ms)'),
        ('threshold', 'shared_blks_read_critical', '100000', 'Shared Blocks Read Critical 임계값'),
        ('threshold', 'shared_blks_read_warning', '50000', 'Shared Blocks Read Warning 임계값'),
        ('threshold', 'cache_hit_ratio_warning', '95', 'Cache Hit Ratio Warning 임계값 (%)'),
        ('alert', 'email_enabled', 'false', '이메일 알림 활성화'),
        ('alert', 'slack_enabled', 'false', 'Slack 알림 활성화')
      ON CONFLICT (category, key) DO NOTHING;
    `);

    // 3. Default report templates (PG-TMS용)
    await client.query(`
      INSERT INTO report_templates (name, description, type, sections, default_config)
      VALUES
        ('performance_summary', '성능 요약 리포트', 'summary', ARRAY['overview', 'top_sql', 'wait_events', 'recommendations'], '{"period": "daily", "top_n": 10}'),
        ('detailed_analysis', '상세 분석 리포트', 'detailed', ARRAY['overview', 'sql_analysis', 'execution_plans', 'wait_events', 'session_analysis', 'vacuum_stats', 'recommendations'], '{"period": "weekly", "top_n": 20}'),
        ('trend_analysis', '트렌드 분석 리포트', 'trend', ARRAY['overview', 'performance_trends', 'workload_trends', 'bloat_analysis', 'capacity_planning'], '{"period": "monthly", "comparison_periods": 3}'),
        ('snapshot_comparison', '스냅샷 비교 리포트', 'comparison', ARRAY['overview', 'sql_delta', 'wait_delta', 'table_stats_delta'], '{"comparison_type": "snapshot"}')
      ON CONFLICT (name) DO NOTHING;
    `);

    await client.query('COMMIT');
    console.log('PG-TMS seed data inserted successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
