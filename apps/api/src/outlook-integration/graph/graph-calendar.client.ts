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
}
