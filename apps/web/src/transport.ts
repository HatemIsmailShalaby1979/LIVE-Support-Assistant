/**
 * The transport that actually delivers telemetry.
 *
 * Until this existed, `TelemetryQueue` was a durable dead end: it retained
 * query text and escalation evidence in localStorage, correctly, and the client
 * never had any way to send it. The queue's whole reason to exist is the flush,
 * and there was nothing to flush into.
 *
 * The functions it calls are the write boundary from migration 0013 — they are
 * the only path to `telemetry_events` and `escalations`, they are SECURITY
 * DEFINER so row-level security cannot be talked around, and they check the
 * tenant from the JWT rather than from anything the caller supplies. That last
 * part is the point of routing through them at all: a client that could write
 * those tables directly could label its own telemetry with someone else's
 * tenant.
 *
 * Both calls are idempotent on their id, so a retry after a timeout cannot
 * duplicate an audit row. The queue's backoff and its ordering guarantee
 * (query events before the escalations that name them) are what make a retry
 * safe, and the ordering matters because the escalation trigger verifies the
 * event exists.
 */

import { APP_SCHEMA, supabase } from './supabase';
import type { EscalationRecord } from '@sop/core';
import type { QueryTelemetryEvent, Transport } from './telemetry';

export class SupabaseTransport implements Transport {
  async sendEvent(event: QueryTelemetryEvent): Promise<void> {
    const { error } = await supabase().schema(APP_SCHEMA).rpc('ingest_telemetry_event', {
      p_id: event.id,
      p_device_id: event.deviceId,
      p_user_pseudonym: event.userPseudonym,
      p_event_type: event.eventType,
      p_bundle_version: event.bundleVersion,
      p_occurred_at: event.occurredAt,
      p_payload: event.payload,
    });

    if (error) {
      throw new Error(`ingest_telemetry_event refused ${event.id}: ${error.message}`);
    }
  }

  async sendEscalation(record: EscalationRecord): Promise<void> {
    const { error } = await supabase().schema(APP_SCHEMA).rpc('ingest_escalation', {
      p_escalation_id: record.escalationId,
      p_query_event_id: record.queryEventId,
      p_query_occurred_at: record.queryOccurredAt,
      p_evidence: record.evidence,
    });

    if (error) {
      throw new Error(`ingest_escalation refused ${record.escalationId}: ${error.message}`);
    }
  }
}
