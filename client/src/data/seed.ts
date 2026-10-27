import type { BudgetLine, EventType, Guest, Idea, PlanEvent, Task, Vendor, VendorStatus } from '../types';

// Swatch palette for idea cards (indices are stored on each idea).
export const SW = [
  'var(--color-accent-300)', 'var(--color-accent-500)', 'var(--color-accent-700)',
  'var(--color-accent-2-300)', 'var(--color-accent-2-500)', 'var(--color-accent-2-700)',
  'var(--color-neutral-300)', 'var(--color-neutral-700)',
];

/** Tasks the assistant suggests adding to the current phase when it is offline. */
export const AI_TASKS: Record<EventType, [string, string][]> = {
  wedding: [['Collect dietary needs with RSVPs', 'Nov 12'], ['Confirm vendor load-in times', 'Nov 18'], ['Draft a rain plan for the ceremony', 'Nov 22']],
  birthday: [['Send playlist form to guests', 'Oct 29'], ['Confirm rooftop heaters', 'Nov 3'], ['Arrange rides-home list', 'Nov 5']],
  community: [['Confirm step-free route for the map', 'Oct 27'], ['Book a first-aid volunteer', 'Oct 29'], ['Share parking map with vendors', 'Oct 31']],
};

/** Offline idea pool: [title, category, description, swatches]. */
export const POOL: Record<EventType, [string, string, string, number[]][]> = {
  wedding: [['Lantern walk send-off', 'Activities', 'Guests line the garden path with paper lanterns instead of sparklers, which the glasshouse does not allow.', [0, 3, 6, 2]], ['Bilingual welcome signs', 'Decor', 'Gujarati and English signage at the entrance and bar, hand-lettered on reclaimed wood.', [5, 6, 1, 3]], ['Grandparents’ first dance', 'Activities', 'Invite both sets of grandparents onto the floor for the second song.', [1, 4, 6, 0]]],
  birthday: [['Forty-year mixtape', 'Activities', 'Each guest names one song from the year they met Leo; the DJ plays them in order after dinner.', [2, 7, 0, 5]], ['Coupe tower bar', 'Food', 'Champagne coupes on a mirrored tray with a sparkling and a zero-proof option.', [0, 6, 1, 3]], ['Then-and-now photo line', 'Decor', 'Prints of Leo from each decade clipped to a brass wire by the entrance.', [7, 1, 6, 4]]],
  community: [['Pumpkin weigh-off', 'Activities', 'Neighbors bring their biggest pumpkin; the winner picks next year’s festival theme.', [1, 4, 0, 6]], ['Maker map flyers', 'Decor', 'A one-page illustrated booth map on recycled stock that doubles as a coupon sheet.', [3, 6, 5, 0]], ['Soup-swap station', 'Food', 'Residents bring a pot, visitors pay $3 a tasting cup, proceeds go to the food bank.', [2, 0, 4, 6]]],
};

/** Vendor names offered when shortlisting offline. */
export const SHORT: Record<string, string[]> = {
  Florist: ['Fern & Field', 'Wildstem Co.', 'North Bloom'],
  Rentals: ['Hudson Rentals', 'Table & Linen Co.', 'Barnlight'],
  DJ: ['DJ Rosa Vee', 'Groove Theory', 'Spin Social'],
  Restrooms: ['CleanStop', 'Parkside Portables', 'FlushCo'],
  _: ['Harbor & Co.', 'Lumen Events', 'Cedar Hall'],
};

export const VCYCLE: VendorStatus[] = ['To find', 'Shortlisted', 'Contacted', 'Booked'];
export const GCYCLE: Guest['r'][] = ['Awaiting', 'Attending', 'Declined'];

const T = (t: string, due: string, done?: 1): Task => ({ t, due, done: !!done });
const B = (cat: string, alloc: number, spent: number): BudgetLine => ({ cat, alloc, spent });
const V = (cat: string, name: string, status: VendorStatus, cost: number, next: string): Vendor => ({ cat, name, status, cost, next });
const G = (n: string, p: number, r: Guest['r'], d: string, g: string): Guest => ({ n, p, r, d, g });
const I = (title: string, cat: string, desc: string, sw: number[]): Idea => ({ title, cat, desc, sw, saved: false });

type SeedEvent = Omit<PlanEvent, 'applied' | 'reminded' | 'chat'>;

