import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ATTENTION_STATES,
  STATE_LABELS,
  STATE_TINTS,
} from '@/lib/attention'
import { formatDayLabel, formatDurationLong } from '@/lib/time'
import type { DailySummary, LiveSession } from '@/types/app'
import { SectionCard } from './SectionCard'

interface StatsPanelProps {
  currentSession: LiveSession | null
  todaySummary: DailySummary
  dailyHistory: DailySummary[]
}

export function StatsPanel({
  currentSession,
  todaySummary,
  dailyHistory,
}: StatsPanelProps) {
  const chartTotals = currentSession?.totals ?? todaySummary.totals
  const pieData = ATTENTION_STATES.map((state) => ({
    name: STATE_LABELS[state],
    value: chartTotals[state],
    fill: STATE_TINTS[state],
  })).filter((item) => item.value > 0)

  const barData = dailyHistory
    .slice(0, 7)
    .reverse()
    .map((summary) => ({
      day: formatDayLabel(summary.date),
      tracked: Math.round(summary.trackedMs / 60000),
      focus: Math.round(summary.totals.ON_SCREEN / 60000),
      deskWork: Math.round(summary.totals.DESK_WORK / 60000),
    }))

  return (
    <SectionCard
      className="stats-card"
      title="Daily and session stats"
      subtitle="Today’s totals plus a state mix chart for the active view."
    >
      <div className="metric-grid">
        <article className="metric-tile">
          <span>Today tracked</span>
          <strong>{formatDurationLong(todaySummary.trackedMs)}</strong>
        </article>
        <article className="metric-tile">
          <span>Today on-screen</span>
          <strong>{formatDurationLong(todaySummary.totals.ON_SCREEN)}</strong>
        </article>
        <article className="metric-tile">
          <span>Today desk work</span>
          <strong>{formatDurationLong(todaySummary.totals.DESK_WORK)}</strong>
        </article>
        <article className="metric-tile">
          <span>Today away</span>
          <strong>{formatDurationLong(todaySummary.totals.AWAY)}</strong>
        </article>
      </div>

      <div className="chart-grid">
        <div className="chart-card">
          <p className="chart-card__label">
            {currentSession ? 'Current session mix' : 'Today state mix'}
          </p>
          <div className="chart-surface">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    innerRadius={48}
                    outerRadius={72}
                    paddingAngle={4}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) =>
                      formatDurationLong(typeof value === 'number' ? value : 0)
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-chart">
                Start tracking to populate the state distribution chart.
              </div>
            )}
          </div>
        </div>

        <div className="chart-card">
          <p className="chart-card__label">Last 7 days</p>
          <div className="chart-surface">
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={barData}>
                  <XAxis dataKey="day" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={42} />
                  <Tooltip />
                  <Bar dataKey="tracked" fill="#27473a" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-chart">
                Completed sessions will appear here as daily totals accumulate.
              </div>
            )}
          </div>
        </div>
      </div>
    </SectionCard>
  )
}
