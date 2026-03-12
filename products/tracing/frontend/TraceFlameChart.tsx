import { useCallback, useMemo, useRef, useState } from 'react'

import { IconWarning } from '@posthog/icons'
import { LemonTag } from '@posthog/lemon-ui'

import { getSeriesColor } from 'lib/colors'
import { Tooltip } from 'lib/lemon-ui/Tooltip'

import type { Span } from './types'

interface TraceFlameChartProps {
    spans: Span[]
}

interface SpanNode {
    span: Span
    children: SpanNode[]
    depth: number
    isLastChild: boolean
    connectorLines: boolean[]
}

const SPAN_KIND_LABELS: Record<number, string> = {
    0: 'Unspecified',
    1: 'Internal',
    2: 'Server',
    3: 'Client',
    4: 'Producer',
    5: 'Consumer',
}

const STATUS_CODE_LABELS: Record<number, { label: string; type: 'success' | 'warning' | 'danger' | 'default' }> = {
    0: { label: 'Unset', type: 'default' },
    1: { label: 'OK', type: 'success' },
    2: { label: 'Error', type: 'danger' },
}

function buildSpanTree(spans: Span[]): SpanNode[] {
    const byId = new Map<string, SpanNode>()
    const roots: SpanNode[] = []

    for (const span of spans) {
        byId.set(span.span_id, { span, children: [], depth: 0, isLastChild: false, connectorLines: [] })
    }

    for (const node of byId.values()) {
        if (node.span.parent_span_id && byId.has(node.span.parent_span_id)) {
            const parent = byId.get(node.span.parent_span_id)!
            parent.children.push(node)
        } else {
            roots.push(node)
        }
    }

    function setDepths(nodes: SpanNode[], depth: number, parentConnectors: boolean[]): void {
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i]
            node.depth = depth
            node.isLastChild = i === nodes.length - 1
            node.connectorLines = [...parentConnectors]
            node.children.sort((a, b) => new Date(a.span.timestamp).getTime() - new Date(b.span.timestamp).getTime())
            setDepths(node.children, depth + 1, [...parentConnectors, !node.isLastChild])
        }
    }
    setDepths(roots, 0, [])

    return roots
}

function flattenTree(nodes: SpanNode[]): SpanNode[] {
    const result: SpanNode[] = []
    function walk(node: SpanNode): void {
        result.push(node)
        for (const child of node.children) {
            walk(child)
        }
    }
    for (const root of nodes) {
        walk(root)
    }
    return result
}

export function formatDuration(durationNano: number): string {
    const ms = durationNano / 1_000_000
    if (ms < 0.1) {
        return '<0.1ms'
    }
    if (ms < 1) {
        return `${ms.toFixed(1)}ms`
    }
    if (ms < 1000) {
        return `${ms.toFixed(1)}ms`
    }
    return `${(ms / 1000).toFixed(2)}s`
}

function buildServiceColorMap(spans: Span[]): Map<string, number> {
    const services = [...new Set(spans.map((s) => s.service_name))].sort()
    const map = new Map<string, number>()
    services.forEach((service, i) => map.set(service, i))
    return map
}

/** Generate evenly spaced tick marks for the timeline */
function getTimelineTicks(durationMs: number): number[] {
    if (durationMs <= 0) {
        return []
    }
    const targetTickCount = 5
    const rawInterval = durationMs / targetTickCount
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawInterval)))
    const niceIntervals = [1, 2, 5, 10]
    const interval = niceIntervals.find((n) => n * magnitude >= rawInterval)! * magnitude
    const ticks: number[] = []
    for (let t = interval; t < durationMs; t += interval) {
        ticks.push(t)
    }
    return ticks
}

const INDENT_PX = 16
const LABEL_WIDTH = 280
const ROW_HEIGHT = 32
const ERROR_COLOR = 'var(--danger)'

function TreeIndent({ node }: { node: SpanNode }): JSX.Element | null {
    if (node.depth === 0) {
        return null
    }

    return (
        <span className="flex shrink-0 items-stretch self-stretch">
            {node.connectorLines.slice(0, -1).map((hasContinuation, i) => (
                <span
                    key={i}
                    className="shrink-0"
                    // eslint-disable-next-line react/forbid-dom-props
                    style={{ width: INDENT_PX }}
                >
                    {hasContinuation && (
                        <span
                            className="block h-full border-l border-border-bold"
                            // eslint-disable-next-line react/forbid-dom-props
                            style={{ marginLeft: INDENT_PX / 2 }}
                        />
                    )}
                </span>
            ))}
            <span
                className="shrink-0 relative"
                // eslint-disable-next-line react/forbid-dom-props
                style={{ width: INDENT_PX }}
            >
                {/* Vertical line */}
                <span
                    className="absolute border-l border-border-bold"
                    // eslint-disable-next-line react/forbid-dom-props
                    style={{
                        left: INDENT_PX / 2,
                        top: 0,
                        bottom: node.isLastChild ? '50%' : 0,
                    }}
                />
                {/* Horizontal line */}
                <span
                    className="absolute border-t border-border-bold"
                    // eslint-disable-next-line react/forbid-dom-props
                    style={{
                        left: INDENT_PX / 2,
                        right: 0,
                        top: '50%',
                    }}
                />
            </span>
        </span>
    )
}