export function seedEvents(): SeedEvent[] {
  return [
    {
      id: 'w1', type: 'wedding', typeLabel: 'Wedding', name: 'Shah–Okafor Wedding', client: 'Priya Shah & Daniel Okafor', host: 'Priya and Daniel', date: '2027-03-13', location: 'Glasshouse at Hollis Farm, Hudson Valley', guests: 140, vibe: 'Garden, candlelit, relaxed family-style dinner', currency: 'USD',
      budget: [B('Venue', 12000, 12000), B('Catering', 14500, 15660), B('Photography & film', 5200, 5200), B('Florals & decor', 4800, 1900), B('Music & entertainment', 3600, 3600), B('Attire & beauty', 3500, 2100), B('Stationery', 900, 640), B('Rentals', 2400, 0), B('Contingency', 1100, 0)],
      phases: [
        { label: 'Done', range: 'May – Sep', w: 40, tasks: [T('Set budget with Priya & Daniel', 'May 20', 1), T('Book venue', 'Jun 2', 1), T('Book photographer', 'Jul 14', 1), T('Send save-the-dates', 'Sep 9', 1)] },
        { label: '4–5 months out', range: 'Oct – Nov', w: 20, now: true, tasks: [T('Book officiant', 'Oct 10', 1), T('Menu tasting with Saffron Table', 'Nov 8'), T('Book florist', 'Nov 15'), T('Reserve hotel room block', 'Nov 20')] },
        { label: '3 months out', range: 'December', w: 13, tasks: [T('Order invitations', 'Dec 4'), T('Hair & makeup trial', 'Dec 12'), T('Plan rehearsal dinner', 'Dec 18')] },
        { label: '6–8 weeks out', range: 'Jan – Feb', w: 7, tasks: [T('Mail invitations', 'Jan 15'), T('Final dress fitting', 'Feb 6'), T('Confirm rentals', 'Feb 10')] },
        { label: 'Final two weeks', range: 'Mar 1 – 13', w: 1, tasks: [T('Final headcount to caterer', 'Mar 1'), T('Seating chart', 'Mar 5'), T('Run sheet to all vendors', 'Mar 8')] },
      ],
      vendors: [V('Venue', 'Glasshouse at Hollis Farm', 'Booked', 12000, 'Walkthrough Feb 20'), V('Catering', 'Saffron Table', 'Booked', 15660, 'Menu tasting Nov 8'), V('Photography & film', 'Ana Ruiz Studio', 'Booked', 5200, 'Shot list due Feb 1'), V('Music', 'The Low Notes', 'Booked', 3600, 'Send first-dance song'), V('Officiant', 'Rev. Mara Lind', 'Booked', 0, 'Ceremony draft Jan 10'), V('Florist', '—', 'To find', 0, 'Needed by Nov 15'), V('Hair & makeup', 'Glow Studio', 'Contacted', 1400, 'Awaiting quote'), V('Cake', 'Butter & Bloom', 'Shortlisted', 850, 'Tasting Nov 12'), V('Rentals', '—', 'To find', 0, 'Tables, linens, lounge')],
      guestList: [G('Asha & Raj Shah', 2, 'Attending', 'Vegetarian', 'Family · Priya'), G('Chidi Okafor', 1, 'Attending', '—', 'Family · Daniel'), G('Meera Iyer', 2, 'Awaiting', '—', 'Friends'), G('Tom & Lena Becker', 2, 'Attending', 'Gluten-free', 'Friends'), G('Grace Okafor', 3, 'Awaiting', 'One kid’s meal', 'Family · Daniel'), G('Nikhil Rao', 1, 'Declined', '—', 'Work'), G('Hannah Cole', 2, 'Attending', 'Vegan', 'Friends'), G('Samuel Adeyemi', 2, 'Awaiting', '—', 'Family · Daniel'), G('Priti Desai', 1, 'Attending', 'Nut allergy', 'Family · Priya'), G('Owen Park', 2, 'Awaiting', '—', 'Work')],
      base: { yes: 70, no: 8, wait: 44 },
      ideas: [I('Candlelit glasshouse', 'Theme', 'Pillar candles in hurricane glass along every table, with the overhead lights dimmed to 20% after dinner.', [0, 6, 2, 3]), I('Herb and citrus centerpieces', 'Decor', 'Potted rosemary and kumquats guests can take home, which also trims the florals line.', [3, 4, 0, 6]), I('Family-style mezze to start', 'Food', 'Shared platters before mains so both families mix at the table from the first course.', [1, 5, 6, 0]), I('Polaroid guestbook wall', 'Activities', 'Guests snap, sign and pin a print to a linen board that becomes the guestbook.', [6, 7, 3, 1]), I('Hanging dried florals', 'Decor', 'A dried-flower installation over the head table that the couple can keep.', [0, 1, 6, 4]), I('Late-night chai cart', 'Food', 'Masala chai and samosas at 10pm, a nod to Priya’s grandmother.', [2, 1, 6, 5])],
    },
    {
      id: 'b1', type: 'birthday', typeLabel: 'Birthday', name: 'Leo’s 40th', client: 'Sam Marín', host: 'Sam', date: '2026-12-05', location: 'The Foundry Rooftop, Chicago', guests: 60, vibe: '70s supper club, dressy, good music', currency: 'USD',
      budget: [B('Venue', 1800, 1800), B('Food & drinks', 2600, 2100), B('DJ', 700, 0), B('Decor', 450, 120), B('Cake & desserts', 300, 0), B('Photo booth', 350, 420), B('Invitations & favors', 200, 90), B('Contingency', 100, 0)],
      phases: [
        { label: 'Done', range: 'Sep – Oct', w: 10, tasks: [T('Pick venue', 'Sep 18', 1), T('Guest list with Sam', 'Sep 25', 1), T('Send invites', 'Oct 8', 1)] },
        { label: '4–6 weeks out', range: 'Oct 22 – Nov 6', w: 6, now: true, tasks: [T('Confirm menu & bar package', 'Oct 30'), T('Order cake', 'Nov 2'), T('Book DJ', 'Nov 6')] },
        { label: '2–3 weeks out', range: 'Nov 14 – 21', w: 3, tasks: [T('Decor shopping list', 'Nov 14'), T('Collect must-play songs', 'Nov 17'), T('Line up toasts', 'Nov 21')] },
        { label: 'Final week', range: 'Nov 28 – Dec 5', w: 1, tasks: [T('Final headcount', 'Nov 28'), T('Day-of run sheet', 'Dec 2'), T('Pick up cake', 'Dec 5')] },
      ],
      vendors: [V('Venue', 'The Foundry Rooftop', 'Booked', 1800, 'Deposit paid'), V('Catering & bar', 'Copper Pot', 'Booked', 2100, 'Confirm bar package'), V('DJ', '—', 'To find', 0, 'Needed by Nov 6'), V('Cake', 'Sugar & Rye', 'Contacted', 300, 'Quote pending'), V('Photo booth', 'SnapBox', 'Booked', 420, 'Choose backdrop'), V('Florals', 'Stem Studio', 'Shortlisted', 260, 'Moodboard sent')],
      guestList: [G('Sam Marín', 1, 'Attending', '—', 'Host'), G('Ava Chen', 2, 'Attending', 'Vegetarian', 'Friends'), G('Marcus Bell', 2, 'Awaiting', '—', 'Work'), G('Jo Patel', 1, 'Attending', '—', 'Friends'), G('Dev & Rina Kapoor', 2, 'Attending', 'Pescatarian', 'Friends'), G('Lucía Marín', 1, 'Attending', '—', 'Family'), G('Ben Ortiz', 2, 'Awaiting', '—', 'Friends'), G('Kate Murphy', 1, 'Declined', '—', 'Work'), G('Theo Grant', 2, 'Awaiting', '—', 'Friends'), G('Nora Silva', 1, 'Attending', 'Gluten-free', 'Family')],
      base: { yes: 28, no: 4, wait: 13 },
      ideas: [I('Velvet & brass supper club', 'Theme', 'Low lighting, velvet table runners and brass candlesticks; dress code “cocktail, 1975”.', [2, 0, 7, 1]), I('Disco-ball cocktail tables', 'Decor', 'Mini mirror balls as centerpieces, lit by a single pin spot each.', [6, 7, 0, 3]), I('Signature cocktail: The Forty', 'Food', 'Rye, amaro and orange, served on arrival with a zero-proof twin.', [1, 2, 6, 4]), I('Vinyl request wall', 'Activities', 'Guests clip a sleeve to the wall to request a song; Leo keeps the records.', [7, 6, 1, 5]), I('Retro menu cards', 'Decor', 'Typewritten menus on cream card, tucked into folded napkins.', [6, 0, 7, 3]), I('Decade photo props', 'Activities', 'Props from each decade of Leo’s life at the photo booth.', [0, 4, 1, 6])],
    },
    {
      id: 'c1', type: 'community', typeLabel: 'Community', name: 'Maple Street Block Festival', client: 'Maple Street Neighbors Assoc.', host: 'The Maple Street Neighbors', date: '2026-11-21', location: 'Maple St, 4th to 7th Ave', guests: 400, vibe: 'Family-friendly, local makers, low-waste', currency: 'USD',
      budget: [B('Permits & insurance', 1400, 1400), B('Stage & sound', 2200, 2200), B('Tents & tables', 1600, 1100), B('Food truck subsidy', 900, 0), B('Kids zone', 800, 450), B('Signage & print', 600, 680), B('Waste & recycling', 700, 300), B('Volunteer supplies', 500, 120), B('Contingency', 500, 0)],
      phases: [
        { label: 'Done', range: 'Aug – Oct', w: 12, tasks: [T('Street closure permit', 'Aug 30', 1), T('Liability insurance', 'Sep 12', 1), T('Book stage & sound', 'Sep 26', 1), T('Recruit volunteer leads', 'Oct 15', 1)] },
        { label: '3–4 weeks out', range: 'Oct 22 – Nov 1', w: 4, now: true, tasks: [T('Confirm food trucks', 'Oct 28'), T('Assign maker booths', 'Oct 30'), T('Volunteer shift schedule', 'Nov 1')] },
        { label: '1–2 weeks out', range: 'Nov 2 – 14', w: 2, tasks: [T('Print signage & maps', 'Nov 7'), T('Neighbor notice letters', 'Nov 7'), T('Waste station plan', 'Nov 12')] },
        { label: 'Festival week', range: 'Nov 15 – 21', w: 1, tasks: [T('Volunteer briefing', 'Nov 18'), T('Load-in plan', 'Nov 19'), T('Rain plan check', 'Nov 20')] },
      ],
      vendors: [V('Permits', 'City of Ashford', 'Booked', 1400, 'Post closure signs Nov 14'), V('Stage & sound', 'Northside Sound', 'Booked', 2200, 'Send band schedule'), V('Tents & tables', 'Parkway Party Rental', 'Booked', 1100, 'Load-in 6am'), V('Food trucks', '4 of 6 confirmed', 'Contacted', 0, 'Chase two trucks'), V('Kids zone', 'Bright Faces', 'Shortlisted', 450, 'Confirm hours'), V('Restrooms', '—', 'To find', 0, 'Need 6 units, 1 accessible'), V('Compost & recycling', 'GreenLoop', 'Contacted', 300, 'Agree station count')],
      guestList: [G('Rosa Delgado', 1, 'Attending', 'Has van for load-in', 'Volunteer lead'), G('Kwame Asante', 1, 'Attending', '—', 'Stage crew'), G('Lin Zhao', 2, 'Awaiting', 'Needs power', 'Maker booth'), G('The Patel family', 4, 'Attending', '—', 'Resident'), G('Eli Brooks', 1, 'Attending', '—', 'Kids zone'), G('Fatima Noor', 1, 'Awaiting', '—', 'Waste station'), G('Greg Holt', 2, 'Declined', '—', 'Resident'), G('June Park', 1, 'Attending', 'Needs power', 'Maker booth'), G('Omar Haddad', 3, 'Awaiting', 'Wheelchair access', 'Resident'), G('Sara Lind', 1, 'Attending', 'EMT certified', 'First aid')],
      base: { yes: 170, no: 11, wait: 202 },
      ideas: [I('Harvest lantern parade', 'Theme', 'Kids make lanterns in the afternoon; the parade at dusk closes the festival.', [0, 1, 6, 5]), I('Swap shop tent', 'Activities', 'Bring one thing, take one thing. Keeps leftovers out of the waste stream.', [3, 4, 6, 7]), I('Chili cook-off', 'Food', 'Six resident teams, $5 tasting cards, winner gets a block-party trophy.', [2, 1, 6, 0]), I('Reusable cup deposit', 'Decor', 'A $2 deposit on festival cups; returns drop at the waste station.', [4, 3, 6, 5]), I('Chalk mural block', 'Activities', 'One closed block of road becomes a kids’ chalk mural, photographed from the roof at 3pm.', [0, 3, 1, 6]), I('Local band stage map', 'Decor', 'Hand-drawn set times on a chalkboard by the stage and a matching print version.', [7, 6, 0, 4])],
    },
  ];
}
