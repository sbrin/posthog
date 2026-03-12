export interface Span {
    uuid: string
    trace_id: string
    span_id: string
    parent_span_id: string
    name: string
    kind: number
    service_name: string
    status_code: number
    timestamp: string
    end_time: string
    duration_nano: number
}
