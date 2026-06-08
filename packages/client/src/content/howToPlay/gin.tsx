// rules.md A.2 + plan.md "House rule picks > Gin Rummy"
import { t } from "../../theme/tokens";
import { variationAccent } from "../../theme/variations";

export default function GinRules() {
  const h3Style: React.CSSProperties = {
    fontSize: 14,
    color: variationAccent("gin"),
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
  const noteStyle: React.CSSProperties = {
    fontSize: 12,
    color: t.text50,
    marginTop: -10,
    marginBottom: 16,
  };

  return (
    <>
      <section>
        <h3 style={h3Style}>Objective</h3>
        <p style={pStyle}>
          Be the first player to reach <strong>100 cumulative points</strong> across hands.
          Each hand ends when a player <strong>knocks</strong> — declaring their unmelded
          cards (deadwood) total 10 points or less. Clearing all deadwood is called{" "}
          <strong>Gin</strong> and earns a bonus.
        </p>
      </section>

      <section>
        <h3 style={h3Style}>Setup</h3>
        <p style={pStyle}>
          2 players. Each is dealt <strong>10 cards</strong>. The 21st card is turned
          face-up to start the discard pile; the remaining cards form the stock.
          The non-dealer is offered the upcard first.
        </p>
      </section>

      <section>
        <h3 style={h3Style}>Opening Upcard Offer</h3>
        <p style={{ ...pStyle, marginBottom: 6 }}>
          Before the first draw, both players get a chance to take the face-up upcard:
        </p>
        <ol style={olStyle}>
          <li>
            <strong>Non-dealer</strong> may take the upcard or pass.
          </li>
          <li>
            If the non-dealer passes, <strong>dealer</strong> may take it or pass.
          </li>
          <li>
            If both pass, the non-dealer draws normally from the stock and play begins.
          </li>
        </ol>
        <p style={noteStyle}>
          Taking the upcard counts as your draw for that turn. After taking it you proceed
          directly to discard-or-knock.
        </p>
      </section>

      <section>
        <h3 style={h3Style}>Turn Flow</h3>
        <ol style={olStyle}>
          <li>
            <strong>Draw</strong> — take the top card from the stock or the top discard.
            You cannot re-discard a card drawn from the discard pile on the same turn.
          </li>
          <li>
            <strong>Discard or Knock</strong> — discard one card to end your turn,
            or knock if your deadwood is 10 or less.
          </li>
        </ol>
        <p style={noteStyle}>
          No melding during the turn. Melds are revealed only when you knock or go gin.
        </p>
      </section>

      <section>
        <h3 style={h3Style}>Melds</h3>
        <ul style={ulStyle}>
          <li>
            <strong>Set</strong> — 3 or 4 cards of the same rank (e.g. 7♥ 7♦ 7♣).
          </li>
          <li>
            <strong>Run</strong> — 3 or more consecutive cards of the same suit
            (e.g. 4♠ 5♠ 6♠). Ace is <em>low only</em>: A–2–3 is valid; Q–K–A is not.
          </li>
        </ul>
      </section>

      <section>
        <h3 style={h3Style}>Knocking</h3>
        <p style={{ ...pStyle, marginBottom: 6 }}>
          After drawing, if your deadwood (unmelded card total) is{" "}
          <strong>10 or less</strong>, you may knock. Declare your meld groups, then
          discard one card face-down to signal the knock.
        </p>
        <ul style={ulStyle}>
          <li>
            <strong>Gin</strong> (0 deadwood) — discard face-down. Your opponent
            still arranges their own sets and runs to reduce their deadwood, but
            <strong> cannot lay off</strong> onto your melds.
          </li>
          <li>
            <strong>Regular knock</strong> (1–10 deadwood) — discard face-down;
            opponent may lay off cards onto your declared melds before scores are counted.
          </li>
        </ul>
      </section>

      <section>
        <h3 style={h3Style}>After a knock — the defender's turn</h3>
        <p style={pStyle}>
          After <em>any</em> knock the <strong>defender</strong> arranges their own
          sets and runs; only the cards left over count as deadwood. After a{" "}
          <strong>regular</strong> knock (not gin) they may <em>also</em> extend the
          knocker's melds with cards from their hand — each card laid off reduces their
          deadwood further. The knocker cannot add to their own melds at this point.
          After <strong>gin</strong>, laying off onto the knocker is not allowed, but the
          defender still forms their own melds to keep their deadwood as low as possible.
        </p>
      </section>

      <section>
        <h3 style={h3Style}>Scoring</h3>
        <table
          style={{
            fontSize: 13,
            borderCollapse: "collapse",
            marginBottom: 10,
            width: "100%",
          }}
        >
          <tbody>
            {[
              ["Gin (0 deadwood)", "knocker scores +20 + opponent's deadwood"],
              ["Regular knock", "knocker scores opponent's deadwood − knocker's deadwood"],
              ["Undercut", "defender scores (knocker's dw − defender's dw) + 10 bonus"],
              ["Box bonus", "+20 to the hand winner"],
            ].map(([label, val]) => (
              <tr key={label} style={{ verticalAlign: "top" }}>
                <td style={{ padding: "3px 12px 3px 0", color: t.text70, whiteSpace: "nowrap" }}>
                  {label}
                </td>
                <td style={{ padding: "3px 0" }}>{val}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={noteStyle}>
          Undercut occurs when the defender's deadwood (after layoff) is equal to or less
          than the knocker's deadwood. The tie favours the defender.
        </p>
      </section>

      <section>
        <h3 style={h3Style}>Card Values (Deadwood)</h3>
        <table
          style={{
            fontSize: 13,
            borderCollapse: "collapse",
            marginBottom: 16,
            width: "100%",
          }}
        >
          <tbody>
            {[
              ["Ace", "1 pt"],
              ["2 – 10", "pip value"],
              ["J, Q, K", "10 pts each"],
            ].map(([label, val]) => (
              <tr key={label}>
                <td style={{ padding: "3px 12px 3px 0", color: t.text70 }}>
                  {label}
                </td>
                <td style={{ padding: "3px 0", textAlign: "right" }}>{val}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3 style={h3Style}>Winning the Game</h3>
        <ul style={ulStyle}>
          <li>First player to reach <strong>100 cumulative points</strong> wins.</li>
          <li>Game winner earns a <strong>+100 game bonus</strong>.</li>
          <li>
            If the loser scored 0 points during the entire game, the winner also earns a{" "}
            <strong>+100 shutout bonus</strong>.
          </li>
        </ul>
        <p style={noteStyle}>
          The winner of each hand deals next; the loser plays first.
          If a hand is cancelled (stock runs low), the same dealer re-deals — no points
          are scored for that hand.
        </p>
      </section>

      <section>
        <h3 style={h3Style}>House rules (locked)</h3>
        <ul style={{ ...ulStyle, marginBottom: 0 }}>
          <li>Ace is <strong>low only</strong> — A–2–3 valid; Q–K–A not valid.</li>
          <li>
            You <strong>cannot discard</strong> the card you drew from the discard pile
            on the same turn.
          </li>
          <li>No mid-turn melding — melds are revealed only at knock time.</li>
          <li>Knock threshold: deadwood <strong>≤ 10</strong>.</li>
          <li>
            Layoff onto the knocker allowed after a regular knock; <strong>not</strong>{" "}
            after gin. (The defender forms their own melds either way.)
          </li>
          <li>Box bonus: <strong>+20</strong> per hand won.</li>
          <li>Game bonus: <strong>+100</strong> on reaching 100 cumulative points.</li>
          <li>Shutout bonus: <strong>+100</strong> (opponent scored 0 all game).</li>
          <li>
            Stock-depletion cancel: if the stock has ≤ 2 cards after a non-knock discard,
            the hand is cancelled — no scoring, same dealer re-deals.
          </li>
          <li>Game target: <strong>100 cumulative points</strong>.</li>
        </ul>
      </section>
    </>
  );
}
