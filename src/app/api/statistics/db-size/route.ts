import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPgConfig } from '@/lib/pg/utils';
import { executeQuery } from '@/lib/pg';

export const dynamic = 'force-dynamic';

/**
 * GET /api/statistics/db-size?connection_id=...
 * DB/테이블/인덱스 사이즈 (WhaTap 데이터베이스 사이즈 스타일)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const connectionId = request.nextUrl.searchParams.get('connection_id');
    if (!connectionId) {
      return NextResponse.json({ error: 'connection_id required' }, { status: 400 });
    }

    const config = await getPgConfig(connectionId);

    const [dbSize, tableSizes, indexSizes, tablespaces] = await Promise.all([
      // 전체 DB 사이즈
      executeQuery<{
        datname: string;
        size_bytes: number;
        size_pretty: string;
      }>(config, `
        SELECT datname,
          pg_database_size(datname)::bigint AS size_bytes,
          pg_size_pretty(pg_database_size(datname)) AS size_pretty
        FROM pg_database
        WHERE datallowconn AND datname NOT IN ('template0', 'template1')
        ORDER BY size_bytes DESC
      `),

      // Top 30 테이블 사이즈
      executeQuery<{
        schemaname: string;
        relname: string;
        table_size: number;
        indexes_size: number;
        total_size: number;
        row_estimate: number;
      }>(config, `
        SELECT
          schemaname,
          relname,
          pg_table_size(schemaname || '.' || relname)::bigint AS table_size,
          pg_indexes_size(schemaname || '.' || relname)::bigint AS indexes_size,
          pg_total_relation_size(schemaname || '.' || relname)::bigint AS total_size,
          n_live_tup::bigint AS row_estimate
        FROM pg_stat_user_tables
        ORDER BY pg_total_relation_size(schemaname || '.' || relname) DESC
        LIMIT 30
      `),

      // Top 30 인덱스 사이즈
      executeQuery<{
        schemaname: string;
        tablename: string;
        indexname: string;
        index_size: number;
        idx_scan: number;
      }>(config, `
        SELECT
          schemaname,
          relname AS tablename,
          indexrelname AS indexname,
          pg_relation_size(indexrelid)::bigint AS index_size,
          idx_scan::bigint
        FROM pg_stat_user_indexes
        ORDER BY pg_relation_size(indexrelid) DESC
        LIMIT 30
      `),

      // 테이블스페이스
      executeQuery<{
        spcname: string;
        size_bytes: number;
      }>(config, `
        SELECT spcname,
          pg_tablespace_size(spcname)::bigint AS size_bytes
        FROM pg_tablespace
        ORDER BY size_bytes DESC
      `).catch(() => ({ rows: [] })),
    ]);

    // 집계
    const totalDbSize = dbSize.rows.reduce((s, r) => s + Number(r.size_bytes), 0);
    const totalTableSize = tableSizes.rows.reduce((s, r) => s + Number(r.table_size), 0);
    const totalIndexSize = tableSizes.rows.reduce((s, r) => s + Number(r.indexes_size), 0);

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalDbSize,
          totalTableSize,
          totalIndexSize,
          dbCount: dbSize.rows.length,
          tableCount: tableSizes.rows.length,
        },
        databases: dbSize.rows,
        tables: tableSizes.rows,
        indexes: indexSizes.rows,
        tablespaces: tablespaces.rows,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
