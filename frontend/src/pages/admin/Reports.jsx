export default function Reports() {
  return (
    <>
      <div className="section-title">Reports & analytics</div>
      <p className="sub">Quick operational summary for management.</p>
      <div className="cards">
        <div className="metric">
          <div className="m-top">REVENUE ESTIMATE</div>
          <strong>₱248K</strong>
          <span className="trend">↑ 12.8% this month</span>
        </div>
        <div className="metric">
          <div className="m-top">LOAD FACTOR</div>
          <strong>78%</strong>
          <span className="trend">Healthy utilization</span>
        </div>
        <div className="metric">
          <div className="m-top">SAILINGS</div>
          <strong>126</strong>
          <span className="trend">This month</span>
        </div>
        <div className="metric">
          <div className="m-top">CANCELLATION</div>
          <strong>3.2%</strong>
          <span className="trend">↓ 1.1% improvement</span>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head">
          <h3>Management notes</h3>
          <span>System-generated demo report</span>
        </div>
        <p className="muted">
          Batangas–Calapan currently has the strongest booking volume. Keep additional capacity
          available during peak travel periods.
        </p>
      </div>
    </>
  );
}
