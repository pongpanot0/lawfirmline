export interface OutlookCalendarItemDto {
  id: string;
  connectionId: string;
  mailboxAddress: string;
  subject: string | null;
  location: string | null;
  startAt: string;
  endAt: string;
  isAllDay: boolean;
  showAs: 'free' | 'tentative' | 'busy' | 'oof' | 'workingElsewhere' | 'unknown';
  webLink: string | null;
}

export interface OutlookCalendarItemsResponse {
  items: OutlookCalendarItemDto[];
  syncedAt: string | null;
}