function SpanDetailPanel({ span }: { span: Span }): JSX.Element {
    const status = STATUS_CODE_LABELS[span.status_code] ?? { label: String(span.status_code), type: 'default' as const }
    const isError = span.status_code === 2

    return (
        <div className={`border-t bg-surface-primary px-4 py-3 text-xs ${isError ? 'border-l-2 border-l-danger' : ''}`}>
            <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
                <span className="text-muted font-medium">Service</span>
                <span className="font-mono">{span.service_name}</span>
                <span className="text-muted font-medium">Operation</span>
                <span className="font-mono">{span.name}</span>
                <span className="text-muted font-medium">Duration</span>
                <span className="font-mono">{formatDuration(span.duration_nano)}</span>
                <span className="text-muted font-medium">Kind</span>
                <span>{SPAN_KIND_LABELS[span.kind] ?? span.kind}</span>
                <span className="text-muted font-medium">Status</span>
                <span>
                    <LemonTag type={status.type} size="small">
                        {status.label}
                    </LemonTag>
                </span>
                <span className="text-muted font-medium">Span ID</span>
                <span className="font-mono">{span.span_id}</span>
                {span.parent_span_id && (
                    <>
                        <span className="text-muted font-medium">Parent ID</span>
                        <span className="font-mono">{span.parent_span_id}</span>
                    </>
                )}
                <span className="text-muted font-medium">Start</span>
                <span className="font-mono">{new Date(span.timestamp).toISOString()}</span>
                <span className="text-muted font-medium">End</span>
                <span className="font-mono">{new Date(span.end_time).toISOString()}</span>
            </div>
        </div>
    )
}

