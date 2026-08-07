export function WhistleblowerView() {
  return (
    <section className="view">
      <h1>Report</h1>
      <p>
        File an anonymous report. Evidence and identity stay local; only sealed
        hashes and a nullifier reach the ledger.
      </p>
      <p className="note">
        Contract wiring — still to be connected to <code>@phantomtrace/app</code>.
      </p>
    </section>
  );
}
