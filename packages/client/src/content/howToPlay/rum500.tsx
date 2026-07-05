// rules.md A.4 + plan.md "House rule picks > 500 Rummy"
import { t } from '../../theme/tokens';
import { variationAccent } from '../../theme/variations';

export default function Rum500Rules() {
  const h3Style: React.CSSProperties = {
    fontSize: 14,
    color: variationAccent('rum500'),
    marginBottom: 6,
    marginTop: 0,
  };
  const pStyle: React.CSSProperties = {
    fontSize: 13,
    lineHeight: 1.65,
    marginBottom: 16,
  };
  const ulStyle: React.CSSProperties = {
    fontSize: 13,
    lineHeight: 1.8,
    paddingLeft: 20,
    marginBottom: 16,
  };
  const olStyle: React.CSSProperties = {
    fontSize: 13,
    lineHeight: 1.8,
    paddingLeft: 20,
    marginBottom: 16,
  };

  return (
    <>
      <section>
        <h3 style={h3Style}>Objective</h3>
        <p style={pStyle}>
          Score points by placing high-value melds on the table and laying off onto existing melds. First player to reach{' '}
          <strong>500 cumulative points</strong> wins. Each hand scores <em>melded value − cards remaining in hand</em>, so dead
          cards count against you.
        </p>
      </section>

      <section>
        <h3 style={h3Style}>Turn flow</h3>
        <ol style={olStyle}>
          <li>
            <strong>Draw</strong> — top of stock, <em>or</em> from the discard pile in one of two ways:
            <ul style={{ marginTop: 4, marginBottom: 0 }}>
              <li>
                <strong>Top card only</strong>: takes just that card. You cannot discard it the same turn, but you don&apos;t have
                to play it.
              </li>
              <li>
                <strong>Pile dive</strong>: pick any card below the top — you must also take every card above it. The picked card
                must be melded or laid off before you discard. The rest are yours to use freely.
              </li>
            </ul>
          </li>
          <li>
            <strong>Meld &amp; lay off</strong> — place as many melds as you like, and lay off cards onto any meld on the table
            (yours or anyone&apos;s). Cards you lay off score for <em>you</em>, not the meld&apos;s owner.
          </li>
          <li>
            <strong>Discard</strong> — place one card face-up on the discard pile to end your turn. If you took the top discard
            card, you cannot discard it back this turn. If you did a pile dive, you must meld or lay off the picked card before
            discarding anything. You <strong>cannot play your last card</strong> — keep one card to discard, so you always go out on
            a discard.
          </li>
        </ol>
      </section>

      <section>
        <h3 style={h3Style}>Melds</h3>
        <ul style={ulStyle}>
          <li>
            <strong>Set</strong> — 3 or 4 cards of the same rank (suits don&apos;t have to differ).
          </li>
          <li>
            <strong>Run</strong> — 3 or more consecutive cards in the same suit. Ace may play at <em>either</em> end: A-2-3 or
            Q-K-A, but not both at once (K-A-2 is not allowed).
          </li>
        </ul>
      </section>

      <section>
        <h3 style={h3Style}>Scoring</h3>
        <table
          style={{
            fontSize: 13,
            borderCollapse: 'collapse',
            marginBottom: 10,
            width: '100%',
          }}
        >
          <tbody>
            {[
              ['Ace (in A-2-3 run)', '1 pt'],
              ['Ace (in set, Q-K-A run, or in hand)', '15 pts'],
              ['2 – 10', 'pip value'],
              ['J / Q / K', '10 pts each'],
            ].map(([label, val]) => (
              <tr key={label}>
                <td
                  style={{
                    padding: '3px 12px 3px 0',
                    color: t.text70,
                  }}
                >
                  {label}
                </td>
                <td style={{ padding: '3px 0', textAlign: 'right' }}>{val}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={pStyle}>
          A hand can score <strong>negative</strong> if your remaining-hand value exceeds the value of cards you melded or laid off.
        </p>
      </section>

      <section>
        <h3 style={h3Style}>House rules</h3>
        <p style={pStyle}>
          The host can enable house rules for this game variation when creating a room or in the lobby. Active deviations are
          listed under &ldquo;Table house rules&rdquo; below. Canonical defaults:
        </p>
        <ul style={{ ...ulStyle, marginBottom: 0 }}>
          <li>
            Deal: <strong>13 cards</strong> for 2 players (a house rule can make it 10), <strong>7 cards</strong> for 3 or more.
          </li>
          <li>Decks: 1 deck for up to 4 players, 2 decks for 5+. No jokers.</li>
          <li>
            Same-suit cards allowed in a set by default — the <em>Sets require distinct suits</em> house rule forbids them.
          </li>
          <li>
            Aces score 15, or 1 when melded in A–2–3 — house rules can make aces <strong>always 15</strong>, or score low cards
            (2–9) at <strong>5</strong>.
          </li>
          <li>
            Top-discard draw: cannot discard that card the same turn, and by default no meld is required — the <em>Unified draw
            obligation</em> house rule makes it must-use like a pile dive.
          </li>
          <li>
            <strong>No own-meld requirement</strong> — you can lay off onto anyone&apos;s meld immediately.
          </li>
          <li>
            Game target: <strong>500 cumulative points</strong>. If multiple players cross 500 in the same hand, highest score
            wins.
          </li>
        </ul>
      </section>
    </>
  );
}
