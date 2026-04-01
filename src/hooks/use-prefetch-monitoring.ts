'use client'

/**
 * Monitoring Data Prefetch Hook
 * PG-TMS 모니터링 데이터 프리페칭
 */

import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'
import { useSelectedDatabase } from './use-selected-database'

export function usePrefetchMonitoring() {
  const queryClient = useQueryClient()
  const { selectedConnectionId } = useSelectedDatabase()

  const prefetchMetrics = useCallback(async () => {
    if (!selectedConnectionId) return
    const cachedData = queryClient.getQueryData(['monitoring-metrics', selectedConnectionId])
    if (cachedData) return

    try {
      await queryClient.prefetchQuery({
        queryKey: ['monitoring-metrics', selectedConnectionId],
        queryFn: async () => {
          const response = await fetch(`/api/monitoring/metrics?connection_id=${selectedConnectionId}`)
          if (!response.ok) return null
          const result = await response.json()
          return result.data
        },
        staleTime: 30 * 1000,
        retry: false,
      })
    } catch {
      // prefetch failure is silent
    }
  }, [queryClient, selectedConnectionId])

  const prefetchDashboard = useCallback(async () => {
    if (!selectedConnectionId) return
    const cachedData = queryClient.getQueryData(['pg-dashboard-metrics', selectedConnectionId])
    if (cachedData) return

    try {
      await queryClient.prefetchQuery({
        queryKey: ['pg-dashboard-metrics', selectedConnectionId],
        queryFn: async () => {
          const res = await fetch(`/api/dashboard/metrics?connection_id=${selectedConnectionId}`)
          if (!res.ok) return null
          const result = await res.json()
          return result.data
        },
        staleTime: 30 * 1000,
        retry: false,
      })
    } catch {
      // prefetch failure is silent
    }
  }, [queryClient, selectedConnectionId])

  const prefetchSessions = useCallback(async () => {
    if (!selectedConnectionId) return
    const cachedData = queryClient.getQueryData(['sessions', selectedConnectionId])
    if (cachedData) return

    try {
      await queryClient.prefetchQuery({
        queryKey: ['sessions', selectedConnectionId],
        queryFn: async () => {
          const response = await fetch(`/api/monitoring/sessions?connection_id=${selectedConnectionId}`)
          if (!response.ok) return { data: [] }
          return response.json()
        },
        staleTime: 30 * 1000,
        retry: false,
      })
    } catch {
      // prefetch failure is silent
    }
  }, [queryClient, selectedConnectionId])

  const prefetchTopSQL = useCallback(async () => {
    if (!selectedConnectionId) return
    const cachedData = queryClient.getQueryData(['top-sql', selectedConnectionId, 'total_exec_time'])
    if (cachedData) return

    try {
      await queryClient.prefetchQuery({
        queryKey: ['top-sql', selectedConnectionId, 'total_exec_time'],
        queryFn: async () => {
          const params = new URLSearchParams({
            connection_id: selectedConnectionId,
            order_by: 'total_exec_time',
            limit: '100',
          })
          const response = await fetch(`/api/monitoring/sql-statistics?${params}`)
          if (!response.ok) return { data: [] }
          return response.json()
        },
        staleTime: 60 * 1000,
        retry: false,
      })
    } catch {
      // prefetch failure is silent
    }
  }, [queryClient, selectedConnectionId])

  const prefetchAll = useCallback(async () => {
    await Promise.all([
      prefetchMetrics(),
      prefetchDashboard(),
      prefetchSessions(),
      prefetchTopSQL(),
    ])
  }, [prefetchMetrics, prefetchDashboard, prefetchSessions, prefetchTopSQL])

  return {
    prefetchMetrics,
    prefetchDashboard,
    prefetchSessions,
    prefetchTopSQL,
    prefetchAll,
  }
}

export function useInitialPrefetch() {
  const { prefetchAll } = usePrefetchMonitoring()
  const { selectedConnectionId } = useSelectedDatabase()

  useEffect(() => {
    if (selectedConnectionId) {
      const timer = setTimeout(() => {
        prefetchAll()
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [selectedConnectionId, prefetchAll])
}