export function TraceFlameChart({ spans }: TraceFlameChartProps): JSX.Element {
    const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null)
    const [cursorPct, setCursorPct] = useState<number | null>(null)
    const timelineRef = useRef<HTMLDivElement>(null)
    const serviceColorMap = useMemo(() => buildServiceColorMap(spans), [spans])
    const tree = useMemo(() => buildSpanTree(spans), [spans])
    const flatSpans = useMemo(() => flattenTree(tree), [tree])

    const handleTimelineMouseMove = useCallback((e: React.MouseEvent) => {
        const container = timelineRef.current
        if (!container) {
            return
        }
        const rect = container.getBoundingClientRect()
        const x = e.clientX - rect.left
        const pct = Math.max(0, Math.min(100, (x / rect.width) * 100))
        setCursorPct(pct)
    }, [])

    const handleTimelineMouseLeave = useCallback(() => {
        setCursorPct(null)
    }, [])

    if (spans.length === 0) {
        return <div className="text-muted p-4">No spans in this trace</div>
    }

    const timestamps = spans.map((s) => new Date(s.timestamp).getTime())
    const endTimes = spans.map((s) => new Date(s.end_time).getTime())
    const traceStart = Math.min(...timestamps)
    const traceEnd = Math.max(...endTimes)
    const traceDurationMs = traceEnd - traceStart
    const ticks = getTimelineTicks(traceDurationMs)

    const cursorTimeMs = cursorPct !== null ? (cursorPct / 100) * traceDurationMs : null

    return (
        <div className="flex flex-col">
            {/* Timeline header */}
            <div className="flex border-b border-border sticky top-0 bg-surface-primary z-10">
                <div
                    className="shrink-0 text-xs font-medium text-muted px-2 flex items-center border-r border-border"
                    // eslint-disable-next-line react/forbid-dom-props
                    style={{ width: LABEL_WIDTH }}
                >
                    Span
                </div>
                <div
                    className="relative grow h-7"
                    ref={timelineRef}
                    onMouseMove={handleTimelineMouseMove}
                    onMouseLeave={handleTimelineMouseLeave}
                >
                    <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] text-muted">0ms</span>
                    {ticks.map((tickMs) => {
                        const pct = (tickMs / traceDurationMs) * 100
                        return (
                            <span
                                key={tickMs}
                                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-[10px] text-muted"
                                // eslint-disable-next-line react/forbid-dom-props
                                style={{ left: `${pct}%` }}
                            >
                                {formatDuration(tickMs * 1_000_000)}
                            </span>
                        )
                    })}
                    <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-muted">
                        {formatDuration(traceDurationMs * 1_000_000)}
                    </span>
                    {/* Cursor time label in header */}
                    {cursorPct !== null && cursorTimeMs !== null && (
                        <span
                            className="absolute bottom-0 -translate-x-1/2 text-[10px] font-mono font-medium text-primary-alt pointer-events-none"
                            // eslint-disable-next-line react/forbid-dom-props
                            style={{ left: `${cursorPct}%` }}
                        >
                            {formatDuration(cursorTimeMs * 1_000_000)}
                        </span>
                    )}
                </div>
            </div>

            {/* Span rows */}
            {flatSpans.map((node) => {
                const { span } = node
                const spanStart = new Date(span.timestamp).getTime()
                const spanEnd = new Date(span.end_time).getTime()
                const leftPct = traceDurationMs > 0 ? ((spanStart - traceStart) / traceDurationMs) * 100 : 0
                const widthPct =
                    traceDurationMs > 0 ? Math.max(((spanEnd - spanStart) / traceDurationMs) * 100, 0.3) : 100

                const isError = span.status_code === 2
                const seriesIndex = serviceColorMap.get(span.service_name) ?? 0
                const seriesColor = isError ? ERROR_COLOR : getSeriesColor(seriesIndex)
                const isSelected = selectedSpanId === span.uuid

                return (
                    <div key={span.uuid}>
                        <div
                            className={`flex items-stretch cursor-pointer transition-colors ${
                                isSelected ? 'bg-surface-primary-active' : 'hover:bg-surface-primary-hover'
                            }`}
                            // eslint-disable-next-line react/forbid-dom-props
                            style={{ minHeight: ROW_HEIGHT }}
                            onClick={() => setSelectedSpanId(isSelected ? null : span.uuid)}
                        >
                            {/* Label column */}
                            <div
                                className="shrink-0 flex items-center overflow-hidden border-r border-border px-2"
                                // eslint-disable-next-line react/forbid-dom-props
                                style={{ width: LABEL_WIDTH }}
                            >
                                <TreeIndent node={node} />
                                {isError && (
                                    <Tooltip title="This span has an error status">
                                        <IconWarning className="text-danger shrink-0 mr-1" fontSize={14} />
                                    </Tooltip>
                                )}
                                <Tooltip title={span.name}>
                                    <span
                                        className={`text-xs truncate ${isError ? 'text-danger font-semibold' : 'font-medium'}`}
                                    >
                                        {span.name}
                                    </span>
                                </Tooltip>
                            </div>

                            {/* Timeline column */}
                            <div
                                className="relative grow self-center"
                                // eslint-disable-next-line react/forbid-dom-props
                                style={{ height: ROW_HEIGHT - 8 }}
                                onMouseMove={handleTimelineMouseMove}
                                onMouseLeave={handleTimelineMouseLeave}
                            >
                                {/* Grid lines */}
                                {ticks.map((tickMs) => {
                                    const pct = (tickMs / traceDurationMs) * 100
                                    return (
                                        <span
                                            key={tickMs}
                                            className="absolute top-0 bottom-0 border-l border-border"
                                            // eslint-disable-next-line react/forbid-dom-props
                                            style={{ left: `${pct}%` }}
                                        />
                                    )
                                })}

                                {/* Cursor line */}
                                {cursorPct !== null && (
                                    <span
                                        className="absolute top-0 bottom-0 border-l border-primary-alt pointer-events-none z-10"
                                        // eslint-disable-next-line react/forbid-dom-props
                                        style={{ left: `${cursorPct}%` }}
                                    />
                                )}

                                {/* Span bar */}
                                <Tooltip
                                    title={
                                        <span>
                                            <strong>{span.name}</strong>
                                            <br />
                                            {span.service_name} · {formatDuration(span.duration_nano)}
                                            {isError ? ' · Error' : ''}
                                        </span>
                                    }
                                >
                                    <div
                                        className="absolute h-full rounded-sm flex items-center px-1.5 overflow-hidden"
                                        // eslint-disable-next-line react/forbid-dom-props
                                        style={{
                                            left: `${leftPct}%`,
                                            width: `${widthPct}%`,
                                            minWidth: 4,
                                            backgroundColor: `color-mix(in srgb, ${seriesColor} 20%, transparent)`,
                                            borderLeft: `2px solid ${seriesColor}`,
                                        }}
                                    >
                                        <span className="text-[11px] truncate whitespace-nowrap flex items-center gap-1.5">
                                            <span className="text-muted-alt font-medium">{span.service_name}</span>
                                            <span className="text-muted">{formatDuration(span.duration_nano)}</span>
                                        </span>
                                    </div>
                                </Tooltip>
                            </div>
                        </div>

                        {/* Detail panel */}
                        {isSelected && <SpanDetailPanel span={span} />}
                    </div>
                )
            })}
        </div>
    )
}
