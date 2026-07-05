// rules.md A.1 + plan.md "House rule picks > Basic Rummy"
import { t } from '../../theme/tokens';
import { variationAccent } from '../../theme/variations';

export default function BasicRules() {
  const h3Style: React.CSSProperties = {
    fontSize: 14,
    color: variationAccent('basic'),
    marginBottom: 6,
    marginTop: 0,
  };
  const pStyle: React.CSSProperties = { fontSize: 13, lineHeight: 1.65, marginBottom: 16 };
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
          Be the first to empty your hand by melding and discarding all your cards. The winner scores points equal to the total pip
          value of opponents&apos; unmelded cards. First player to reach <strong>100 cumulative points</strong> wins the game.
        </p>
      </section>

      <section>
        <h3 style={h3Style}>Turn flow</h3>
        <ol style={olStyle}>
          <li>
            <strong>Draw</strong> — take the top card from the stock pile, or take the top card from the discard pile.
          </li>
          <li>
            <strong>Meld / lay off</strong> (optional) — place as many melds as you like, and/or lay off cards onto any existing
            meld on the table.
          </li>
          <li>
            <strong>Discard</strong> — place one card face-up on the discard pile to end your turn.
          </li>
        </ol>
      </section>

      <section>
        <h3 style={h3Style}>Melds</h3>
        <ul style={ulStyle}>
          <li>
            <strong>Set</strong> — 3 or 4 cards of the same rank (e.g. 7♥ 7♦ 7♣).
          </li>
          <li>
            <strong>Run</strong> — 3 or more consecutive cards of the same suit (e.g. 4♠ 5♠ 6♠). Ace is <em>low only</em>: A–2–3 is
            valid; Q–K–A is not.
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
              ['Ace', '1 pt'],
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
          Going rummy — going out without having melded or laid off at any point during the hand — <strong>doubles</strong> your
          score for that hand.
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
            Ace is <strong>low only</strong> by default — the <em>Ace either end</em> and <em>Round the corner</em> house rules
            widen runs, and make unmelded aces worth 15.
          </li>
          <li>
            Going rummy bonus is <strong>score × 2</strong> by default — a house rule can make it a flat +10 instead.
          </li>
          <li>
            By default melds per turn are <strong>unlimited</strong> and laying off <strong>needs no prior meld</strong> — house
            rules can restrict both.
          </li>
          <li>
            Always in force: you <strong>cannot discard</strong> the card you drew from the discard pile on the same turn; game
            target is <strong>100 cumulative points</strong>.
          </li>
        </ul>
      </section>
    </>
  );
}
