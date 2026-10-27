/** Tag class for a vendor or RSVP status, matching the design. */
export function tagFor(status: string): string {
  if (status === 'Booked' || status === 'Fully paid' || status === 'Attending') return 'tag tag-accent-2';
  if (status === 'Contacted' || status === 'Advance paid' || status === 'Declined') return 'tag tag-accent';
  if (status === 'Shortlisted') return 'tag tag-outline';
  return 'tag tag-neutral';
}
