import { Injectable } from '@nestjs/common';
import { GraphHttp } from './graph-http';

export interface GraphEventInput {
  subject: string;
  body: { contentType: 'HTML'; content: string };
  start: { dateTime: string; timeZone: 'UTC' };
  end: { dateTime: string; timeZone: 'UTC' };
  location?: { displayName: string };
  categories: string[];
  showAs: 'busy';
  isReminderOn: boolean;
  reminderMinutesBeforeStart: number;
  transactionId?: string;
  isOnlineMeeting?: boolean;
  onlineMeetingProvider?: 'teamsForBusiness';
  attendees?: { emailAddress: { address: string }; type: 'required' }[];
}
export interface GraphEventResult { id: string; onlineMeeting?: { joinUrl?: string } | null }

export interface GraphEventChange { id: string; start?: Date; end?: Date; isCancelled?: boolean; removed?: boolean }
export interface GraphCalendarDelta { events: GraphEventChange[]; deltaLink?: string }
type DeltaPage = {
  value: { id: string; start?: { dateTime: string }; end?: { dateTime: string }; isCancelled?: boolean; '@removed'?: unknown }[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
};
// Graph returns UTC wall-clock without a zone suffix ("2026-10-14T03:00:00.0000000").
const asUtc = (v?: { dateTime: string }) => (v ? new Date(`${v.dateTime.replace(/Z$/, '')}Z`) : undefined);

@Injectable()
export class GraphCalendarClient {
  constructor(private http: GraphHttp) {}

  createEvent(token: string, input: GraphEventInput): Promise<GraphEventResult> {
    return this.http.request(token, '/me/events', { method: 'POST', body: JSON.stringify(input) });
  }

  updateEvent(token: string, graphEventId: string, input: Partial<GraphEventInput>): Promise<GraphEventResult> {
    const { transactionId: _ignored, ...patch } = input; // only valid on create
    return this.http.request(token, `/me/events/${encodeURIComponent(graphEventId)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  }

  async deleteEvent(token: string, graphEventId: string): Promise<void> {
    await this.http.request(token, `/me/events/${encodeURIComponent(graphEventId)}`, { method: 'DELETE' });
  }

  /** Follows nextLink pages to the final deltaLink. 410 Gone surfaces as GraphApiError (caller restarts the window). */
  async calendarViewDelta(token: string, from: { deltaLink: string } | { start: Date; end: Date }): Promise<GraphCalendarDelta> {
    let next: string | undefined =
      'deltaLink' in from
        ? from.deltaLink
        : `/me/calendarView/delta?startDateTime=${encodeURIComponent(from.start.toISOString())}&endDateTime=${encodeURIComponent(from.end.toISOString())}`;
    const events: GraphEventChange[] = [];
    let deltaLink: string | undefined;
    while (next) {
      const page: DeltaPage = await this.http.request(token, next, {
        headers: { Prefer: 'outlook.timezone="UTC", odata.maxpagesize=100' },
      });
      for (const e of page.value ?? []) {
        events.push({ id: e.id, start: asUtc(e.start), end: asUtc(e.end), isCancelled: e.isCancelled, removed: e['@removed'] !== undefined });
      }
      deltaLink = page['@odata.deltaLink'];
      next = page['@odata.nextLink'];
    }
    return { events, deltaLink };
  }
}
