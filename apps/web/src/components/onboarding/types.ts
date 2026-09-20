export interface TourStep {
  /** CSS selector for the element to spotlight. Steps whose target isn't found are skipped. */
  selector: string;
  title: string;
  body: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}
