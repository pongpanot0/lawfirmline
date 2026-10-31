import { emailSuggestionHours } from './email-time';

describe('emailSuggestionHours', () => {
  it.each([
    [0, 0],
    [1, 0.25],
    [2, 0.25],
    [3, 0.5],
    [5, 0.5],
    [6, 0.75],
    [7, 0.75],
    [15, 1.5], // ceil(15 × 0.1 / 0.25) in float is 7 quarters — must stay 6
  ])('%i sent emails → %f hours', (count, hours) => {
    expect(emailSuggestionHours(count)).toBe(hours);
  });
});
