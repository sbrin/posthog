import { actions, connect, kea, path, reducers, selectors } from 'kea'

import { tracingDataLogic } from './tracingDataLogic'
import type { tracingSceneLogicType } from './tracingSceneLogicType'
import type { Span } from './types'

export const tracingSceneLogic = kea<tracingSceneLogicType>([
    path(['products', 'tracing', 'frontend', 'tracingSceneLogic']),

    connect({
        values: [tracingDataLogic, ['spans', 'spansLoading', 'sparklineData', 'sparklineRowsLoading']],
        actions: [tracingDataLogic, ['loadSpans']],
    }),

    actions({
        openTraceModal: (traceId: string) => ({ traceId }),
        closeTraceModal: true,
    }),

    reducers({
        selectedTraceId: [
            null as string | null,
            {
                openTraceModal: (_, { traceId }) => traceId,
                closeTraceModal: () => null,
            },
        ],
    }),

    selectors({
        traceSpans: [
            (s) => [s.spans, s.selectedTraceId],
            (spans: Span[], selectedTraceId: string | null): Span[] => {
                if (!selectedTraceId) {
                    return []
                }
                return spans.filter((s) => s.trace_id === selectedTraceId)
            },
        ],
        isTraceModalOpen: [
            (s) => [s.selectedTraceId],
            (selectedTraceId: string | null): boolean => selectedTraceId !== null,
        ],
    }),
])
