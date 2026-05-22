// rules.md A.1 + plan.md "House rule picks > Basic Rummy"
export default function BasicRules() {
  const h3Style: React.CSSProperties = {
    fontSize: 14,
    color: "#7fd4ff",
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
          Be the first to empty your hand by melding and discarding all your
          cards. The winner scores points equal to the total pip value of
          opponents&apos; unmelded cards. First player to reach{" "}
          <strong>100 cumulative points</strong> wins the game.
        </p>
      </section>

      <section>
        <h3 style={h3Style}>Turn flow</h3>
        <ol style={olStyle}>
          <li>
            <strong>Draw</strong> — take the top card from the stock pile, or
            take the top card from the discard pile.
          </li>
          <li>
            <strong>Meld / lay off</strong> (optional) — place one meld from
            your hand, and/or lay off one card onto any existing meld on the
            table.
          </li>
          <li>
            <strong>Discard</strong> — place one card face-up on the discard
            pile to end your turn.
          </li>
        </ol>
      </section>

      <section>
        <h3 style={h3Style}>Melds</h3>
        <ul style={ulStyle}>
          <li>
            <strong>Set</strong> — 3 or 4 cards of the same rank (e.g. 7♥ 7♦
            7♣).
          </li>
          <li>
            <strong>Run</strong> — 3 or more consecutive cards of the same suit
            (e.g. 4♠ 5♠ 6♠). Ace is <em>low only</em>: A–2–3 is valid;
            Q–K–A is not.
          </li>
        </ul>
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
              ["Ace", "1 pt"],
              ["2 – 10", "pip value"],
              ["J / Q / K", "10 pts each"],
            ].map(([label, val]) => (
              <tr key={label}>
                <td
                  style={{
                    padding: "3px 12px 3px 0",
                    color: "rgba(255,255,255,0.7)",
                  }}
                >
                  {label}
                </td>
                <td style={{ padding: "3px 0", textAlign: "right" }}>{val}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={pStyle}>
          Going rummy — going out without having melded or laid off at any
          point during the hand — <strong>doubles</strong> your score for that
          hand.
        </p>
      </section>

      <section>
        <h3 style={h3Style}>House rules (locked)</h3>
        <ul style={{ ...ulStyle, marginBottom: 0 }}>
          <li>
            Ace is <strong>low only</strong> — A–2–3 valid; Q–K–A not valid.
          </li>
          <li>
            At most <strong>one meld per turn</strong>.
          </li>
          <li>
            Laying off requires at least <strong>one own meld</strong> already
            on the table.
          </li>
          <li>
            You <strong>cannot discard</strong> the card you drew from the
            discard pile on the same turn.
          </li>
          <li>
            Going rummy bonus is <strong>score × 2</strong> (not flat +10).
          </li>
          <li>
            Game target: <strong>100 cumulative points</strong>.
          </li>
        </ul>
      </section>
    </>
  );
}
