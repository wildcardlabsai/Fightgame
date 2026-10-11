/**
 * PLAIN-LANGUAGE HELP (Phase 7): one short entry per idea that changes a decision. Static text, public information only — it explains what the
 * game shows, never what is hidden. The UI renders these as collapsed "What does this mean?" notes next to the thing they explain.
 */
export type HelpTopic = 'record' | 'rating' | 'scouting' | 'contract' | 'matchup' | 'availability' | 'eventMoney' | 'forecast' | 'titles' | 'offers' | 'negotiation' | 'night'

export interface HelpEntry { title: string; what: string; why: string; next: string }

export const HELP: Record<HelpTopic, HelpEntry> = {
  record: {
    title: 'Fight records',
    what: 'A record reads wins-losses-draws (for example 12-2-1). It is public, and so is who a fighter beat.',
    why: 'A record shows experience and results, not quality: ten wins over weak opponents is not ten wins over good ones. It also decides eligibility for rankings and titles.',
    next: 'Read the record together with the scouting range and the level of the opposition before you match someone.',
  },
  rating: {
    title: 'Grades and ranges',
    what: 'A grade such as 56–62 is your best estimate of a fighter’s overall quality. The “~” mark means a rough guess from public information alone.',
    why: 'The real fight uses true abilities that you cannot see. A narrow range means you know more; a wide one means you are guessing.',
    next: 'Commission scouting reports on fighters you are serious about. Reports cost money, so spend them where a decision depends on it.',
  },
  scouting: {
    title: 'Scouting',
    what: 'Scouts study a fighter and report what they see. Deeper reports and better scouts narrow the range; a talent search finds fighters you have not heard of.',
    why: 'Signing or matching on a bad guess is the most expensive mistake a new promoter makes.',
    next: 'Start with a report on the fighter you would sign or fight. Your starting roster is already known to your own coach.',
  },
  contract: {
    title: 'Contracts',
    what: 'A contract fixes a weekly retainer, a guaranteed purse for each bout, a win bonus, a length, and a minimum number of fights a year that you must give them.',
    why: 'The retainer is paid every week whether or not the fighter boxes, so an idle signing is a standing cost. Fighters who are not kept busy leave or complain.',
    next: 'Only sign people you can actually book. Check Payroll for what you owe each week and which deals are ending soon.',
  },
  matchup: {
    title: 'A credible matchup',
    what: 'A good fight is two fit, available fighters of similar quality. Win chances and difficulty shown here come from your scouts’ opinions and public records.',
    why: 'An easy win builds a prospect slowly and sells few tickets; a mismatch the other way risks a loss and an injury. A fair fight with a name people know sells.',
    next: 'Pick an opponent whose range overlaps yours, check they are fit and free on the date, and agree the purse. Injured or already-booked fighters cannot be matched.',
  },
  availability: {
    title: 'Fit and free',
    what: 'A fighter can be booked when they are not injured, not already in a fight, and have had enough rest since their last bout.',
    why: 'Booking someone unavailable fails, or forces you to cancel and pay for it.',
    next: 'When your best fighter is injured, advance time, or put another fighter in the ring.',
  },
  eventMoney: {
    title: 'Where a show’s money goes',
    what: 'Income is tickets, sponsors and broadcast. Costs are the venue hire (paid up front), fighter purses, production, marketing and security.',
    why: 'Purses and the venue are committed before a single ticket is sold, so a show can lose money. Profit is whatever is left after the night.',
    next: 'Compare the forecast’s revenue range with the total costs. If the bad end of the range loses money you cannot afford, shrink the venue, the purses or the marketing.',
  },
  forecast: {
    title: 'The forecast',
    what: 'A range for attendance, gate and profit, built from public information such as the fighters’ popularity and the venue size.',
    why: 'It is a range, not a promise. The real number can fall outside it, and the range narrows as you promote more shows.',
    next: 'Look at the low end first: can the promotion survive it? The risk tag and advice cards summarise that.',
  },
  titles: {
    title: 'Titles and contenders',
    what: 'Sanctioning bodies keep rankings and set minimums (fights, wins and the level of opposition) for a fighter to challenge for a belt. Champions must defend against a mandatory challenger.',
    why: 'A belt makes a fighter and a show more valuable, but a fighter who is not yet credible is refused, however well they are doing.',
    next: 'The Titles screen shows what each of your fighters still lacks. Build the record first by matching them against better opposition.',
  },
  offers: {
    title: 'Fight offers and outside bookings',
    what: 'Rival promoters offer fights involving your fighters, either on your card or on theirs. On a rival’s card the show, the venue and the night belong to them.',
    why: 'An outside booking can pay and build a fighter without a venue risk to you, but you give up the gate and control of the card.',
    next: 'Open the offer, compare the terms with what the fighter is worth, then accept, counter or decline. It is optional.',
  },
  negotiation: {
    title: 'Negotiating',
    what: 'Each side makes offers and counter-offers. A fighter or promoter replies with what they would accept, and may walk away if you push too hard.',
    why: 'The terms you agree become your costs. A deal that looks cheap but breaks the fighter’s expectations may be refused.',
    next: 'Use the expected-terms guide, make a fair first offer, and keep an eye on the total commitment, not only the signing fee.',
  },
  night: {
    title: 'Fight night',
    what: 'On fight week you run the card. Each fight can be watched round by round, shown as key moments, or resolved quickly; the result is the same whichever you choose.',
    why: 'Results change records, popularity and standing, and finish the show’s accounts.',
    next: 'Ring the bell, use “Next fight” to move through the card, then read the show summary and end the event.',
  },
}
